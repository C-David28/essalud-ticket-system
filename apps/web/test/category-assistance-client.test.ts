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
afterEach(() => vi.unstubAllGlobals());

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
