import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { SuggestCategory } from '../application/suggest-category';
import { LocalTicketsGuard } from './local-tickets.guard';
import { AccessGuard, PermissionGuard, RequirePermission } from './access.guard';
import { IsString, Length, ValidateBy } from 'class-validator';
import { Transform } from 'class-transformer';

const Utf8Text=()=>ValidateBy({name:'utf8Text',validator:{validate:(value:unknown)=>
  typeof value==='string' && Buffer.from(value,'utf8').toString('utf8')===value}});
const trim=({value}:{value:unknown})=>typeof value==='string'?value.trim():value;
// Explicit decorators preserve every constraint; overriding custom validation on
// a PickType subclass would hide inherited class-validator custom validators.
export class CategoryInputDto {
  @ApiProperty({minLength:5,maxLength:200}) @Transform(trim) @IsString() @Length(5,200) @Utf8Text() titulo!:string;
  @ApiProperty({minLength:10,maxLength:5000}) @Transform(trim) @IsString() @Length(10,5000) @Utf8Text() descripcion!:string;
}

@ApiTags('Clasificación asistida')
@ApiSecurity('local-key')
@UseGuards(LocalTicketsGuard,AccessGuard,PermissionGuard)
@Controller('ml')
export class CategoryAssistanceController {
  constructor(private readonly assistance:SuggestCategory) {}
  @Post('category-suggestion') @HttpCode(200)
  @RequirePermission('tickets:create')
  @ApiOperation({summary:'Solicitar categoría experimental sin crear un ticket; la decisión final es humana'})
  @ApiResponse({status:200,description:'suggested, abstained, disabled o unavailable; sin porcentaje de confianza'})
  @ApiResponse({status:400,description:'Solo título y descripción válidos'})
  @ApiResponse({status:401,description:'Clave de servidor o sesión inválida'})
  @ApiResponse({status:403,description:'Sin permiso para crear tickets'})
  suggest(@Body() input:CategoryInputDto) {
    // No identity, center, area, priority or operational data goes to the ML service.
    return this.assistance.execute({titulo:input.titulo,descripcion:input.descripcion});
  }
}
