import { PrismaTenantUnitOfWork } from './database';
import { TicketRepository, TicketInput, TicketChanges, TicketFailure, TicketState, TICKET_TRANSITIONS,
  Ticket, TicketPage, TicketTransition } from '../domain/ticket';
import { TenantContext } from '../domain/tenant-context';
import { Prisma } from '../generated/prisma/client';
export class PrismaTicketRepository implements TicketRepository {
  constructor(private readonly uow: PrismaTenantUnitOfWork) {}
  private async run<T>(context: TenantContext, fn: (tx: Prisma.TransactionClient)=>Promise<T>): Promise<T> {
    try { return await this.uow.run(context,fn); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code==='P2025') throw new TicketFailure('NOT_FOUND');
        if (error.code==='P2003') throw new TicketFailure('INVALID');
        if (error.code==='P2002') throw new TicketFailure('CONFLICT');
      }
      throw error;
    }
  }
  create(context: TenantContext,input: TicketInput): Promise<Ticket> {
    return this.run(context,async tx=>{
      const area = await tx.area.findFirst({where:{redAsistencialId:context.redAsistencialId,
        centroAsistencialId:input.centroAsistencialId,areaId:input.areaId,activo:true,centro:{activo:true,red:{activo:true}}}});
      if(!area) throw new TicketFailure('INVALID');
      return tx.ticket.create({data:{...input,redAsistencialId:context.redAsistencialId}}) as unknown as Ticket;
    });
  }
  list(context: TenantContext,page: number,pageSize: number): Promise<TicketPage> {
    return this.run(context,async tx=>{
      const rows=await tx.ticket.findMany({where:{redAsistencialId:context.redAsistencialId},
        orderBy:[{createdAt:'desc'},{ticketId:'desc'}],skip:(page-1)*pageSize,take:pageSize+1});
      return {items:rows.slice(0,pageSize) as unknown as Ticket[],page,pageSize,hasMore:rows.length>pageSize};
    });
  }
  get(context: TenantContext,id: string): Promise<Ticket> {
    return this.run(context,async tx=>tx.ticket.findUniqueOrThrow({where:{redAsistencialId_ticketId:{redAsistencialId:context.redAsistencialId,ticketId:id}}}) as unknown as Ticket);
  }
  update(context: TenantContext,id: string,input: TicketChanges): Promise<Ticket> {
    return this.run(context,async tx=>tx.ticket.update({where:{redAsistencialId_ticketId:{redAsistencialId:context.redAsistencialId,ticketId:id}},data:input}) as unknown as Ticket);
  }
  transition(context:TenantContext,id:string,state:TicketState,reason:string): Promise<Ticket> {
    return this.run(context,async tx=>{
      const rows=await tx.$queryRaw<Array<{estado:TicketState}>>`
        SELECT estado FROM app.tickets
        WHERE red_asistencial_id=${context.redAsistencialId}::uuid AND ticket_id=${id}::uuid
        FOR UPDATE`;
      const current=rows[0]?.estado;
      if(!current) throw new TicketFailure('NOT_FOUND');
      if(!TICKET_TRANSITIONS[current].includes(state)) throw new TicketFailure('CONFLICT');
      await tx.$queryRaw`SELECT set_config('app.ticket_transition_reason',${reason},true)`;
      return tx.ticket.update({where:{redAsistencialId_ticketId:{redAsistencialId:context.redAsistencialId,ticketId:id}},
        data:{estado:state}}) as unknown as Ticket;
    });
  }
  history(context:TenantContext,id:string): Promise<TicketTransition[]> {
    return this.run(context,async tx=>{
      const ticket=await tx.ticket.findUnique({where:{redAsistencialId_ticketId:{redAsistencialId:context.redAsistencialId,ticketId:id}},select:{ticketId:true}});
      if(!ticket) throw new TicketFailure('NOT_FOUND');
      return tx.ticketStateTransition.findMany({where:{redAsistencialId:context.redAsistencialId,ticketId:id},
        select:{transitionId:true,ticketId:true,codigo:true,estadoAnterior:true,estadoNuevo:true,motivo:true,
          changedBy:true,requestId:true,changedAt:true},
        orderBy:[{changedAt:'asc'},{transitionId:'asc'}]}) as unknown as TicketTransition[];
    });
  }
  async delete(context: TenantContext,id: string) {
    await this.run(context,tx=>tx.ticket.delete({where:{redAsistencialId_ticketId:{redAsistencialId:context.redAsistencialId,ticketId:id}}}));
  }
}
