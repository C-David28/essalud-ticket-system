import { it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Providers } from "../src/components/providers";
import { TicketWorkspace } from "../src/components/ticket-workspace";
function setup(mode: "portal" | "tecnico" = "portal") {
  const user = userEvent.setup();
  render(
    <Providers>
      <TicketWorkspace mode={mode} />
    </Providers>,
  );
  return user;
}
it("portal muestra solicitudes propias y un estado vacío recuperable", async () => {
  const user = setup();
  expect(screen.getAllByRole("button", { name: /^Ver DEMO/ })).toHaveLength(3);
  await user.type(
    screen.getByRole("textbox", { name: "Buscar solicitudes" }),
    "sin coincidencias",
  );
  expect(screen.getByText("No encontramos solicitudes")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Limpiar filtros" }));
  expect(screen.getAllByRole("button", { name: /^Ver DEMO/ })).toHaveLength(3);
});
it("formulario valida, enfoca el error y crea una solicitud temporal", async () => {
  const user = setup();
  await user.click(
    screen.getByRole("button", { name: "Nueva solicitud de prueba" }),
  );
  await user.click(
    screen.getByRole("button", { name: "Crear solicitud de prueba" }),
  );
  expect(
    screen.getByText("Escribe un título de 5 a 120 caracteres."),
  ).toBeTruthy();
  expect(document.activeElement?.id).toBe("draft-title");
  await user.type(
    screen.getByLabelText(/Qué necesitas resolver/),
    "Estación de trabajo de prueba",
  );
  await user.type(screen.getByLabelText(/^Área/), "Admisión");
  await user.type(
    screen.getByLabelText(/Describe el problema/),
    "El equipo de ejemplo no responde al intentar abrir una aplicación.",
  );
  await user.click(
    screen.getByRole("button", { name: "Crear solicitud de prueba" }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("status").textContent).toContain(
    "No se envió al servicio de soporte",
  );
  expect(screen.getAllByRole("button", { name: /^Ver DEMO/ })).toHaveLength(4);
});
it("categoría abre el formulario preseleccionado y cancelar conserva los datos", async () => {
  const user = setup();
  await user.click(
    screen.getByRole("button", { name: /Redes y conectividad/ }),
  );
  expect((screen.getByLabelText("Categoría") as HTMLSelectElement).value).toBe(
    "Redes y conectividad",
  );
  await user.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(screen.getAllByRole("button", { name: /^Ver DEMO/ })).toHaveLength(3);
});
it("detalle se cierra con Escape y devuelve el foco al disparador", async () => {
  const user = setup();
  const trigger = screen.getByRole("button", { name: /Ver DEMO-001/ });
  await user.click(trigger);
  expect(screen.getByRole("dialog")).toBeTruthy();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
it("Kanban combina filtros y mueve una tarjeta solo en memoria", async () => {
  const user = setup("tecnico");
  expect(screen.getAllByRole("button", { name: /^Ver DEMO/ })).toHaveLength(7);
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Filtrar por prioridad" }),
    "Alta",
  );
  expect(screen.getAllByRole("button", { name: /^Ver DEMO/ })).toHaveLength(2);
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Filtrar por prioridad" }),
    "",
  );
  await user.click(screen.getByRole("button", { name: /Ver DEMO-001/ }));
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Estado de prueba" }),
    "Resuelto",
  );
  await user.click(screen.getByRole("button", { name: "Cerrar detalle" }));
  const moved = within(
    screen.getByRole("region", { name: "Resuelto" }),
  ).getByRole("button", { name: /Ver DEMO-001/ });
  expect(moved).toBeTruthy();
  expect(document.activeElement).toBe(moved);
});
