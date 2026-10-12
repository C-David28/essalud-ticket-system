"use client";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { assignTicket, autoAssignTicket, createTicket, getTicket, getTicketSummary, listTechnicians,
  listTicketPage, transitionTicket, type TicketFilters } from "@/lib/ticket-client";
import type { DemoTicket, TicketDraft, TicketStatus } from "@/lib/demo-tickets";
import type { StaffSession } from "@/lib/staff-session";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1 } } }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

export function ticketScope(session?: StaffSession): string {
  return session ? JSON.stringify(["staff", session.userId, session.redAsistencialId, session.scope,
    [...session.centerIds].sort(), [...session.roles].sort(), [...session.permissions].sort()]) : "public";
}
export type RealtimeStatus = "connecting" | "live" | "reconnecting" | "unsupported";
type TicketOptions = { technical?: boolean; canAssign?: boolean; scope?: string; filters?: TicketFilters;
  summaryFilters?: TicketFilters; page?: number; pageSize?: number; selectedTicketId?: string | null; enabled?: boolean };

export function useTickets({ technical = false, canAssign = false, scope = "public", filters = {},
  summaryFilters = filters, page = 1, pageSize = 25, selectedTicketId = null, enabled = true }: TicketOptions = {}) {
  const client = useQueryClient();
  const [realtime, setRealtime] = useState<RealtimeStatus>("connecting");
  const prefix = ["tickets", scope] as const;
  const audience = scope === "public" ? "public" : "staff";
  const technicianKey = ["technicians", scope] as const;
  const query = useQuery({ queryKey: [...prefix, "page", filters, page, pageSize],
    queryFn: () => listTicketPage(filters, page, pageSize, audience), enabled, staleTime: 10000, refetchInterval: 30000 });
  const summaryQuery = useQuery({ queryKey: [...prefix, "summary", summaryFilters],
    queryFn: () => getTicketSummary(summaryFilters, audience), staleTime: 10000, refetchInterval: 30000 });
  const detailQuery = useQuery({ queryKey: [...prefix, "detail", selectedTicketId],
    queryFn: () => getTicket(selectedTicketId!, audience), enabled: !!selectedTicketId,
    staleTime: 10000, refetchInterval: selectedTicketId ? 30000 : false });
  const technicianQuery = useQuery({ queryKey: technicianKey, queryFn: listTechnicians,
    enabled: technical && canAssign, staleTime: 10000, refetchInterval: 30000 });

  useEffect(() => {
    if (typeof EventSource === "undefined") { setRealtime("unsupported"); return; }
    setRealtime("connecting");
    const source = new EventSource("/api/tickets/events" + (scope === "public" ? "?audience=public" : ""));
    const invalidate = () => {
      void client.invalidateQueries({ queryKey: ["tickets", scope] });
      void client.invalidateQueries({ queryKey: ["technicians", scope] });
    };
    source.onopen = () => { setRealtime("live"); invalidate(); };
    source.onerror = () => setRealtime("reconnecting");
    source.addEventListener("ticket", invalidate);
    return () => source.close();
  }, [client, scope]);

  const invalidate = () => Promise.all([client.invalidateQueries({ queryKey: prefix }),
    client.invalidateQueries({ queryKey: technicianKey })]);
  const create = useMutation({ mutationKey: [...prefix, "create"], mutationFn: (draft: TicketDraft) => createTicket(draft, audience), onSuccess: invalidate });
  const transition = useMutation({
    mutationKey: [...prefix, "transition"],
    mutationFn: ({ ticketId, status, reason }: { ticketId: string; status: TicketStatus; reason: string }) => transitionTicket(ticketId, status, reason),
    onSuccess: (ticket) => {
      client.setQueryData([...prefix, "detail", ticket.ticketId], ticket);
      return invalidate();
    },
  });
  const assignment = useMutation({
    mutationKey: [...prefix, "assignment"],
    mutationFn: ({ ticketId, technicianId, reason }: { ticketId: string; technicianId?: string; reason?: string }) =>
      technicianId ? assignTicket(ticketId, technicianId, reason!) : autoAssignTicket(ticketId),
    onSuccess: invalidate,
  });
  const names = new Map((technicianQuery.data ?? []).map(technician => [technician.technicianId, technician.name]));
  const withAssignee = (ticket: DemoTicket) => ({ ...ticket,
    assignee: ticket.assigneeId ? names.get(ticket.assigneeId) ?? "Técnico no disponible" : ticket.assignee });
  return {
    tickets: (query.data?.items ?? []).map(withAssignee),
    page: query.data?.page ?? page, pageSize: query.data?.pageSize ?? pageSize, hasMore: query.data?.hasMore ?? false,
    summary: summaryQuery.isError ? undefined : summaryQuery.data,
    summaryError: summaryQuery.isError ? "No se pudo cargar el resumen autorizado." : "",
    detail: detailQuery.isError || !detailQuery.data ? undefined : withAssignee(detailQuery.data),
    detailLoading: !!selectedTicketId && detailQuery.isPending,
    detailError: detailQuery.isError ? "No se pudo cargar esta solicitud. Verifica el código y tu acceso." : "",
    technicians: technicianQuery.data ?? [], realtime,
    loading: enabled && query.isPending, fetching: query.isFetching,
    error: query.isError ? "No se pudieron cargar las solicitudes." : "",
    busy: create.isPending || transition.isPending || assignment.isPending,
    add: (draft: TicketDraft) => create.mutateAsync(draft),
    move: (ticketId: string, status: TicketStatus, reason: string) => transition.mutateAsync({ ticketId, status, reason }),
    assign: (ticketId: string, technicianId: string, reason: string) => assignment.mutateAsync({ ticketId, technicianId, reason }),
    autoAssign: (ticketId: string) => assignment.mutateAsync({ ticketId }),
    refresh: () => invalidate(),
  };
}
