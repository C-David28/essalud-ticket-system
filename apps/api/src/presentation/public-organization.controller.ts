import { Controller, Get, Inject, Req, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiSecurity, ApiTags } from "@nestjs/swagger";
import { GetOrganizationCatalog } from "../application/get-organization-catalog";
import { LOCAL_TICKETS, LocalTicketsConfig, LocalTicketsGuard } from "./local-tickets.guard";
import { AccessGuard, AccessRequest } from "./access.guard";

@ApiTags("Organización pública de demostración")
@ApiSecurity("local-key")
@UseGuards(LocalTicketsGuard,AccessGuard)
@Controller("organization/public")
export class PublicOrganizationController {
  constructor(private readonly catalog:GetOrganizationCatalog,
    @Inject(LOCAL_TICKETS) private readonly local:LocalTicketsConfig) {}
  @Get()
  @ApiOperation({summary:"Listar sedes y áreas activas para registrar tickets de demostración"})
  async get(@Req() request:AccessRequest) {
    const principal=request.principal!;
    const catalog=await this.catalog.execute({redAsistencialId:this.local.redAsistencialId,
      userId:principal.userId,requestId:request.requestId!,principal});
    return {network:catalog.network,centers:catalog.centers.filter(center=>center.active).map(center=>({
      ...center,areas:center.areas.filter(area=>area.active),
    }))};
  }
}
