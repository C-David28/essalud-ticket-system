import type { DemoTicket, TicketDraft, TicketStatus } from "@/lib/demo-tickets";

type ApiTicket = {
  ticketId: string;
  codigo: string;
  titulo: string;
  descripcion: string;
  categoria: "SOPORTE" | "REDES" | "INFRAESTRUCTURA" | "BIOMEDICO";
  prioridad: "BAJA" | "MEDIA" | "ALTA" | "CRITICA";
  estado: "ABIERTO" | "EN_PROCESO" | "PENDIENTE" | "RESUELTO" | "CERRADO";
  createdAt: string;
  solicitanteId: string;
};

const categoryToApi = {
  "Soporte técnico": "SOPORTE",
  "Redes y conectividad": "REDES",
  Infraestructura: "INFRAESTRUCTURA",
  "Equipamiento biomédico": "BIOMEDICO",
} as const;
const categoryFromApi = Object.fromEntries(
  Object.entries(categoryToApi).map(([label, value]) => [value, label]),
) as Record<ApiTicket["categoria"], DemoTicket["category"]>;
const priorityToApi = { Baja: "BAJA", Media: "MEDIA", Alta: "ALTA", Crítica: "CRITICA" } as const;
const priorityFromApi = Object.fromEntries(
  Object.entries(priorityToApi).map(([label, value]) => [value, label]),
) as Record<ApiTicket["prioridad"], DemoTicket["priority"]>;
const statusToApi = {
  Abierto: "ABIERTO",
  "En Proceso": "EN_PROCESO",
  Pendiente: "PENDIENTE",
  Resuelto: "RESUELTO",
  Cerrado: "CERRADO",
} as const;
const statusFromApi = Object.fromEntries(
  Object.entries(statusToApi).map(([label, value]) => [value, label]),
) as Record<ApiTicket["estado"], TicketStatus>;

function mapTicket(ticket: ApiTicket): DemoTicket {
  return {
    ticketId: ticket.ticketId,
    id: ticket.codigo,
    title: ticket.titulo,
    description: ticket.descripcion,
    category: categoryFromApi[ticket.categoria],
    center: "Centro ficticio de pruebas",
    area: "Área ficticia de pruebas",
    priority: priorityFromApi[ticket.prioridad],
    status: statusFromApi[ticket.estado],
    createdAt: ticket.createdAt,
    requester: "solicitante-demo",
    assignee: null,
  };
}

async function api<T>(path = "", init?: RequestInit): Promise<T> {
  const response = await fetch("/api/tickets" + path, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    if (response.status === 409) throw new Error("La transición no está permitida desde el estado actual.");
    throw new Error("No se pudo completar la operación. Verifica que la API local esté disponible.");
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}

export async function listTickets(): Promise<DemoTicket[]> {
  const page = await api<{ items: ApiTicket[] }>("?page=1&pageSize=100");
  return page.items.map(mapTicket);
}
export async function createTicket(draft: TicketDraft): Promise<DemoTicket> {
  const result = await api<ApiTicket>("", {
    method: "POST",
    body: JSON.stringify({titulo:draft.title,descripcion:draft.description,
      categoria:categoryToApi[draft.category],prioridad:priorityToApi[draft.priority]}),
  });
  return mapTicket(result);
}
export async function transitionTicket(ticketId:string,status:TicketStatus,reason:string):Promise<DemoTicket> {
  const result=await api<ApiTicket>("/"+encodeURIComponent(ticketId)+"/estado",{
    method:"PATCH",body:JSON.stringify({estado:statusToApi[status],motivo:reason}),
  });
  return mapTicket(result);
}
