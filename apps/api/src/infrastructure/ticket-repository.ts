import { PrismaTenantUnitOfWork } from './database';
import { TicketRepository, TicketInput, TicketChanges, TicketFailure } from '../domain/ticket';
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
  create(context: TenantContext,input: TicketInput) {
    return this.run(context,async tx=>{
      const area = await tx.area.findFirst({where:{redAsistencialId:context.redAsistencialId,
        centroAsistencialId:input.centroAsistencialId,areaId:input.areaId,activo:true,centro:{activo:true,red:{activo:true}}}});
      if(!area) throw new TicketFailure('INVALID');
      return tx.ticket.create({data:{...input,redAsistencialId:context.redAsistencialId}});
    });
  }
  list(context: TenantContext,page: number,pageSize: number) {
    return this.run(context,async tx=>{
      const rows=await tx.ticket.findMany({where:{redAsistencialId:context.redAsistencialId},
        orderBy:[{createdAt:'desc'},{ticketId:'desc'}],skip:(page-1)*pageSize,take:pageSize+1});
      return {items:rows.slice(0,pageSize),page,pageSize,hasMore:rows.length>pageSize};
    });
  }
  get(context: TenantContext,id: string) {
    return this.run(context,tx=>tx.ticket.findUniqueOrThrow({where:{redAsistencialId_ticketId:{redAsistencialId:context.redAsistencialId,ticketId:id}}}));
  }
  update(context: TenantContext,id: string,input: TicketChanges) {
    return this.run(context,tx=>tx.ticket.update({where:{redAsistencialId_ticketId:{redAsistencialId:context.redAsistencialId,ticketId:id}},data:input}));
  }
  async delete(context: TenantContext,id: string) {
    await this.run(context,tx=>tx.ticket.delete({where:{redAsistencialId_ticketId:{redAsistencialId:context.redAsistencialId,ticketId:id}}}));
  }
}

