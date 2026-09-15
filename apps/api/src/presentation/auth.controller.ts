import { Body, Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiProperty, ApiResponse, ApiSecurity, ApiTags } from "@nestjs/swagger";
import { IsString, Length, Matches } from "class-validator";
import { AuthenticateStaff } from "../application/authenticate-staff";
import { AccessRequest, AccessGuard, PermissionGuard, RequireAuthenticated, RequirePermission } from "./access.guard";
import { LOCAL_TICKETS, LocalTicketsConfig, LocalTicketsGuard } from "./local-tickets.guard";

class LoginDto {
  @ApiProperty({example:"tecnico.n1"}) @IsString() @Length(3,120) @Matches(/^[a-z0-9][a-z0-9._-]+$/) username!:string;
  @ApiProperty({format:"password"}) @IsString() @Length(12,100) password!:string;
}

@ApiTags("Acceso local")
@ApiSecurity("local-key")
@UseGuards(LocalTicketsGuard)
@Controller("auth")
export class AuthController {
  constructor(private readonly authenticate:AuthenticateStaff,@Inject(LOCAL_TICKETS) private readonly local:LocalTicketsConfig){}
  @Post("login")
  @ApiOperation({summary:"Iniciar una sesión firmada de demostración"})
  @ApiResponse({status:201,description:"Token breve y perfil autorizado"})
  @ApiResponse({status:401,description:"Credenciales inválidas"})
  login(@Req() request:AccessRequest,@Body() body:LoginDto){
    return this.authenticate.execute({redAsistencialId:this.local.redAsistencialId,userId:this.local.userId,requestId:request.requestId!},body.username,body.password);
  }
  @Get("me")
  @UseGuards(AccessGuard,PermissionGuard)
  @RequireAuthenticated()
  @RequirePermission("organization:read")
  @ApiSecurity("staff-session")
  @ApiOperation({summary:"Consultar la sesión autorizada"})
  me(@Req() request:AccessRequest){return request.principal;}
}
