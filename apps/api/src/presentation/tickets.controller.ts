import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Tickets } from '../application/tickets';
import { CreateTicketDto, UpdateTicketDto, TicketQuery, TransitionTicketDto } from './tickets.dto';
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
  @Delete(':id') @HttpCode(204) @ApiOperation({summary:'Eliminar ticket; conservar su historial de auditoria'})
  @ApiResponse({status:204,description:'Eliminado'}) @ApiResponse({status:404,description:'Ticket inexistente o de otra red'})
  delete(@Req() req: Request,@Param('id',new ParseUUIDPipe()) id: string) { return this.tickets.delete(this.context(req),id); }
}
