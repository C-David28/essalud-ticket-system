import { OrganizationCatalog, OrganizationLocation, OrganizationRepository } from "../domain/organization";
import { AuthorizedContext } from "../domain/access";
import { PrismaTenantUnitOfWork } from "./database";

export class PrismaOrganizationRepository implements OrganizationRepository {
  constructor(private readonly uow: PrismaTenantUnitOfWork) {}
  catalog(context: AuthorizedContext): Promise<OrganizationCatalog> {
    return this.uow.run(context, async tx => {
      const network = await tx.redAsistencial.findUnique({
        where: { redAsistencialId: context.redAsistencialId },
        include: {
          centros: { where:context.principal.scope==='SEDE'?{centroAsistencialId:{in:[...context.principal.centerIds]}}:undefined,
            orderBy: [{ nombre: "asc" }, { centroAsistencialId: "asc" }],
            include: { areas: { orderBy: [{ nombre: "asc" }, { areaId: "asc" }] } } },
          roles: { where:context.principal.scope==='SEDE'?{codigo:{in:[...context.principal.roles]}}:undefined,
            orderBy: [{ codigo: "asc" }, { roleId: "asc" }] },
        },
      });
      if (!network) throw new Error("Catálogo organizacional no disponible");
      return {
        network: { networkId: network.redAsistencialId, code: network.codigo, name: network.nombre, active: network.activo },
        centers: network.centros.map(center => ({
          centerId: center.centroAsistencialId, code: center.codigo, name: center.nombre,
          type: center.tipo, active: center.activo, address:center.address,
          location: center.latitude !== null && center.longitude !== null && center.locationSource !== null
            ? { latitude:Number(center.latitude), longitude:Number(center.longitude),
                source:center.locationSource as OrganizationLocation["source"],
                accuracy:center.locationAccuracy as OrganizationLocation["accuracy"] }
            : null,
          areas: center.areas.map(area => ({ areaId: area.areaId, code: area.codigo, name: area.nombre, active: area.activo })),
        })),
        roles: network.roles.map(role => ({
          roleId: role.roleId, code: role.codigo, name: role.nombre, description: role.descripcion,
          scope: role.alcance as OrganizationCatalog["roles"][number]["scope"], active: role.activo,
        })),
      };
    });
  }
}
