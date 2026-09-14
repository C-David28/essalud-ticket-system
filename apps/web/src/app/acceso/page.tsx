import type { Metadata } from "next";
import { StaffAccess } from "@/components/staff-access";

export const metadata: Metadata = { title: "Acceso del personal" };

export default function StaffAccessPage() {
  return <StaffAccess />;
}
