import type { Category } from "@/lib/demo-tickets";

export const CATEGORY_ASSISTANCE_LIMITS = {
  title: { min: 5, max: 120 },
  description: { min: 10, max: 2000 },
} as const;

export const ASSISTED_CATEGORIES = {
  SOPORTE: "Soporte técnico",
  REDES: "Redes y conectividad",
  INFRAESTRUCTURA: "Infraestructura",
  BIOMEDICO: "Equipamiento biomédico",
} as const satisfies Record<string, Category>;

export type AssistedCategory = keyof typeof ASSISTED_CATEGORIES;
export type CategorySuggestion = {
  category: AssistedCategory;
  score: number;
  scoreType: "raw_decision_margin_not_probability";
  probability: null;
  modelVersion: "ticket-category-model-v1.0.0";
  policyVersion: string;
};
export type CategoryAssistanceResult =
  | { status: "suggested"; suggestion: CategorySuggestion }
  | { status: "abstained" | "unavailable" | "disabled"; suggestion: null };

export function canRequestCategoryAssistance(title: string, description: string) {
  const titleLength = title.trim().length;
  const descriptionLength = description.trim().length;
  return titleLength >= CATEGORY_ASSISTANCE_LIMITS.title.min &&
    titleLength <= CATEGORY_ASSISTANCE_LIMITS.title.max &&
    descriptionLength >= CATEGORY_ASSISTANCE_LIMITS.description.min &&
    descriptionLength <= CATEGORY_ASSISTANCE_LIMITS.description.max;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readResult(value: unknown): CategoryAssistanceResult {
  if (!isRecord(value)) throw new Error("Respuesta de asistencia inválida.");
  if (value.status === "abstained" || value.status === "unavailable" || value.status === "disabled") {
    if (value.suggestion !== null) throw new Error("Respuesta de asistencia inválida.");
    return { status: value.status, suggestion: null };
  }
  const suggestion = value.suggestion;
  if (value.status !== "suggested" || !isRecord(suggestion) ||
    typeof suggestion.category !== "string" ||
    !Object.hasOwn(ASSISTED_CATEGORIES, suggestion.category) ||
    typeof suggestion.score !== "number" || !Number.isFinite(suggestion.score) ||
    suggestion.scoreType !== "raw_decision_margin_not_probability" ||
    suggestion.probability !== null ||
    suggestion.modelVersion !== "ticket-category-model-v1.0.0" ||
    typeof suggestion.policyVersion !== "string" ||
    !suggestion.policyVersion.trim() || suggestion.policyVersion.length > 120) {
    throw new Error("Respuesta de asistencia inválida.");
  }
  return {
    status: "suggested",
    suggestion: {
      category: suggestion.category as AssistedCategory,
      score: suggestion.score,
      scoreType: suggestion.scoreType,
      probability: null,
      modelVersion: suggestion.modelVersion,
      policyVersion: suggestion.policyVersion,
    },
  };
}

async function readResponse(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.body) throw new Error("Respuesta de asistencia inválida.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0, complete = false, cancelled = false;
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    void reader.cancel().catch(() => {});
  };
  // Also cancel streamed bodies when a supplied fetch adapter does not propagate abort.
  signal.addEventListener("abort", cancel, { once: true });
  try {
    signal.throwIfAborted();
    for (;;) {
      const chunk = await reader.read();
      signal.throwIfAborted();
      if (chunk.done) { complete = true; break; }
      size += chunk.value.byteLength;
      if (size > 4096) throw new Error("Invalid response");
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error(signal.aborted ? "La asistencia no está disponible." : "Respuesta de asistencia inválida.");
  } finally {
    signal.removeEventListener("abort", cancel);
    if (!complete) cancel();
    reader.releaseLock();
  }
}

export async function requestCategoryAssistance(
  title: string,
  description: string,
  signal?: AbortSignal,
): Promise<CategoryAssistanceResult> {
  if (!canRequestCategoryAssistance(title, description)) {
    throw new Error("Completa el título y la descripción para solicitar asistencia.");
  }
  const timeoutSignal = AbortSignal.timeout(10000);
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  let response: Response;
  try {
    response = await fetch("/api/category-suggestion", {
      method: "POST", redirect: "error",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ titulo: title.trim(), descripcion: description.trim() }),
      signal: requestSignal,
      cache: "no-store",
    });
  } catch {
    throw new Error("La asistencia no está disponible.");
  }
  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    throw new Error("La asistencia no está disponible.");
  }
  return readResult(await readResponse(response, requestSignal));
}
