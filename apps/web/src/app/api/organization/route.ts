import { apiHeaders, localApiConfig } from "@/lib/local-api";
import { staffToken } from "@/lib/staff-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const config = localApiConfig();
    const token=await staffToken();if(!token)return Response.json({message:"No autenticado"},{status:401});
    const response = await fetch(new URL("/api/v1/organization", config.base), {
      headers: {...apiHeaders(config),Authorization:"Bearer "+token}, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000),
    });
    return new Response(await response.arrayBuffer(), { status: response.status, headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store",
    }});
  } catch {
    return Response.json({ message: "Catálogo organizacional no disponible" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
