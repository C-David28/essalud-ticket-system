import type { Metadata } from "next";
import { TicketWorkspace } from "@/components/ticket-workspace";
export const metadata: Metadata = { title: "Tablero técnico" };
export default function TechnicianPage() {
  return <TicketWorkspace mode="tecnico" />;
}
