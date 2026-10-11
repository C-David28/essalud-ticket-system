const MAX_BODY_BYTES = 32 * 1024;
const CATEGORIES = ["SOPORTE", "REDES", "INFRAESTRUCTURA", "BIOMEDICO"] as const;
const MODEL_VERSION = "ticket-category-model-v1.0.0";
const SCORE_TYPE = "raw_decision_margin_not_probability";

export type CategorySuggestionInput = { titulo: string; descripcion: string };
export type CategorySuggestionResult = {
  status: "suggested" | "abstained" | "unavailable" | "disabled";
  suggestion: null | {
    category: (typeof CATEGORIES)[number];
    score: number;
    scoreType: typeof SCORE_TYPE;
    probability: null;
    modelVersion: typeof MODEL_VERSION;
    policyVersion: string;
  };
};

export class InvalidSuggestionRequest extends Error {}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sameOriginRequest(request: Request): boolean {
  const rawOrigin = request.headers.get("origin");
  const host = request.headers.get("host");
  const site = request.headers.get("sec-fetch-site");
  if (!rawOrigin || !host || /[\s\\/@?#,%]/u.test(host) ||
    (site && site !== "same-origin" && site !== "none")) return false;
  try {
    // Next builds request.url from its listening address and normalizes loopback.
    // Host is the HTTP destination used by the client; forwarded hosts are ignored.
    const origin = new URL(rawOrigin);
    const protocol = new URL(request.url).protocol;
    if (!["http:", "https:"].includes(protocol) || origin.origin !== rawOrigin) return false;
    return origin.origin === new URL(`${protocol}//${host}`).origin;
  } catch { return false; }
}

async function cancelBody(request: Request) {
  try { await request.body?.cancel(); } catch { /* A rejected body is never forwarded. */ }
}

export async function suggestionInput(request: Request): Promise<CategorySuggestionInput> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  const encoding = request.headers.get("content-encoding");
  const declaredLength = request.headers.get("content-length");
  if (contentType !== "application/json" || (encoding && encoding !== "identity") ||
    (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_BODY_BYTES)) ||
    !request.body) {
    await cancelBody(request);
    throw new InvalidSuggestionRequest();
  }

  const reader = request.body.getReader();
  let value: unknown;
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new InvalidSuggestionRequest();
      }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new InvalidSuggestionRequest();
  } finally {
    reader.releaseLock();
  }
  if (!record(value) || Object.keys(value).length !== 2 ||
    typeof value.titulo !== "string" || typeof value.descripcion !== "string") {
    throw new InvalidSuggestionRequest();
  }
  const titulo = value.titulo.trim(), descripcion = value.descripcion.trim();
  const titleLength = Array.from(titulo).length, descriptionLength = Array.from(descripcion).length;
  if (titleLength < 5 || titleLength > 200 || descriptionLength < 10 || descriptionLength > 5000 ||
    Buffer.from(titulo, "utf8").toString("utf8") !== titulo ||
    Buffer.from(descripcion, "utf8").toString("utf8") !== descripcion) {
    throw new InvalidSuggestionRequest();
  }
  return { titulo, descripcion };
}

export async function boundedSuggestionResponse(response: Response): Promise<unknown> {
  if (!response.body) throw new Error("Invalid response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 4096) { void reader.cancel().catch(() => {}); throw new Error("Invalid response"); }
      chunks.push(chunk.value);
    }
    return JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(Buffer.concat(chunks)));
  } finally { reader.releaseLock(); }
}

export function suggestionResult(value: unknown): CategorySuggestionResult | null {
  if (!record(value)) return null;
  if (value.status === "abstained" || value.status === "unavailable" || value.status === "disabled") {
    return value.suggestion === null ? {
      status: value.status, suggestion: null,
    } : null;
  }
  if (value.status !== "suggested" || !record(value.suggestion)) return null;
  const suggestion = value.suggestion;
  if (!CATEGORIES.includes(suggestion.category as (typeof CATEGORIES)[number]) ||
    typeof suggestion.score !== "number" || !Number.isFinite(suggestion.score) ||
    suggestion.scoreType !== SCORE_TYPE || suggestion.probability !== null ||
    suggestion.modelVersion !== MODEL_VERSION || typeof suggestion.policyVersion !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(suggestion.policyVersion)) return null;
  return { status: "suggested", suggestion: {
    category: suggestion.category as (typeof CATEGORIES)[number], score: suggestion.score,
    scoreType: SCORE_TYPE, probability: null, modelVersion: MODEL_VERSION,
    policyVersion: suggestion.policyVersion,
  } };
}
