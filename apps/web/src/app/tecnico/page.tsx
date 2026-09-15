import type { Metadata } from "next";
import { TicketWorkspace } from "@/components/ticket-workspace";
import { requireStaffSession } from "@/lib/staff-session";
export const metadata: Metadata = { title: "Tablero técnico" };
export default async function TechnicianPage() {
  const session=await requireStaffSession();
  return <TicketWorkspace mode="tecnico" access={session} />;
}
