import { TicketRepository, TicketInput, TicketChanges, TicketFailure, TicketState, TicketEventBus, TicketEventType } from '../domain/ticket';
import { TenantContext } from '../domain/tenant-context';
export class Tickets {
  constructor(private readonly repository: TicketRepository,private readonly eventBus:TicketEventBus) {}
  private async changed<T extends {ticketId:string}>(context:TenantContext,type:TicketEventType,work:Promise<T>):Promise<T> {
    const result=await work;
    await this.eventBus.publish({version:1,eventId:context.requestId,type,redAsistencialId:context.redAsistencialId,
      ticketId:result.ticketId,occurredAt:new Date().toISOString()});
    return result;
  }
  create(context: TenantContext, input: TicketInput) {
    return this.changed(context,'ticket.created',this.repository.create(context,input));
  }
  list(context: TenantContext,page: number,pageSize: number) { return this.repository.list(context,page,pageSize); }
  get(context: TenantContext,id: string) { return this.repository.get(context,id); }
  update(context: TenantContext,id: string,input: TicketChanges) {
    if (Object.keys(input).length===0) throw new TicketFailure('INVALID');
    return this.changed(context,'ticket.updated',this.repository.update(context,id,input));
  }
  transition(context:TenantContext,id:string,state:TicketState,reason:string) {
    return this.changed(context,'ticket.state_changed',this.repository.transition(context,id,state,reason));
  }
  history(context:TenantContext,id:string) { return this.repository.history(context,id); }
  technicians(context:TenantContext) {return this.repository.technicians(context);}
  assign(context:TenantContext,id:string,technicianId:string,reason:string) {
    return this.changed(context,'ticket.assignment_changed',this.repository.assign(context,id,technicianId,reason));
  }
  autoAssign(context:TenantContext,id:string) {
    return this.changed(context,'ticket.assignment_changed',this.repository.autoAssign(context,id));
  }
  assignmentHistory(context:TenantContext,id:string) {return this.repository.assignmentHistory(context,id);}
  async delete(context: TenantContext,id: string) {
    await this.repository.delete(context,id);
    await this.eventBus.publish({version:1,eventId:context.requestId,type:'ticket.deleted',
      redAsistencialId:context.redAsistencialId,ticketId:id,occurredAt:new Date().toISOString()});
  }
  watch(context:TenantContext,listener:Parameters<TicketEventBus['subscribe']>[1]) {
    return this.eventBus.subscribe(context.redAsistencialId,listener);
  }
}
