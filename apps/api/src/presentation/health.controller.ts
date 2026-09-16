import { Controller, Get, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CheckReadiness } from '../application/check-readiness';
class ChecksDto {
  @ApiProperty({ enum: ['up','down'] }) postgres!: string;
  @ApiProperty({ enum: ['up','down'] }) redis!: string;
}
class ReadinessDto {
  @ApiProperty({ enum: ['ok','degraded'] }) status!: string;
  @ApiProperty({ type: ChecksDto }) checks!: ChecksDto;
}
@ApiTags('Salud')
@Controller('health')
export class HealthController {
  constructor(private readonly readiness: CheckReadiness) {}
  @Get('live')
  @ApiOperation({ summary: 'Comprueba que el proceso responde' })
  @ApiOkResponse({ schema: { type:'object', properties:{ status:{type:'string',enum:['ok']} } } })
  live() { return { status: 'ok' }; }

  @Get('ready')
  @ApiOperation({ summary: 'Comprueba PostgreSQL restringido y Redis' })
  @ApiOkResponse({ type: ReadinessDto })
  @ApiResponse({ status:503, type: ReadinessDto, description:'Dependencia no disponible o rol PostgreSQL no permitido' })
  async ready(@Res({ passthrough:true }) response: Response) {
    const result = await this.readiness.execute();
    response.status(result.status === 'ok' ? 200 : 503);
    return result;
  }
}
@ApiTags('Sistema')
@Controller()
export class SystemController {
  @Get()
  @ApiOperation({ summary: 'Identificacion de la API base' })
  @ApiOkResponse({ schema:{type:'object',properties:{
    service:{type:'string'},version:{type:'string'},stage:{type:'string'},
  }} })
  info() { return { service:'essalud-ticket-api', version:'0.9.0', stage:'3.4' }; }
}
