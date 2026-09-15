import { Body, Controller, Delete, Get, HttpCode, Inject, MessageEvent, Param, ParseUUIDPipe, Patch, Post, Query, Req, Sse, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { interval, merge, Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { Tickets } from '../application/tickets';
import { AssignTicketDto,CreateTicketDto, UpdateTicketDto, TicketQuery, TransitionTicketDto } from './tickets.dto';
import { LOCAL_TICKETS, LocalTicketsConfig, LocalTicketsGuard } from './local-tickets.guard';
import { AccessGuard,AccessRequest,PermissionGuard,RequirePermission } from './access.guard';
@ApiTags('Tickets locales')
@ApiSecurity('local-key')
@ApiResponse({status:401,description:'Clave local ausente o invalida'})
@ApiResponse({status:400,description:'Datos invalidos'})
@UseGuards(LocalTicketsGuard,AccessGuard,PermissionGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: Tickets,@Inject(LOCAL_TICKETS) private readonly local: LocalTicketsConfig) {}
  private context(request: AccessRequest) {
    const principal=request.principal!;
    return {redAsistencialId:this.local.redAsistencialId,userId:principal.userId,requestId:request.requestId!,principal};
  }
  @RequirePermission('tickets:create')
  @Post() @ApiOperation({summary:'Crear ticket con codigo generado por PostgreSQL'})
  @ApiResponse({status:201,description:'Ticket creado, incluidos ticketId y codigo'})
  create(@Req() req: AccessRequest,@Body() body: CreateTicketDto) { return this.tickets.create(this.context(req),body); }
  @RequirePermission('tickets:list')
  @Get() @ApiResponse({status:200,description:'items, page, pageSize y hasMore'})
  list(@Req() req: AccessRequest,@Query() query: TicketQuery) { return this.tickets.list(this.context(req),query.page,query.pageSize); }
  @RequirePermission('tickets:technicians')
  @Get('asignacion/tecnicos') @ApiOperation({summary:'Listar técnicos activos con carga y capacidad disponibles'})
  technicians(@Req() req:AccessRequest) {return this.tickets.technicians(this.context(req));}
  @RequirePermission('tickets:events')
  @Sse('events') @ApiOperation({summary:'Recibir cambios de tickets en tiempo real mediante SSE'})
  @ApiProduces('text/event-stream') @ApiResponse({status:200,description:'Flujo SSE aislado por red asistencial'})
  events(@Req() req:AccessRequest):Observable<MessageEvent> {
    const context=this.context(req);
    const changes=new Observable<MessageEvent>(subscriber=>this.tickets.watch(context,event=>subscriber.next({
      id:event.eventId,type:'ticket',retry:3000,data:{version:event.version,type:event.type,ticketId:event.ticketId,
        requestId:event.eventId,occurredAt:event.occurredAt},
    })));
    const heartbeat=interval(15000).pipe(map(()=>({type:'heartbeat',data:{occurredAt:new Date().toISOString()}})));
    return merge(of({type:'connected',retry:3000,data:{occurredAt:new Date().toISOString()}}),changes,heartbeat);
  }
  @RequirePermission('tickets:read')
  @Get(':id') @ApiResponse({status:404,description:'Ticket inexistente o de otra red'})
  get(@Req() req: AccessRequest,@Param('id',new ParseUUIDPipe()) id: string) { return this.tickets.get(this.context(req),id); }
  @RequirePermission('tickets:update')
  @Patch(':id') @ApiResponse({status:404,description:'Ticket inexistente o de otra red'})
  update(@Req() req: AccessRequest,@Param('id',new ParseUUIDPipe()) id: string,@Body() body: UpdateTicketDto) {
    return this.tickets.update(this.context(req),id,body);
  }
  @RequirePermission('tickets:transition')
  @Patch(':id/estado') @ApiOperation({summary:'Aplicar una transicion valida de estado'})
  @ApiResponse({status:200,description:'Estado actualizado y auditado'})
  @ApiResponse({status:409,description:'Transicion no permitida desde el estado actual'})
  transition(@Req() req:AccessRequest,@Param('id',new ParseUUIDPipe()) id:string,@Body() body:TransitionTicketDto) {
    return this.tickets.transition(this.context(req),id,body.estado,body.motivo);
  }
  @RequirePermission('tickets:history')
  @Get(':id/estado/historial') @ApiOperation({summary:'Consultar historial inmutable de estados'})
  @ApiResponse({status:200,description:'Historial cronologico, incluida la apertura'})
  history(@Req() req:AccessRequest,@Param('id',new ParseUUIDPipe()) id:string) {
    return this.tickets.history(this.context(req),id);
  }
  @RequirePermission('tickets:assign')
  @Patch(':id/asignacion') @ApiOperation({summary:'Asignar o reasignar manualmente un ticket activo'})
  @ApiResponse({status:200,description:'Asignación auditada'})
  @ApiResponse({status:409,description:'Técnico sin capacidad, repetido o ticket terminal'})
  assign(@Req() req:AccessRequest,@Param('id',new ParseUUIDPipe()) id:string,@Body() body:AssignTicketDto) {
    return this.tickets.assign(this.context(req),id,body.tecnicoId,body.motivo);
  }
  @RequirePermission('tickets:assign')
  @Post(':id/asignacion/automatica') @HttpCode(200)
  @ApiOperation({summary:'Asignar al técnico activo con menor carga'})
  @ApiResponse({status:200,description:'Asignación automática auditada'})
  @ApiResponse({status:409,description:'Ticket ya asignado, terminal o sin capacidad disponible'})
  autoAssign(@Req() req:AccessRequest,@Param('id',new ParseUUIDPipe()) id:string) {
    return this.tickets.autoAssign(this.context(req),id);
  }
  @RequirePermission('tickets:history')
  @Get(':id/asignacion/historial') @ApiOperation({summary:'Consultar historial inmutable de asignaciones'})
  assignmentHistory(@Req() req:AccessRequest,@Param('id',new ParseUUIDPipe()) id:string) {
    return this.tickets.assignmentHistory(this.context(req),id);
  }
  @RequirePermission('tickets:delete')
  @Delete(':id') @HttpCode(204) @ApiOperation({summary:'Eliminar ticket; conservar su historial de auditoria'})
  @ApiResponse({status:204,description:'Eliminado'}) @ApiResponse({status:404,description:'Ticket inexistente o de otra red'})
  delete(@Req() req: AccessRequest,@Param('id',new ParseUUIDPipe()) id: string) { return this.tickets.delete(this.context(req),id); }
}
