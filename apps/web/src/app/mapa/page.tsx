import type { Metadata } from "next";
import { GeographicView } from "@/components/geographic-view";
import { mapsClientConfig } from "@/lib/maps-config";
import { requireStaffSession } from "@/lib/staff-session";

export const metadata: Metadata = { title: "Mapa operativo" };
export const dynamic = "force-dynamic";

export default async function MapPage({searchParams}:{searchParams:Promise<{sede?:string}>}) {
  const session = await requireStaffSession();
  const query=await searchParams;
  return <GeographicView session={session} mapsConfig={mapsClientConfig(process.env)} initialCenterId={query.sede} />;
}
