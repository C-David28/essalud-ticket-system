import { Controller, Get, Inject, Req, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from "@nestjs/swagger";
import { GetOrganizationCatalog } from "../application/get-organization-catalog";
import { LOCAL_TICKETS, LocalTicketsConfig, LocalTicketsGuard } from "./local-tickets.guard";
import { AccessGuard, AccessRequest, PermissionGuard, RequireAuthenticated, RequirePermission } from "./access.guard";

@ApiTags("Organización")
@ApiSecurity("local-key")
@ApiResponse({ status: 401, description: "Clave local ausente o inválida" })
@UseGuards(LocalTicketsGuard,AccessGuard,PermissionGuard)
@RequireAuthenticated()
@RequirePermission("organization:read")
@ApiSecurity("staff-session")
@Controller("organization")
export class OrganizationController {
  constructor(
    private readonly catalog: GetOrganizationCatalog,
    @Inject(LOCAL_TICKETS) private readonly local: LocalTicketsConfig,
  ) {}
  @Get()
  @ApiOperation({ summary: "Consultar la estructura organizacional del tenant activo" })
  @ApiResponse({ status: 200, description: "Red, sedes, áreas y roles configurados" })
  get(@Req() request: AccessRequest) {
    const principal=request.principal!;
    return this.catalog.execute({
      redAsistencialId: this.local.redAsistencialId,
      userId: principal.userId,
      requestId: request.requestId!,
      principal,
    });
  }
}
