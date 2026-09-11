// Datos ficticios para maquetacion. No representan registros ni identidades institucionales.
export const STATUSES = [
  "Abierto",
  "En Proceso",
  "Pendiente",
  "Resuelto",
  "Cerrado",
] as const;
export const PRIORITIES = ["Crítica", "Alta", "Media", "Baja"] as const;
export const CATEGORIES = [
  "Soporte técnico",
  "Redes y conectividad",
  "Infraestructura",
  "Equipamiento biomédico",
] as const;
export const CENTERS = [
  "Centro ficticio de pruebas",
  "Hospital II Pasco",
  "CAP Villa Rica",
  "Centro de Oxapampa",
] as const;
export type TicketStatus = (typeof STATUSES)[number];
export type Category = (typeof CATEGORIES)[number];
export type DemoTicket = {
  ticketId: string;
  id: string;
  title: string;
  description: string;
  category: Category;
  center: string;
  area: string;
  priority: (typeof PRIORITIES)[number];
  status: TicketStatus;
  createdAt: string;
  requester: string;
  assignee: string | null;
};
export type TicketDraft = Pick<
  DemoTicket,
  "title" | "description" | "category" | "center" | "area" | "priority"
>;
export const DEMO_USER = "solicitante-demo";
export const DEMO_TECH = "Técnico de prueba 01";
export const seedTickets: DemoTicket[] = [
  {
    ticketId: "00000000-0000-4000-8000-000000000001",
    id: "DEMO-001",
    title: "Impresora de admisión no responde",
    description:
      "La impresora de prueba aparece sin conexión. Se revisó el cable y se reinició el equipo sin cambios.",
    category: "Soporte técnico",
    center: CENTERS[0],
    area: "Admisión",
    priority: "Media",
    status: "Abierto",
    createdAt: "2026-09-08T13:30:00Z",
    requester: DEMO_USER,
    assignee: null,
  },
  {
    ticketId: "00000000-0000-4000-8000-000000000002",
    id: "DEMO-002",
    title: "Conexión intermitente en consultorios",
    description:
      "Escenario ficticio: la conexión de red se interrumpe en las estaciones de los consultorios.",
    category: "Redes y conectividad",
    center: CENTERS[0],
    area: "Consulta externa",
    priority: "Alta",
    status: "En Proceso",
    createdAt: "2026-09-08T12:45:00Z",
    requester: DEMO_USER,
    assignee: DEMO_TECH,
  },
  {
    ticketId: "00000000-0000-4000-8000-000000000003",
    id: "DEMO-003",
    title: "Revisión de monitor de signos vitales",
    description:
      "Escenario de demostración para solicitar la revisión programada de un equipo biomédico ficticio.",
    category: "Equipamiento biomédico",
    center: CENTERS[1],
    area: "Enfermería",
    priority: "Alta",
    status: "Abierto",
    createdAt: "2026-09-08T12:00:00Z",
    requester: "otro-solicitante-demo",
    assignee: null,
  },
  {
    ticketId: "00000000-0000-4000-8000-000000000004",
    id: "DEMO-004",
    title: "Punto de red sin conectividad",
    description:
      "Se requiere revisar un punto de red de ejemplo y documentar las comprobaciones realizadas.",
    category: "Redes y conectividad",
    center: CENTERS[2],
    area: "Administración",
    priority: "Media",
    status: "En Proceso",
    createdAt: "2026-09-07T20:00:00Z",
    requester: "otro-solicitante-demo",
    assignee: "Técnico de prueba 02",
  },
  {
    ticketId: "00000000-0000-4000-8000-000000000005",
    id: "DEMO-005",
    title: "Reposición de batería para UPS",
    description:
      "El escenario simula una revisión de UPS pendiente de un repuesto. No existe una orden de compra real.",
    category: "Infraestructura",
    center: CENTERS[0],
    area: "Centro de cómputo",
    priority: "Media",
    status: "Pendiente",
    createdAt: "2026-09-07T17:00:00Z",
    requester: "otro-solicitante-demo",
    assignee: DEMO_TECH,
  },
  {
    ticketId: "00000000-0000-4000-8000-000000000006",
    id: "DEMO-006",
    title: "Configuración de estación de trabajo",
    description:
      "Se completó la configuración de una estación ficticia para mostrar el estado resuelto en el portal.",
    category: "Soporte técnico",
    center: CENTERS[0],
    area: "Farmacia",
    priority: "Baja",
    status: "Resuelto",
    createdAt: "2026-09-06T15:00:00Z",
    requester: DEMO_USER,
    assignee: "Técnico de prueba 02",
  },
  {
    ticketId: "00000000-0000-4000-8000-000000000007",
    id: "DEMO-007",
    title: "Mantenimiento preventivo de equipo",
    description:
      "Solicitud ficticia cerrada para ilustrar el historial de atención. No contiene información de pacientes.",
    category: "Equipamiento biomédico",
    center: CENTERS[1],
    area: "Enfermería",
    priority: "Baja",
    status: "Cerrado",
    createdAt: "2026-09-05T16:00:00Z",
    requester: "otro-solicitante-demo",
    assignee: DEMO_TECH,
  },
];
export function initialTickets() {
  return seedTickets.map((t) => ({ ...t }));
}
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function filterTickets(
  tickets: DemoTicket[],
  filters: {
    search?: string;
    status?: string;
    center?: string;
    priority?: string;
    mine?: boolean;
    requester?: string;
  } = {},
) {
  return tickets.filter(
    (t) =>
      (!filters.search ||
        normalize(
          [t.id, t.title, t.center, t.area, t.category].join(" "),
        ).includes(normalize(filters.search.trim()))) &&
      (!filters.status || t.status === filters.status) &&
      (!filters.center || t.center === filters.center) &&
      (!filters.priority || t.priority === filters.priority) &&
      (!filters.mine || t.assignee === DEMO_TECH) &&
      (!filters.requester || t.requester === filters.requester),
  );
}
export function validateDraft(d: TicketDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (d.title.trim().length < 5 || d.title.trim().length > 120)
    errors.title = "Escribe un título de 5 a 120 caracteres.";
  if (d.description.trim().length < 20 || d.description.trim().length > 2000)
    errors.description = "Describe el problema en 20 a 2000 caracteres.";
  if (!CATEGORIES.includes(d.category))
    errors.category = "Selecciona una categoría.";
  if (!CENTERS.includes(d.center as (typeof CENTERS)[number]))
    errors.center = "Selecciona un centro de ejemplo.";
  if (d.area.trim().length < 2 || d.area.trim().length > 80)
    errors.area = "Indica el área en 2 a 80 caracteres.";
  if (!PRIORITIES.includes(d.priority))
    errors.priority = "Selecciona una prioridad.";
  return errors;
}
export function makeDemoTicket(
  draft: TicketDraft,
  id: string,
  date: string,
): DemoTicket {
  if (Object.keys(validateDraft(draft)).length)
    throw new Error("Solicitud de prueba inválida");
  return {
    ...draft,
    title: draft.title.trim(),
    description: draft.description.trim(),
    area: draft.area.trim(),
    id: "DEMO-" + id,
    ticketId: id,
    createdAt: date,
    status: "Abierto",
    requester: DEMO_USER,
    assignee: null,
  };
}
export function formatDate(date: string) {
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Lima",
  }).format(new Date(date));
}
