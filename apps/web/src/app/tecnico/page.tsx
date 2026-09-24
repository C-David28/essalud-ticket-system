import type { Metadata } from "next";
import { TicketWorkspace } from "@/components/ticket-workspace";
import { requireStaffSession } from "@/lib/staff-session";
export const metadata: Metadata = { title: "Tablero técnico" };
export default async function TechnicianPage({searchParams}:{searchParams:Promise<{ticket?:string;centro?:string}>}) {
  const session=await requireStaffSession();
  const query=await searchParams;
  return <TicketWorkspace mode="tecnico" access={session} initialTicket={query.ticket} initialCenterId={query.centro} />;
}
