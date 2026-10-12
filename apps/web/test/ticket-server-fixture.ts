import { DEMO_USER, type DemoTicket } from "../src/lib/demo-tickets";
import { ticketStateKey, type TicketAudience, type TicketFilters, type TicketSummary } from "../src/lib/ticket-client";

// Simulate the server's authorization, filters and bounded page BEFORE returning data.
export function authorizedTickets(server: DemoTicket[], audience: TicketAudience = "staff") {
  return server.filter(ticket => audience !== "public" || ticket.requester === DEMO_USER);
}
export function filteredTickets(server: DemoTicket[], filters: TicketFilters = {}, audience: TicketAudience = "staff") {
  const search = filters.search?.trim().toLowerCase() ?? "";
  return authorizedTickets(server, audience).filter(ticket => {
    const historical = ticket.status === "Resuelto" || ticket.status === "Cerrado";
    return (filters.view !== "active" || !historical) && (filters.view !== "history" || historical) &&
      (!filters.status || ticket.status === filters.status) && (!filters.priority || ticket.priority === filters.priority) &&
      (!filters.category || ticket.category === filters.category) && (!filters.centerId || ticket.centerId === filters.centerId) &&
      (!search || [ticket.id, ticket.title, ticket.description].join(" ").toLowerCase().includes(search));
  });
}
export function serverPage(server: DemoTicket[], filters: TicketFilters = {}, page = 1, pageSize = 25, audience: TicketAudience = "staff") {
  const items = filteredTickets(server, filters, audience), start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize).map(ticket => ({ ...ticket })), page, pageSize, hasMore: start + pageSize < items.length };
}
export function serverSummary(server: DemoTicket[], filters: TicketFilters = {}, audience: TicketAudience = "staff"): TicketSummary {
  const items = filteredTickets(server, filters, audience);
  const byState = { ABIERTO: 0, EN_PROCESO: 0, PENDIENTE: 0, RESUELTO: 0, CERRADO: 0 };
  items.forEach(ticket => byState[ticketStateKey[ticket.status]]++);
  const priority = items.filter(ticket => ticket.priority === "Alta" || ticket.priority === "Crítica").length;
  const centers = [...new Set(items.map(ticket => ticket.centerId).filter((id): id is string => !!id))].map(centerId => {
    const summary = serverSummary(items.filter(ticket => ticket.centerId === centerId).map(ticket => ({ ...ticket, centerId: undefined })));
    return { centerId, total: summary.total, byState: summary.byState, priority: summary.priority };
  });
  return { total: items.length, active: byState.ABIERTO + byState.EN_PROCESO + byState.PENDIENTE,
    history: byState.RESUELTO + byState.CERRADO, byState, priority, centers };
}
