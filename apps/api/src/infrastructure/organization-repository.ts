import { OrganizationCatalog, OrganizationRepository } from "../domain/organization";
import { TenantContext } from "../domain/tenant-context";
import { PrismaTenantUnitOfWork } from "./database";

export class PrismaOrganizationRepository implements OrganizationRepository {
  constructor(private readonly uow: PrismaTenantUnitOfWork) {}
  catalog(context: TenantContext): Promise<OrganizationCatalog> {
    return this.uow.run(context, async tx => {
      const network = await tx.redAsistencial.findUnique({
        where: { redAsistencialId: context.redAsistencialId },
        include: {
          centros: { orderBy: [{ nombre: "asc" }, { centroAsistencialId: "asc" }],
            include: { areas: { orderBy: [{ nombre: "asc" }, { areaId: "asc" }] } } },
          roles: { orderBy: [{ codigo: "asc" }, { roleId: "asc" }] },
        },
      });
      if (!network) throw new Error("Catálogo organizacional no disponible");
      return {
        network: { networkId: network.redAsistencialId, code: network.codigo, name: network.nombre, active: network.activo },
        centers: network.centros.map(center => ({
          centerId: center.centroAsistencialId, code: center.codigo, name: center.nombre,
          type: center.tipo, active: center.activo,
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
