import type { Metadata } from "next";
import { TicketWorkspace } from "@/components/ticket-workspace";
export const metadata: Metadata = { title: "Portal del usuario" };
export default function PortalPage() {
  return <TicketWorkspace mode="portal" />;
}
