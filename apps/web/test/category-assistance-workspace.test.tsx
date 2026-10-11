import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Providers } from "@/components/providers";
import { TicketWorkspace } from "@/components/ticket-workspace";
import { initialTickets, makeDemoTicket } from "@/lib/demo-tickets";

const api = vi.hoisted(() => ({
  listTickets: vi.fn(), listTechnicians: vi.fn(), createTicket: vi.fn(), transitionTicket: vi.fn(),
  assignTicket: vi.fn(), autoAssignTicket: vi.fn(), getPublicOrganizationCatalog: vi.fn(),
}));
vi.mock("@/lib/ticket-client", () => api);
vi.mock("@/lib/organization-client", () => ({ getPublicOrganizationCatalog: api.getPublicOrganizationCatalog }));
class FakeEventSource { addEventListener() {} close() {} }
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  api.listTickets.mockReset().mockResolvedValue(initialTickets());
  api.listTechnicians.mockReset().mockResolvedValue([]);
  api.createTicket.mockReset().mockImplementation(async (draft) => makeDemoTicket(draft, "NEW", "2026-10-10T12:00:00Z"));
  api.getPublicOrganizationCatalog.mockReset().mockResolvedValue({
    network: { networkId: "red", code: "DEMO", name: "Red demo", active: true },
    centers: [{ centerId: "33333333-3333-4333-8333-333333333333", code: "SEDE_DEMO", name: "Centro ficticio de pruebas",
      type: "CAP", active: true, address: null, location: null,
      areas: [{ areaId: "44444444-4444-4444-8444-444444444444", code: "AREA_DEMO", name: "Área ficticia de pruebas", active: true }] }],
  });
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("EventSource", FakeEventSource);
});
afterEach(() => vi.unstubAllGlobals());
async function setup() {
  const user = userEvent.setup();
  render(<Providers><TicketWorkspace mode="portal" /></Providers>);
  await screen.findAllByRole("button", { name: /^Ver DEMO/ });
  await user.click(screen.getByRole("button", { name: "Reportar incidencia" }));
  await user.type(screen.getByLabelText(/Qué necesitas resolver/), "Estación de prueba sin conexión");
  await user.type(screen.getByLabelText(/Describe el problema/), "La estación ficticia no tiene conectividad con la red de prueba.");
  return user;
}

it("el formulario coloca asistencia entre descripción y categoría y solo guarda al enviar", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({
    status: "suggested", suggestion: {
      category: "REDES", score: 0.72, scoreType: "raw_decision_margin_not_probability", probability: null,
      modelVersion: "ticket-category-model-v1.0.0", policyVersion: "category-assistance-policy-v1.0.0",
    },
  }), { status: 200 }));
  const user = await setup();
  const description = screen.getByLabelText(/Describe el problema/);
  const assistance = screen.getByRole("region", { name: "Asistencia de categoría" });
  const category = screen.getByRole("combobox", { name: "Categoría" });
  expect(description.compareDocumentPosition(assistance) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(assistance.compareDocumentPosition(category) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(fetchMock).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Solicitar sugerencia" }));
  await user.click(await screen.findByRole("button", { name: "Aceptar sugerencia" }));
  expect((category as HTMLSelectElement).value).toBe("Redes y conectividad");
  expect(api.createTicket).not.toHaveBeenCalled();
  await user.selectOptions(category, "Infraestructura");
  await user.click(screen.getByRole("button", { name: "Enviar solicitud" }));
  await screen.findByText(/guardada en PostgreSQL/);
  expect(api.createTicket).toHaveBeenCalledOnce();
  expect(api.createTicket.mock.calls[0][0].category).toBe("Infraestructura");
});

it("la abstención permite enviar con categoría manual sin aceptar ni crear automáticamente", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: "abstained", suggestion: null }), { status: 200 }));
  const user = await setup();
  await user.click(screen.getByRole("button", { name: "Solicitar sugerencia" }));
  await screen.findByText(/No hay evidencia suficiente/);
  expect(screen.queryByRole("button", { name: "Aceptar sugerencia" })).toBeNull();
  expect(api.createTicket).not.toHaveBeenCalled();
  await user.selectOptions(screen.getByRole("combobox", { name: "Categoría" }), "Equipamiento biomédico");
  await user.click(screen.getByRole("button", { name: "Enviar solicitud" }));
  await screen.findByText(/guardada en PostgreSQL/);
  expect(api.createTicket).toHaveBeenCalledOnce();
  expect(api.createTicket.mock.calls[0][0].category).toBe("Equipamiento biomédico");
});
