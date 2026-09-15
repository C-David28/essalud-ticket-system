import type { Metadata } from "next";
import { OrganizationView } from "@/components/organization-view";
export const metadata: Metadata = { title: "Estructura organizacional" };
export default function OrganizationPage() { return <OrganizationView />; }
