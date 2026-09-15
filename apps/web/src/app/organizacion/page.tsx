import type { Metadata } from "next";
import { OrganizationView } from "@/components/organization-view";
import { requireStaffSession } from "@/lib/staff-session";
export const metadata: Metadata = { title: "Estructura organizacional" };
export default async function OrganizationPage() { const session=await requireStaffSession();return <OrganizationView session={session} />; }
