"use client";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { createTicket, listTickets, transitionTicket } from "@/lib/ticket-client";
import type { TicketDraft, TicketStatus } from "@/lib/demo-tickets";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({defaultOptions:{queries:{retry:1}}}));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const key = ["tickets", "local-api"] as const;
export type RealtimeStatus = "connecting" | "live" | "reconnecting" | "unsupported";

export function useTickets() {
  const client = useQueryClient();
  const [realtime,setRealtime]=useState<RealtimeStatus>("connecting");
  const query=useQuery({queryKey:key,queryFn:listTickets,staleTime:10000,refetchInterval:30000});
  useEffect(()=>{
    if(typeof EventSource==="undefined") {setRealtime("unsupported");return;}
    const source=new EventSource("/api/tickets/events");
    source.onopen=()=>{setRealtime("live");void client.invalidateQueries({queryKey:key});};
    source.onerror=()=>setRealtime("reconnecting");
    source.addEventListener("ticket",()=>void client.invalidateQueries({queryKey:key}));
    return ()=>source.close();
  },[client]);
  const create=useMutation({mutationFn:createTicket,onSuccess:()=>client.invalidateQueries({queryKey:key})});
  const transition=useMutation({
    mutationFn:({ticketId,status,reason}:{ticketId:string;status:TicketStatus;reason:string})=>transitionTicket(ticketId,status,reason),
    onSuccess:()=>client.invalidateQueries({queryKey:key}),
  });
  return {
    tickets:query.data??[],realtime,
    loading:query.isPending,error:query.isError?"No se pudieron cargar las solicitudes.":"",
    busy:create.isPending||transition.isPending,
    add:(draft:TicketDraft)=>create.mutateAsync(draft),
    move:(ticketId:string,status:TicketStatus,reason:string)=>transition.mutateAsync({ticketId,status,reason}),
    refresh:()=>query.refetch(),
  };
}
