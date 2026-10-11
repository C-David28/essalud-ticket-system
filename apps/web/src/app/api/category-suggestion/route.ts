import { apiHeaders, localApiConfig } from "@/lib/local-api";
import { staffToken } from "@/lib/staff-session";
import { boundedSuggestionResponse, InvalidSuggestionRequest, sameOriginRequest, suggestionInput, suggestionResult } from "@/lib/category-suggestion-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store" };
const unavailableMessage = "La sugerencia automática no está disponible. Selecciona la categoría manualmente.";

function unavailable() {
  return Response.json({ status: "unavailable", suggestion: null, message: unavailableMessage },
    { status: 503, headers: noStore });
}

function methodNotAllowed() {
  return Response.json({ message: "Método no permitido." },
    { status: 405, headers: { ...noStore, Allow: "POST" } });
}

export async function POST(request: Request) {
  if (request.method !== "POST") return methodNotAllowed();
  if (!sameOriginRequest(request)) return Response.json({ message: "Origen no permitido." },
    { status: 403, headers: noStore });
  try {
    const input = await suggestionInput(request);
    const config = localApiConfig();
    const token = await staffToken();
    const upstream = await fetch(new URL("/api/v1/ml/category-suggestion", config.base), {
      method: "POST",
      headers: { ...apiHeaders(config), "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
      body: JSON.stringify(input), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000),
    });
    if (upstream.status === 401 || upstream.status === 403) {
      return Response.json({ message: upstream.status === 401 ? "La sesión no es válida. Inicia sesión nuevamente." :
        "No tienes permiso para solicitar una sugerencia de categoría." }, { status: upstream.status, headers: noStore });
    }
    if (upstream.status === 400) return Response.json({ message: "Solicitud inválida." }, { status: 400, headers: noStore });
    if (!upstream.ok || upstream.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return unavailable();
    const result = suggestionResult(await boundedSuggestionResponse(upstream));
    if (!result || result.status === "unavailable") return unavailable();
    return Response.json(result, { status: 200, headers: noStore });
  } catch (error) {
    if (error instanceof InvalidSuggestionRequest) return Response.json({ message: "Solicitud inválida." },
      { status: 400, headers: noStore });
    return unavailable();
  }
}

export const GET = methodNotAllowed;
export const HEAD = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
