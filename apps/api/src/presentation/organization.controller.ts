import { Controller, Get, Inject, Req, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { GetOrganizationCatalog } from "../application/get-organization-catalog";
import { LOCAL_TICKETS, LocalTicketsConfig, LocalTicketsGuard } from "./local-tickets.guard";

@ApiTags("Organización")
@ApiSecurity("local-key")
@ApiResponse({ status: 401, description: "Clave local ausente o inválida" })
@UseGuards(LocalTicketsGuard)
@Controller("organization")
export class OrganizationController {
  constructor(
    private readonly catalog: GetOrganizationCatalog,
    @Inject(LOCAL_TICKETS) private readonly local: LocalTicketsConfig,
  ) {}
  @Get()
  @ApiOperation({ summary: "Consultar la estructura organizacional del tenant activo" })
  @ApiResponse({ status: 200, description: "Red, sedes, áreas y roles configurados" })
  get(@Req() request: Request & { requestId?: string }) {
    return this.catalog.execute({
      redAsistencialId: this.local.redAsistencialId,
      userId: this.local.userId,
      requestId: request.requestId!,
    });
  }
}
