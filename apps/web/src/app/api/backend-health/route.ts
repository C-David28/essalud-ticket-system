import { backendHealth } from "@/lib/backend-health";
export const dynamic = "force-dynamic";
export async function GET() {
  const result = await backendHealth(
    process.env.API_BASE_URL ?? "http://127.0.0.1:3001",
  );
  return Response.json(result, {
    status: result.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
