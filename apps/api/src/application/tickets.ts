import { TicketRepository, TicketInput, TicketChanges, TicketFailure, TicketState, TicketEventBus, TicketEventType } from '../domain/ticket';
import { AuthorizedContext } from '../domain/access';
export class Tickets {
  constructor(private readonly repository: TicketRepository,private readonly eventBus:TicketEventBus) {}
  private async changed<T extends {ticketId:string;centroAsistencialId:string;solicitanteId:string}>(context:AuthorizedContext,type:TicketEventType,work:Promise<T>):Promise<T> {
    const result=await work;
    await this.eventBus.publish({version:1,eventId:context.requestId,type,redAsistencialId:context.redAsistencialId,
      ticketId:result.ticketId,centroAsistencialId:result.centroAsistencialId,solicitanteId:result.solicitanteId,occurredAt:new Date().toISOString()});
    return result;
  }
  create(context: AuthorizedContext, input: TicketInput) {
    return this.changed(context,'ticket.created',this.repository.create(context,input));
  }
  list(context: AuthorizedContext,page: number,pageSize: number) { return this.repository.list(context,page,pageSize); }
  get(context: AuthorizedContext,id: string) { return this.repository.get(context,id); }
  update(context: AuthorizedContext,id: string,input: TicketChanges) {
    if (Object.keys(input).length===0) throw new TicketFailure('INVALID');
    return this.changed(context,'ticket.updated',this.repository.update(context,id,input));
  }
  transition(context:AuthorizedContext,id:string,state:TicketState,reason:string) {
    return this.changed(context,'ticket.state_changed',this.repository.transition(context,id,state,reason));
  }
  history(context:AuthorizedContext,id:string) { return this.repository.history(context,id); }
  technicians(context:AuthorizedContext) {return this.repository.technicians(context);}
  assign(context:AuthorizedContext,id:string,technicianId:string,reason:string) {
    return this.changed(context,'ticket.assignment_changed',this.repository.assign(context,id,technicianId,reason));
  }
  autoAssign(context:AuthorizedContext,id:string) {
    return this.changed(context,'ticket.assignment_changed',this.repository.autoAssign(context,id));
  }
  assignmentHistory(context:AuthorizedContext,id:string) {return this.repository.assignmentHistory(context,id);}
  async delete(context: AuthorizedContext,id: string) {
    const ticket=await this.repository.get(context,id);
    await this.repository.delete(context,id);
    await this.eventBus.publish({version:1,eventId:context.requestId,type:'ticket.deleted',
      redAsistencialId:context.redAsistencialId,ticketId:id,centroAsistencialId:ticket.centroAsistencialId,
      solicitanteId:ticket.solicitanteId,occurredAt:new Date().toISOString()});
  }
  watch(context:AuthorizedContext,listener:Parameters<TicketEventBus['subscribe']>[1]) {
    return this.eventBus.subscribe(context.redAsistencialId,event=>{
      const allowed=context.principal.scope==='NACIONAL'||context.principal.scope==='RED'||
        (context.principal.scope==='SEDE'&&context.principal.centerIds.includes(event.centroAsistencialId))||
        (context.principal.scope==='PROPIO'&&event.solicitanteId===context.userId);
      if(allowed)listener(event);
    });
  }
}
