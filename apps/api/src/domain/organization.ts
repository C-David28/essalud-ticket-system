import { AuthorizedContext } from "./access";

export type OrganizationArea = { areaId: string; code: string; name: string; active: boolean };
export type OrganizationLocation = {
  latitude: number; longitude: number; source: "CONFIGURED" | "NETWORK" | "GEOCODED";
};
export type OrganizationCenter = {
  centerId: string; code: string; name: string; type: string; active: boolean;
  location: OrganizationLocation | null;
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
