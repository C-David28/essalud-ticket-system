export type AccessExperience = {
  id: "requester" | "technician" | "supervisor" | "administrator";
  label: string;
  access: "public" | "authenticated";
  purpose: string;
  capabilities: readonly string[];
};

export const ACCESS_EXPERIENCES: readonly AccessExperience[] = [
  {
    id: "requester",
    label: "Solicitante",
    access: "public",
    purpose: "Reportar una incidencia y consultar su seguimiento sin crear una cuenta.",
    capabilities: ["Crear una solicitud", "Conservar el código de atención", "Consultar solo su solicitud"],
  },
  {
    id: "technician",
    label: "Técnico N1 / N2",
    access: "authenticated",
    purpose: "Atender, actualizar y documentar tickets dentro de su alcance autorizado.",
    capabilities: ["Ver su cola de atención", "Cambiar estados", "Registrar asignaciones"],
  },
  {
    id: "supervisor",
    label: "Supervisor de red",
    access: "authenticated",
    purpose: "Coordinar la operación y consultar indicadores de las sedes permitidas.",
    capabilities: ["Supervisar carga", "Reasignar tickets", "Revisar trazabilidad"],
  },
  {
    id: "administrator",
    label: "Administrador GCTIC",
    access: "authenticated",
    purpose: "Administrar configuración institucional según permisos explícitos.",
    capabilities: ["Configurar catálogos", "Gestionar accesos", "Consultar alcance nacional"],
  },
] as const;

export const PUBLIC_PATHS = ["/portal", "/acceso"] as const;
export const STAFF_PATHS = ["/tecnico", "/organizacion"] as const;

export function isStaffExperience(pathname: string) {
  return STAFF_PATHS.some((path) => pathname === path || pathname.startsWith(path + "/"));
}

export function isPublicExperience(pathname: string) {
  return !isStaffExperience(pathname);
}
