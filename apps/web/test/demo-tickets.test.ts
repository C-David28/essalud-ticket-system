import { describe, it, expect } from "vitest";
import {
  initialTickets,
  filterTickets,
  validateDraft,
  makeDemoTicket,
  DEMO_USER,
  CATEGORIES,
  CENTERS,
  type TicketDraft,
} from "../src/lib/demo-tickets";
describe("Datos de maquetación", () => {
  const draft: TicketDraft = {
    title: " Impresora de prueba ",
    description: "Descripción ficticia del problema de impresión.",
    category: CATEGORIES[0],
    center: CENTERS[0],
    area: " Admisión ",
    priority: "Media",
  };
  it("filtra por solicitante sin mezclar sus solicitudes de ejemplo", () => {
    expect(
      filterTickets(initialTickets(), { requester: DEMO_USER }).map(
        (t) => t.id,
      ),
    ).toEqual(["DEMO-001", "DEMO-002", "DEMO-006"]);
  });
  it("combina búsqueda sin tildes con centro y prioridad", () => {
    expect(
      filterTickets(initialTickets(), {
        search: "conexion",
        center: CENTERS[0],
        priority: "Alta",
      }).map((t) => t.id),
    ).toEqual(["DEMO-002"]);
  });
  it("genera solo identificadores DEMO y normaliza texto", () => {
    const t = makeDemoTicket(draft, "123", "2026-09-08T12:00:00Z");
    expect(t.id).toBe("DEMO-123");
    expect(t.area).toBe("Admisión");
    expect(t.status).toBe("Abierto");
    expect(t.assignee).toBeNull();
  });
  it("rechaza vacíos, límites y valores fuera del catálogo", () => {
    expect(
      Object.keys(
        validateDraft({
          ...draft,
          title: "   ",
          description: "corta",
          area: "",
          center: "ajeno",
        }),
      ),
    ).toEqual(["title", "description", "center", "area"]);
    expect(() =>
      makeDemoTicket({ ...draft, title: "x".repeat(121) }, "1", "date"),
    ).toThrow();
  });
  it("cada sesión recibe una copia independiente de los ejemplos", () => {
    const a = initialTickets();
    a[0].title = "cambiado";
    expect(initialTickets()[0].title).toBe("Impresora de admisión no responde");
  });
});
