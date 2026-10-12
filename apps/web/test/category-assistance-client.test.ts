import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ASSISTED_CATEGORIES, requestCategoryAssistance } from "../src/lib/category-assistance-client";

const fetchMock = vi.fn<typeof fetch>();
const valid = {
  status: "suggested",
  suggestion: {
    category: "REDES", score: -0.02, scoreType: "raw_decision_margin_not_probability", probability: null,
    modelVersion: "ticket-category-model-v1.0.0", policyVersion: "category-assistance-policy-v1.0.0",
  },
};
const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(Object.entries(ASSISTED_CATEGORIES))("admite %s y conserva el margen crudo con probability:null", async (category) => {
  fetchMock.mockResolvedValue(response({ ...valid, suggestion: { ...valid.suggestion, category } }));
  const result = await requestCategoryAssistance("Título ficticio", "Descripción ficticia suficiente.");
  expect(result.status).toBe("suggested");
  expect(result.suggestion?.category).toBe(category);
  expect(result.suggestion?.score).toBe(-0.02);
  expect(result.suggestion?.probability).toBeNull();
});

it.each([
  { category: "OTRA" }, { score: "0.99" }, { score: null }, { scoreType: "probability" },
  { probability: 0.99 }, { modelVersion: "otro-modelo" }, { policyVersion: "" },
])("rechaza una sugerencia incompatible (%j)", async (changes) => {
  fetchMock.mockResolvedValue(response({ ...valid, suggestion: { ...valid.suggestion, ...changes } }));
  await expect(requestCategoryAssistance("Título ficticio", "Descripción ficticia suficiente.")).rejects.toThrow(/inválida/);
});

it.each(["abstained", "disabled", "unavailable"])("rechaza categoría oculta en status %s", async (status) => {
  fetchMock.mockResolvedValue(response({ status, suggestion: valid.suggestion }));
  await expect(requestCategoryAssistance("Título ficticio", "Descripción ficticia suficiente.")).rejects.toThrow(/inválida/);
});

it("envía únicamente el texto normalizado, sin selección manual ni datos organizacionales", async () => {
  fetchMock.mockResolvedValue(response({ status: "abstained", suggestion: null }));
  await requestCategoryAssistance("  Título ficticio  ", "  Descripción ficticia suficiente.  ");
  expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
    titulo: "Título ficticio", descripcion: "Descripción ficticia suficiente.",
  });
});

it("rechaza texto inválido antes de enviar la petición", async () => {
  await expect(requestCategoryAssistance("Hola", "Descripción ficticia suficiente.")).rejects.toThrow(/Completa/);
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each(["abstained", "disabled", "unavailable"])("%s conserva la selección manual sin sugerencia", async (status) => {
  fetchMock.mockResolvedValue(response({ status, suggestion: null }));
  expect(await requestCategoryAssistance("Título ficticio", "Descripción ficticia suficiente.")).toEqual({ status, suggestion: null });
});

it("acota la respuesta por bytes completos y cancela el stream excedido", async () => {
  const json = JSON.stringify(valid);
  // Multibyte padding proves this is a byte limit, even when every chunk is small.
  const exactly4096 = new TextEncoder().encode(json + " ".repeat(4096 - new TextEncoder().encode(json).byteLength));
  fetchMock.mockResolvedValue(new Response(exactly4096));
  expect((await requestCategoryAssistance("Título ficticio", "Descripción ficticia suficiente.")).status).toBe("suggested");

  const cancel = vi.fn(), oversized = new TextEncoder().encode(json + "é".repeat(2048));
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < oversized.byteLength; offset += 31) controller.enqueue(oversized.slice(offset, offset + 31));
    }, cancel,
  });
  fetchMock.mockResolvedValue(new Response(body));
  await expect(requestCategoryAssistance("Título ficticio", "Descripción ficticia suficiente.")).rejects.toThrow("Respuesta de asistencia inválida.");
  expect(cancel).toHaveBeenCalledOnce();
  expect(body.locked).toBe(false);
});

it.each([
  new TextEncoder().encode('{"private":"RESPONSE_FIXTURE"'),
  new Uint8Array([0xff, 0xfe]),
  new TextEncoder().encode(JSON.stringify(valid).replace('-0.02', '1e999')),
])("rechaza JSON, UTF-8 o margen no finito con un mensaje controlado", async (bytes) => {
  fetchMock.mockResolvedValue(new Response(bytes));
  await expect(requestCategoryAssistance("Título ficticio", "Descripción ficticia suficiente.")).rejects.toThrow("Respuesta de asistencia inválida.");
});

it("cancela un cuerpo HTTP fallido sin leerlo ni copiar sus detalles", async () => {
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({ cancel });
  fetchMock.mockResolvedValue(new Response(body, { status: 503 }));
  await expect(requestCategoryAssistance("Título ficticio", "Descripción ficticia suficiente.")).rejects.toThrow("La asistencia no está disponible.");
  expect(cancel).toHaveBeenCalledOnce();
  expect(body.locked).toBe(false);
});

it.each(["timeout", "caller"])("%s cubre también el cuerpo pendiente aunque fetch no propague abort", async (reason) => {
  const deadline = new AbortController(), caller = new AbortController(), cancel = vi.fn();
  const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode('{"status":')); }, cancel,
  });
  fetchMock.mockResolvedValue(new Response(body));
  const pending = requestCategoryAssistance("Título ficticio", "Descripción ficticia suficiente.", caller.signal);
  const rejected = expect(pending).rejects.toThrow("La asistencia no está disponible.");
  // Let the reader acquire the response, then abort a stream that never finishes.
  await Promise.resolve();
  (reason === "timeout" ? deadline : caller).abort(new Error("PRIVATE_ABORT_FIXTURE"));
  await rejected;
  expect(timeout).toHaveBeenCalledWith(10000);
  expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  expect(cancel).toHaveBeenCalledOnce();
  expect(body.locked).toBe(false);
});

it("un error de lectura libera el lock y no expone texto o secretos en errores o consola", async () => {
  const privateFixture = "PRIVATE_TRANSPORT_FIXTURE";
  const logs = [vi.spyOn(console, "error"), vi.spyOn(console, "warn"), vi.spyOn(console, "log")];
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.error(new Error(privateFixture)); },
  });
  fetchMock.mockResolvedValue(new Response(body));
  await expect(requestCategoryAssistance("Título ficticio", "Descripción ficticia suficiente.")).rejects.toThrow("Respuesta de asistencia inválida.");
  expect(body.locked).toBe(false);
  fetchMock.mockRejectedValue(new Error(privateFixture));
  await expect(requestCategoryAssistance("Título ficticio", "Descripción ficticia suficiente.")).rejects.toThrow("La asistencia no está disponible.");
  expect(fetchMock.mock.calls.every(([, init]) => init?.redirect === "error")).toBe(true);
  for (const log of logs) expect(log).not.toHaveBeenCalled();
});
