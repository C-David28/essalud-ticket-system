import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, PartialType, PickType } from '@nestjs/swagger';
import { CATEGORIES, PRIORITIES, TICKET_STATES, TICKET_VIEWS, TicketListFilters } from '../domain/ticket';
const trim = ({value}: {value: unknown}) => typeof value==='string' ? value.trim() : value;
export class CreateTicketDto {
  @ApiProperty({format:'uuid'}) @IsUUID() centroAsistencialId!: string;
  @ApiProperty({format:'uuid'}) @IsUUID() areaId!: string;
  @ApiProperty({minLength:5,maxLength:200}) @Transform(trim) @IsString() @Length(5,200) titulo!: string;
  @ApiProperty({minLength:10,maxLength:5000}) @Transform(trim) @IsString() @Length(10,5000) descripcion!: string;
  @ApiProperty({enum:CATEGORIES}) @IsIn(CATEGORIES) categoria!: string;
  @ApiProperty({enum:PRIORITIES}) @IsIn(PRIORITIES) prioridad!: string;
}
export class UpdateTicketDto extends PartialType(PickType(CreateTicketDto,
  ['titulo','descripcion','categoria','prioridad'] as const),{skipNullProperties:false}) {}
export class TicketFilterQuery implements TicketListFilters {
  @ApiProperty({required:false,enum:TICKET_VIEWS,default:'all'})
  @IsIn(TICKET_VIEWS) view: TicketListFilters['view'] = 'all';
  @ApiProperty({required:false,maxLength:100,description:'Busqueda literal en codigo, titulo y descripcion'})
  @Transform(({value})=>{const result=trim({value});return result===''?undefined:result;})
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @ApiProperty({required:false,enum:TICKET_STATES}) @IsOptional() @IsIn(TICKET_STATES) estado?: TicketListFilters['estado'];
  @ApiProperty({required:false,enum:PRIORITIES}) @IsOptional() @IsIn(PRIORITIES) prioridad?: TicketListFilters['prioridad'];
  @ApiProperty({required:false,enum:CATEGORIES}) @IsOptional() @IsIn(CATEGORIES) categoria?: TicketListFilters['categoria'];
  @ApiProperty({required:false,format:'uuid'}) @IsOptional() @IsUUID() centroAsistencialId?: string;
}
export class TicketQuery extends TicketFilterQuery {
  @ApiProperty({required:false,default:1,minimum:1,maximum:100000})
  @Type(()=>Number) @IsInt() @Min(1) @Max(100000) page: number = 1;
  @ApiProperty({required:false,default:20,minimum:1,maximum:100})
  @Type(()=>Number) @IsInt() @Min(1) @Max(100) pageSize: number = 20;
}
export class TransitionTicketDto {
  @ApiProperty({enum:TICKET_STATES}) @IsIn(TICKET_STATES) estado!: typeof TICKET_STATES[number];
  @ApiProperty({minLength:5,maxLength:500}) @Transform(trim) @IsString() @Length(5,500) motivo!: string;
}
export class AssignTicketDto {
  @ApiProperty({format:'uuid'}) @IsUUID() tecnicoId!:string;
  @ApiProperty({minLength:5,maxLength:500}) @Transform(trim) @IsString() @Length(5,500) motivo!:string;
}
