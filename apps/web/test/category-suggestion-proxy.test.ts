// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ config: vi.fn(), token: vi.fn() }));
vi.mock("@/lib/local-api", () => ({
  localApiConfig: mocks.config,
  apiHeaders: (config: { key: string }) => ({ "X-Local-Api-Key": config.key, Accept: "application/json" }),
}));
vi.mock("@/lib/staff-session", () => ({ staffToken: mocks.token }));

import { POST, GET, HEAD, PUT, PATCH, DELETE, OPTIONS } from "../src/app/api/category-suggestion/route";
import { suggestionResult } from "../src/lib/category-suggestion-proxy";

const browserOrigin = "http://127.0.0.1:3000";
const input = { titulo: "Impresora sin conexión", descripcion: "El equipo no imprime una página de prueba." };
const suggested = {
  status: "suggested", suggestion: {
    category: "SOPORTE", score: 1.25, scoreType: "raw_decision_margin_not_probability", probability: null,
    modelVersion: "ticket-category-model-v1.0.0", policyVersion: "category-assistance-policy-v1.0.0",
  },
};
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;

function request(body: unknown = input, headers: Record<string, string> = {}) {
  return new Request(browserOrigin + "/api/category-suggestion", {
    method: "POST", headers: { Origin: browserOrigin, "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.config.mockReset().mockReturnValue({ base: "http://127.0.0.1:3001", key: "server-local-key" });
  mocks.token.mockReset().mockResolvedValue(null);
  fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(suggested));
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("proxy de sugerencia de categoría", () => {
  it("rechaza Unicode sin pareja antes de contactar Nest", async () => {
    for (const field of ["titulo", "descripcion"] as const) {
      expect((await POST(request({ ...input, [field]: input[field] + "\ud800" }))).status).toBe(400);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("acota la respuesta de Nest a 4096 bytes y exige UTF-8 válido", async () => {
    const json = JSON.stringify(suggested);
    fetcher.mockResolvedValue(new Response(json + " ".repeat(4096 - Buffer.byteLength(json)),
      { headers: { "Content-Type": "application/json" } }));
    expect((await POST(request())).status).toBe(200);
    for (const body of [json + " ".repeat(4097 - Buffer.byteLength(json)), new Uint8Array([0xff, 0xfe])]) {
      fetcher.mockResolvedValue(new Response(body, { headers: { "Content-Type": "application/json" } }));
      expect((await POST(request())).status).toBe(503);
    }
  });

  it("envía sólo el texto al endpoint Nest y usa credenciales de servidor", async () => {
    mocks.token.mockResolvedValue("server-cookie-token");
    const response = await POST(request({ titulo: "  " + input.titulo + "  ", descripcion: "  " + input.descripcion + "  " }, {
      Authorization: "Bearer browser-secret", "X-Local-Api-Key": "browser-key", "X-ML-Token": "browser-ml-key",
      "X-Request-Id": "browser-request", Cookie: "untrusted-cookie", Origin: browserOrigin,
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(suggested);
    expect(String(fetcher.mock.calls[0][0])).toBe("http://127.0.0.1:3001/api/v1/ml/category-suggestion");
    const init = fetcher.mock.calls[0][1]!;
    expect(init).toMatchObject({ method: "POST", body: JSON.stringify(input), cache: "no-store", redirect: "error" });
    expect(init.headers).toEqual({ "X-Local-Api-Key": "server-local-key", Accept: "application/json",
      "Content-Type": "application/json", Authorization: "Bearer server-cookie-token" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("permite acceso público controlado sin añadir Authorization del navegador", async () => {
    await POST(request(input, { Authorization: "Bearer stale-browser-token" }));
    expect(fetcher.mock.calls[0][1]?.headers).not.toHaveProperty("Authorization");
    expect(mocks.config).toHaveBeenCalledOnce();
    expect(mocks.token).toHaveBeenCalledOnce();
  });

  it("aplica un timeout de 5 segundos a la llamada a Nest", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    await POST(request());
    expect(timeout).toHaveBeenCalledWith(5000);
  });

  it("filtra campos y cabeceras upstream que podrían contener secretos", async () => {
    fetcher.mockResolvedValue(Response.json({ ...suggested, debug: "private-token", token: "private-token",
      suggestion: { ...suggested.suggestion, input: input, privateUrl: "http://ml.internal" } },
      { headers: { "Set-Cookie": "private-cookie", "X-Request-Id": "private-id", "X-ML-Token": "private-token" } }));
    const response = await POST(request());
    expect(await response.json()).toEqual(suggested);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("x-request-id")).toBeNull();
    expect(response.headers.get("x-ml-token")).toBeNull();
  });

  it.each(["abstained", "disabled"])("conserva %s sin inventar una sugerencia", async status => {
    fetcher.mockResolvedValue(Response.json({ status, suggestion: null, diagnostics: "private" }));
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status, suggestion: null });
  });

  it.each([401, 403, 400])("conserva HTTP %s con mensaje local seguro", async status => {
    fetcher.mockResolvedValue(Response.json({ message: "secret input " + input.descripcion, stack: "private" }, { status }));
    const response = await POST(request());
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body).toHaveProperty("message");
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(JSON.stringify(body)).not.toContain(input.descripcion);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("degrada las fallas de configuración existente sin eludir el control", async () => {
    mocks.config.mockImplementation(() => { throw new Error("API_BASE_URL y clave privada"); });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: "unavailable", suggestion: null });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    null, [], 1, { ...input, categoria: "REDES" }, { ...input, token: "private-token" },
    { titulo: "corto", descripcion: 1 }, { titulo: "abc", descripcion: input.descripcion },
    { titulo: "x".repeat(201), descripcion: input.descripcion },
    { titulo: input.titulo, descripcion: "abc" }, { titulo: input.titulo, descripcion: "x".repeat(5001) },
    "{not-json", "private input",
  ])("rechaza entrada inválida sin enviarla ni reflejarla (%j)", async body => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "Solicitud inválida." });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["text/plain", "application/x-www-form-urlencoded", "application/jsonp"])("rechaza %s", async contentType => {
    const response = await POST(request(input, { "Content-Type": contentType }));
    expect(response.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rechaza Content-Encoding y longitud declarada excesiva antes de leer", async () => {
    for (const headers of [{ "Content-Encoding": "gzip" }, { "Content-Length": "32769" }, { "Content-Length": "invalid" }]) {
      const response = await POST(request(input, headers));
      expect(response.status).toBe(400);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("cancela un stream al superar 32 KiB aunque Content-Length declare menos", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(16000)); controller.enqueue(new Uint8Array(17000)); }, cancel,
    });
    const streamedRequest = new Request(browserOrigin + "/api/category-suggestion", {
      method: "POST", headers: { Origin: browserOrigin, "Content-Type": "application/json", "Content-Length": "1" },
      body: stream, duplex: "half",
    } as RequestInit & { duplex: "half" });
    const response = await POST(streamedRequest);
    expect(response.status).toBe(400);
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["https://attacker.example", "null", "http://127.0.0.1:3000.attacker.example", browserOrigin + "/path"])("rechaza Origin %s", async origin => {
    const response = await POST(request(input, { Origin: origin }));
    expect(response.status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rechaza Origin ausente y Sec-Fetch-Site cross-site o same-site", async () => {
    const absent = request(); absent.headers.delete("Origin");
    expect((await POST(absent)).status).toBe(403);
    for (const site of ["cross-site", "same-site"]) expect((await POST(request(input, { "Sec-Fetch-Site": site }))).status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rechaza cualquier método que no sea POST", async () => {
    for (const handler of [GET, HEAD, PUT, PATCH, DELETE, OPTIONS]) {
      const response = handler();
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect((await POST(new Request(browserOrigin + "/api/category-suggestion"))).status).toBe(405);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("devuelve selección manual ante timeout, redirección o dependencia caída", async () => {
    for (const upstream of [
      Response.json({ status: "unavailable", suggestion: null }),
      Response.json({ secret: "private" }, { status: 503 }),
      new Response(null, { status: 302, headers: { Location: "http://ml.internal/private" } }),
      new Response("private stack", { headers: { "Content-Type": "text/plain" } }),
      new Response("invalid", { headers: { "Content-Type": "application/json" } }),
    ]) {
      fetcher.mockResolvedValue(upstream);
      const response = await POST(request());
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body).toMatchObject({ status: "unavailable", suggestion: null });
      expect(body.message).toContain("manualmente");
      expect(JSON.stringify(body)).not.toContain("private");
    }
    fetcher.mockRejectedValue(new Error("Timeout private token"));
    expect((await POST(request())).status).toBe(503);
  });

  it.each([
    { category: "OTRA" }, { score: NaN }, { score: Infinity }, { score: "0.5" }, { scoreType: "probability" },
    { probability: 0.9 }, { modelVersion: "ticket-category-model-v0.0.0" }, { policyVersion: "" },
  ])("rechaza contrato inesperado o versión de modelo obsoleta (%j)", async change => {
    const value = { ...suggested, suggestion: { ...suggested.suggestion, ...change } };
    expect(suggestionResult(value)).toBeNull();
    fetcher.mockResolvedValue(Response.json(value));
    expect((await POST(request())).status).toBe(503);
  });

  it("exige suggested con objeto válido y el resto de estados con null", async () => {
    for (const value of [
      null, [], { status: "success", suggestion: null }, { status: "suggested", suggestion: null },
      { status: "disabled", suggestion: suggested.suggestion }, { status: "abstained" },
    ]) {
      fetcher.mockResolvedValue(Response.json(value));
      expect((await POST(request())).status).toBe(503);
    }
  });
});
