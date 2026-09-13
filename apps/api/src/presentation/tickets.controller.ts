import { Body, Controller, Delete, Get, HttpCode, Inject, MessageEvent, Param, ParseUUIDPipe, Patch, Post, Query, Req, Sse, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { interval, merge, Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { Tickets } from '../application/tickets';
import { AssignTicketDto,CreateTicketDto, UpdateTicketDto, TicketQuery, TransitionTicketDto } from './tickets.dto';
import { LOCAL_TICKETS, LocalTicketsConfig, LocalTicketsGuard } from './local-tickets.guard';
@ApiTags('Tickets locales')
@ApiSecurity('local-key')
@ApiResponse({status:401,description:'Clave local ausente o invalida'})
@ApiResponse({status:400,description:'Datos invalidos'})
@UseGuards(LocalTicketsGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: Tickets,@Inject(LOCAL_TICKETS) private readonly local: LocalTicketsConfig) {}
  private context(request: Request & {requestId?: string}) {
    return {redAsistencialId:this.local.redAsistencialId,userId:this.local.userId,requestId:request.requestId!};
  }
  @Post() @ApiOperation({summary:'Crear ticket con codigo generado por PostgreSQL'})
  @ApiResponse({status:201,description:'Ticket creado, incluidos ticketId y codigo'})
  create(@Req() req: Request,@Body() body: CreateTicketDto) { return this.tickets.create(this.context(req),body); }
  @Get() @ApiResponse({status:200,description:'items, page, pageSize y hasMore'})
  list(@Req() req: Request,@Query() query: TicketQuery) { return this.tickets.list(this.context(req),query.page,query.pageSize); }
  @Get('asignacion/tecnicos') @ApiOperation({summary:'Listar técnicos activos con carga y capacidad disponibles'})
  technicians(@Req() req:Request) {return this.tickets.technicians(this.context(req));}
  @Sse('events') @ApiOperation({summary:'Recibir cambios de tickets en tiempo real mediante SSE'})
  @ApiProduces('text/event-stream') @ApiResponse({status:200,description:'Flujo SSE aislado por red asistencial'})
  events(@Req() req:Request):Observable<MessageEvent> {
    const context=this.context(req);
    const changes=new Observable<MessageEvent>(subscriber=>this.tickets.watch(context,event=>subscriber.next({
      id:event.eventId,type:'ticket',retry:3000,data:{version:event.version,type:event.type,ticketId:event.ticketId,
        requestId:event.eventId,occurredAt:event.occurredAt},
    })));
    const heartbeat=interval(15000).pipe(map(()=>({type:'heartbeat',data:{occurredAt:new Date().toISOString()}})));
    return merge(of({type:'connected',retry:3000,data:{occurredAt:new Date().toISOString()}}),changes,heartbeat);
  }
  @Get(':id') @ApiResponse({status:404,description:'Ticket inexistente o de otra red'})
  get(@Req() req: Request,@Param('id',new ParseUUIDPipe()) id: string) { return this.tickets.get(this.context(req),id); }
  @Patch(':id') @ApiResponse({status:404,description:'Ticket inexistente o de otra red'})
  update(@Req() req: Request,@Param('id',new ParseUUIDPipe()) id: string,@Body() body: UpdateTicketDto) {
    return this.tickets.update(this.context(req),id,body);
  }
  @Patch(':id/estado') @ApiOperation({summary:'Aplicar una transicion valida de estado'})
  @ApiResponse({status:200,description:'Estado actualizado y auditado'})
  @ApiResponse({status:409,description:'Transicion no permitida desde el estado actual'})
  transition(@Req() req:Request,@Param('id',new ParseUUIDPipe()) id:string,@Body() body:TransitionTicketDto) {
    return this.tickets.transition(this.context(req),id,body.estado,body.motivo);
  }
  @Get(':id/estado/historial') @ApiOperation({summary:'Consultar historial inmutable de estados'})
  @ApiResponse({status:200,description:'Historial cronologico, incluida la apertura'})
  history(@Req() req:Request,@Param('id',new ParseUUIDPipe()) id:string) {
    return this.tickets.history(this.context(req),id);
  }
  @Patch(':id/asignacion') @ApiOperation({summary:'Asignar o reasignar manualmente un ticket activo'})
  @ApiResponse({status:200,description:'Asignación auditada'})
  @ApiResponse({status:409,description:'Técnico sin capacidad, repetido o ticket terminal'})
  assign(@Req() req:Request,@Param('id',new ParseUUIDPipe()) id:string,@Body() body:AssignTicketDto) {
    return this.tickets.assign(this.context(req),id,body.tecnicoId,body.motivo);
  }
  @Post(':id/asignacion/automatica') @HttpCode(200)
  @ApiOperation({summary:'Asignar al técnico activo con menor carga'})
  @ApiResponse({status:200,description:'Asignación automática auditada'})
  @ApiResponse({status:409,description:'Ticket ya asignado, terminal o sin capacidad disponible'})
  autoAssign(@Req() req:Request,@Param('id',new ParseUUIDPipe()) id:string) {
    return this.tickets.autoAssign(this.context(req),id);
  }
  @Get(':id/asignacion/historial') @ApiOperation({summary:'Consultar historial inmutable de asignaciones'})
  assignmentHistory(@Req() req:Request,@Param('id',new ParseUUIDPipe()) id:string) {
    return this.tickets.assignmentHistory(this.context(req),id);
  }
  @Delete(':id') @HttpCode(204) @ApiOperation({summary:'Eliminar ticket; conservar su historial de auditoria'})
  @ApiResponse({status:204,description:'Eliminado'}) @ApiResponse({status:404,description:'Ticket inexistente o de otra red'})
  delete(@Req() req: Request,@Param('id',new ParseUUIDPipe()) id: string) { return this.tickets.delete(this.context(req),id); }
}
