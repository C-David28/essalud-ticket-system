export type OrganizationCatalog = {
  network: { networkId: string; code: string; name: string; active: boolean };
  centers: Array<{ centerId: string; code: string; name: string; type: string; active: boolean;
    areas: Array<{ areaId: string; code: string; name: string; active: boolean }> }>;
  roles: Array<{ roleId: string; code: string; name: string; description: string;
    scope: "PROPIO" | "SEDE" | "RED" | "NACIONAL"; active: boolean }>;
};

export async function getOrganizationCatalog(): Promise<OrganizationCatalog> {
  const response = await fetch("/api/organization", { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("No se pudo cargar la estructura organizacional.");
  return response.json();
}
