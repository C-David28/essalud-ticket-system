"use client";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  initialTickets,
  makeDemoTicket,
  type TicketDraft,
  type DemoTicket,
  type TicketStatus,
} from "@/lib/demo-tickets";
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
const key = ["demo-tickets", "stage-1.5"] as const;
export function useDemoTickets() {
  const client = useQueryClient();
  const { data: tickets } = useQuery({
    queryKey: key,
    queryFn: async () => initialTickets(),
    initialData: initialTickets,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return {
    tickets,
    add: (draft: TicketDraft) => {
      const ticket = makeDemoTicket(
        draft,
        crypto.randomUUID().slice(0, 8).toUpperCase(),
        new Date().toISOString(),
      );
      client.setQueryData<DemoTicket[]>(key, (old) => [ticket, ...(old ?? [])]);
      return ticket;
    },
    move: (id: string, status: TicketStatus) =>
      client.setQueryData<DemoTicket[]>(key, (old) =>
        (old ?? []).map((t) => (t.id === id ? { ...t, status } : t)),
      ),
  };
}
