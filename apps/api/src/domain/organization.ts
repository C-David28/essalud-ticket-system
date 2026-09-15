import { AuthorizedContext } from "./access";

export type OrganizationArea = { areaId: string; code: string; name: string; active: boolean };
export type OrganizationCenter = {
  centerId: string; code: string; name: string; type: string; active: boolean;
  areas: OrganizationArea[];
};
export type InstitutionalRole = {
  roleId: string; code: string; name: string; description: string;
  scope: "PROPIO" | "SEDE" | "RED" | "NACIONAL"; active: boolean;
};
export type OrganizationCatalog = {
  network: { networkId: string; code: string; name: string; active: boolean };
  centers: OrganizationCenter[];
  roles: InstitutionalRole[];
};
export interface OrganizationRepository {
  catalog(context: AuthorizedContext): Promise<OrganizationCatalog>;
}
