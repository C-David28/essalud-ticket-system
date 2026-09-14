"use client";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { assignTicket,autoAssignTicket,createTicket,listTechnicians,listTickets,transitionTicket } from "@/lib/ticket-client";
import type { TicketDraft, TicketStatus } from "@/lib/demo-tickets";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({defaultOptions:{queries:{retry:1}}}));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const key = ["tickets", "local-api"] as const;
const technicianKey=["technicians","local-api"] as const;
export type RealtimeStatus = "connecting" | "live" | "reconnecting" | "unsupported";

export function useTickets({ technical = false }: { technical?: boolean } = {}) {
  const client = useQueryClient();
  const [realtime,setRealtime]=useState<RealtimeStatus>("connecting");
  const query=useQuery({queryKey:key,queryFn:listTickets,staleTime:10000,refetchInterval:30000});
  const technicianQuery=useQuery({queryKey:technicianKey,queryFn:listTechnicians,enabled:technical,staleTime:10000,refetchInterval:30000});
  useEffect(()=>{
    if(typeof EventSource==="undefined") {setRealtime("unsupported");return;}
    const source=new EventSource("/api/tickets/events");
    source.onopen=()=>{setRealtime("live");void client.invalidateQueries({queryKey:key});void client.invalidateQueries({queryKey:technicianKey});};
    source.onerror=()=>setRealtime("reconnecting");
    source.addEventListener("ticket",()=>{void client.invalidateQueries({queryKey:key});void client.invalidateQueries({queryKey:technicianKey});});
    return ()=>source.close();
  },[client]);
  const create=useMutation({mutationFn:createTicket,onSuccess:()=>client.invalidateQueries({queryKey:key})});
  const transition=useMutation({
    mutationFn:({ticketId,status,reason}:{ticketId:string;status:TicketStatus;reason:string})=>transitionTicket(ticketId,status,reason),
    onSuccess:()=>client.invalidateQueries({queryKey:key}),
  });
  const assignment=useMutation({
    mutationFn:({ticketId,technicianId,reason}:{ticketId:string;technicianId?:string;reason?:string})=>
      technicianId?assignTicket(ticketId,technicianId,reason!):autoAssignTicket(ticketId),
    onSuccess:()=>Promise.all([client.invalidateQueries({queryKey:key}),client.invalidateQueries({queryKey:technicianKey})]),
  });
  const names=new Map((technicianQuery.data??[]).map(technician=>[technician.technicianId,technician.name]));
  return {
    tickets:(query.data??[]).map(ticket=>({...ticket,assignee:ticket.assigneeId?names.get(ticket.assigneeId)??"Técnico no disponible":null})),
    technicians:technicianQuery.data??[],realtime,
    loading:query.isPending,error:query.isError?"No se pudieron cargar las solicitudes.":"",
    busy:create.isPending||transition.isPending||assignment.isPending,
    add:(draft:TicketDraft)=>create.mutateAsync(draft),
    move:(ticketId:string,status:TicketStatus,reason:string)=>transition.mutateAsync({ticketId,status,reason}),
    assign:(ticketId:string,technicianId:string,reason:string)=>assignment.mutateAsync({ticketId,technicianId,reason}),
    autoAssign:(ticketId:string)=>assignment.mutateAsync({ticketId}),
    refresh:()=>query.refetch(),
  };
}
