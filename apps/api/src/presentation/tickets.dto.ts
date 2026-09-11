import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { ApiProperty, PartialType, PickType } from '@nestjs/swagger';
import { CATEGORIES, PRIORITIES } from '../domain/ticket';
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
export class TicketQuery {
  @ApiProperty({required:false,default:1,minimum:1,maximum:100000})
  @Type(()=>Number) @IsInt() @Min(1) @Max(100000) page: number = 1;
  @ApiProperty({required:false,default:20,minimum:1,maximum:100})
  @Type(()=>Number) @IsInt() @Min(1) @Max(100) pageSize: number = 20;
}

