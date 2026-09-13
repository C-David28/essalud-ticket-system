import { PrismaTenantUnitOfWork } from './database';
import { TicketRepository, TicketInput, TicketChanges, TicketFailure, TicketState, TICKET_TRANSITIONS,
  Ticket, TicketPage, TicketTransition } from '../domain/ticket';
import type { SupportTechnician,TicketAssignment } from '../domain/ticket';
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
  technicians(context:TenantContext):Promise<SupportTechnician[]> {
    return this.run(context,async tx=>tx.$queryRaw<SupportTechnician[]>`
      SELECT s.tecnico_id AS "technicianId",s.nombre AS name,s.nivel AS level,
        s.capacidad_maxima::int AS "maxCapacity",count(t.ticket_id)::int AS "activeLoad",
        (s.capacidad_maxima-count(t.ticket_id))::int AS "availableCapacity"
      FROM app.tecnicos_soporte s
      LEFT JOIN app.tickets t ON t.red_asistencial_id=s.red_asistencial_id AND t.assigned_to=s.tecnico_id
        AND t.estado IN ('ABIERTO','EN_PROCESO','PENDIENTE')
      WHERE s.red_asistencial_id=${context.redAsistencialId}::uuid AND s.activo
      GROUP BY s.red_asistencial_id,s.tecnico_id,s.nombre,s.nivel,s.capacidad_maxima
      ORDER BY count(t.ticket_id),s.nombre,s.tecnico_id`);
  }
  private async assignmentLock(tx:Prisma.TransactionClient,context:TenantContext,id:string) {
    // Prisma no deserializa el tipo PostgreSQL void; el cast conserva el bloqueo y devuelve un escalar soportado.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${context.redAsistencialId},2404))::text AS acquired`;
    const rows=await tx.$queryRaw<Array<{estado:TicketState;assignedTo:string|null}>>`
      SELECT estado,assigned_to AS "assignedTo" FROM app.tickets
      WHERE red_asistencial_id=${context.redAsistencialId}::uuid AND ticket_id=${id}::uuid FOR UPDATE`;
    const ticket=rows[0];if(!ticket)throw new TicketFailure('NOT_FOUND');
    if(['RESUELTO','CERRADO'].includes(ticket.estado))throw new TicketFailure('CONFLICT');
    return ticket;
  }
  assign(context:TenantContext,id:string,technicianId:string,reason:string):Promise<Ticket> {
    return this.run(context,async tx=>{
      const ticket=await this.assignmentLock(tx,context,id);
      if(ticket.assignedTo===technicianId)throw new TicketFailure('CONFLICT');
      const candidates=await tx.$queryRaw<Array<{technicianId:string;activeLoad:number;maxCapacity:number}>>`
        SELECT s.tecnico_id AS "technicianId",count(t.ticket_id)::int AS "activeLoad",s.capacidad_maxima::int AS "maxCapacity"
        FROM app.tecnicos_soporte s LEFT JOIN app.tickets t
          ON t.red_asistencial_id=s.red_asistencial_id AND t.assigned_to=s.tecnico_id
          AND t.estado IN ('ABIERTO','EN_PROCESO','PENDIENTE') AND t.ticket_id<>${id}::uuid
        WHERE s.red_asistencial_id=${context.redAsistencialId}::uuid AND s.tecnico_id=${technicianId}::uuid AND s.activo
        GROUP BY s.red_asistencial_id,s.tecnico_id,s.capacidad_maxima`;
      const candidate=candidates[0];
      if(!candidate||candidate.activeLoad>=candidate.maxCapacity)throw new TicketFailure('CONFLICT');
      await tx.$queryRaw`SELECT set_config('app.ticket_assignment_reason',${reason},true)`;
      return tx.ticket.update({where:{redAsistencialId_ticketId:{redAsistencialId:context.redAsistencialId,ticketId:id}},
        data:{assignedTo:technicianId,assignmentMode:'MANUAL'}}) as unknown as Ticket;
    });
  }
  autoAssign(context:TenantContext,id:string):Promise<Ticket> {
    return this.run(context,async tx=>{
      const ticket=await this.assignmentLock(tx,context,id);
      if(ticket.assignedTo)throw new TicketFailure('CONFLICT');
      const candidates=await tx.$queryRaw<Array<{technicianId:string}>>`
        SELECT s.tecnico_id AS "technicianId" FROM app.tecnicos_soporte s
        LEFT JOIN app.tickets t ON t.red_asistencial_id=s.red_asistencial_id AND t.assigned_to=s.tecnico_id
          AND t.estado IN ('ABIERTO','EN_PROCESO','PENDIENTE')
        WHERE s.red_asistencial_id=${context.redAsistencialId}::uuid AND s.activo
        GROUP BY s.red_asistencial_id,s.tecnico_id,s.nombre,s.capacidad_maxima
        HAVING count(t.ticket_id)<s.capacidad_maxima
        ORDER BY count(t.ticket_id),s.nombre,s.tecnico_id LIMIT 1`;
      const candidate=candidates[0];if(!candidate)throw new TicketFailure('CONFLICT');
      const reason='Asignación automática por menor carga activa';
      await tx.$queryRaw`SELECT set_config('app.ticket_assignment_reason',${reason},true)`;
      return tx.ticket.update({where:{redAsistencialId_ticketId:{redAsistencialId:context.redAsistencialId,ticketId:id}},
        data:{assignedTo:candidate.technicianId,assignmentMode:'AUTOMATICA'}}) as unknown as Ticket;
    });
  }
  assignmentHistory(context:TenantContext,id:string):Promise<TicketAssignment[]> {
    return this.run(context,async tx=>{
      const ticket=await tx.ticket.findUnique({where:{redAsistencialId_ticketId:{redAsistencialId:context.redAsistencialId,ticketId:id}},select:{ticketId:true}});
      if(!ticket)throw new TicketFailure('NOT_FOUND');
      return tx.ticketAssignmentHistory.findMany({where:{redAsistencialId:context.redAsistencialId,ticketId:id},
        select:{assignmentId:true,ticketId:true,codigo:true,previousTechnicianId:true,newTechnicianId:true,
          assignmentMode:true,motivo:true,changedBy:true,requestId:true,changedAt:true},
        orderBy:[{changedAt:'asc'},{assignmentId:'asc'}]}) as unknown as TicketAssignment[];
    });
  }
  async delete(context: TenantContext,id: string) {
    await this.run(context,tx=>tx.ticket.delete({where:{redAsistencialId_ticketId:{redAsistencialId:context.redAsistencialId,ticketId:id}}}));
  }
}
