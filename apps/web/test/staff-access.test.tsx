import { expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StaffAccess } from "../src/components/staff-access";

it("distingue el ingreso institucional pendiente de la vista local de demostración", () => {
  render(<StaffAccess />);
  expect(screen.getByRole("heading", { name: "Espacio del personal autorizado" })).toBeTruthy();
  expect((screen.getByRole("button", { name: /Ingresar de forma segura/ }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole("link", { name: /Abrir tablero de demostración/ }).getAttribute("href")).toBe("/tecnico");
  expect(screen.getByText(/No representa una sesión autenticada/)).toBeTruthy();
  expect(screen.getAllByRole("article")).toHaveLength(3);
});
