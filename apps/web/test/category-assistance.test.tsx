import { useState } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CategoryAssistance } from "../src/components/category-assistance";
import { CATEGORIES, type Category } from "@/lib/demo-tickets";

const initialTitle = "Estación sin conectividad";
const initialDescription = "La estación ficticia no puede conectarse a la red de prueba.";
const fetchMock = vi.fn<typeof fetch>();
const suggested = (category = "REDES") => ({
  status: "suggested",
  suggestion: {
    category, score: 0.82, scoreType: "raw_decision_margin_not_probability", probability: null,
    modelVersion: "ticket-category-model-v1.0.0", policyVersion: "category-assistance-policy-v1.0.0",
  },
});
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function Harness({ onSubmit = vi.fn(), onAccept = vi.fn() }: {
  onSubmit?: (category: Category) => void; onAccept?: (category: Category) => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [category, setCategory] = useState<Category>(CATEGORIES[0]);
  const [open, setOpen] = useState(true);
  return <form onSubmit={(event) => { event.preventDefault(); onSubmit(category); }}>
    <label>Título<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
    <label>Descripción<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label>
    <CategoryAssistance title={title} description={description} open={open} busy={false}
      onAccept={(value) => { onAccept(value); setCategory(value); }} />
    <label>Categoría<select value={category} onChange={(event) => setCategory(event.target.value as Category)}>
      {CATEGORIES.map((value) => <option key={value}>{value}</option>)}
    </select></label>
    <button type="button" onClick={() => setOpen(!open)}>{open ? "Cerrar modal" : "Abrir modal"}</button>
    <button type="button" onClick={() => {
      setTitle(""); setDescription(""); setCategory(CATEGORIES[0]);
    }}>Reiniciar formulario</button>
    <button type="submit">Enviar solicitud</button>
  </form>;
}
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => vi.unstubAllGlobals());

it("consulta solo por acción explícita y acepta sin enviar; permite corregir manualmente", async () => {
  fetchMock.mockResolvedValue(response(suggested()));
  const user = userEvent.setup();
  const onSubmit = vi.fn(), onAccept = vi.fn();
  render(<Harness onSubmit={onSubmit} onAccept={onAccept} />);
  expect(fetchMock).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Solicitar sugerencia" }));
  await screen.findByRole("button", { name: "Aceptar sugerencia" });
  expect(fetchMock).toHaveBeenCalledOnce();
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/category-suggestion");
  expect(init?.method).toBe("POST");
  expect(JSON.parse(String(init?.body))).toEqual({ titulo: initialTitle, descripcion: initialDescription });
  expect((screen.getByLabelText("Categoría") as HTMLSelectElement).value).toBe("Soporte técnico");
  expect(screen.getByText(/Confianza no calibrada/).textContent).not.toContain("%");
  expect(onAccept).not.toHaveBeenCalled();
  expect(onSubmit).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Aceptar sugerencia" }));
  expect(onAccept).toHaveBeenCalledExactlyOnceWith("Redes y conectividad");
  expect(onSubmit).not.toHaveBeenCalled();
  await user.selectOptions(screen.getByLabelText("Categoría"), "Infraestructura");
  await user.click(screen.getByRole("button", { name: "Enviar solicitud" }));
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith("Infraestructura");
  expect(fetchMock).toHaveBeenCalledOnce();
});

it("descarta una sugerencia y permite enviar con la selección manual", async () => {
  fetchMock.mockResolvedValue(response(suggested()));
  const user = userEvent.setup(), onSubmit = vi.fn(), onAccept = vi.fn();
  render(<Harness onSubmit={onSubmit} onAccept={onAccept} />);
  await user.click(screen.getByRole("button", { name: "Solicitar sugerencia" }));
  await user.click(await screen.findByRole("button", { name: "Descartar" }));
  expect(screen.queryByRole("button", { name: "Aceptar sugerencia" })).toBeNull();
  expect(onAccept).not.toHaveBeenCalled();
  expect(onSubmit).not.toHaveBeenCalled();
  await user.selectOptions(screen.getByLabelText("Categoría"), "Equipamiento biomédico");
  await user.click(screen.getByRole("button", { name: "Enviar solicitud" }));
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith("Equipamiento biomédico");
});

it.each([
  ["1234", "1234567890"], ["12345", "123456789"], ["x".repeat(121), "1234567890"],
  ["12345", "x".repeat(2001)], ["     ", "1234567890"],
])("deshabilita la consulta fuera de los límites del texto (%s)", async (title, description) => {
  render(<CategoryAssistance title={title} description={description} open busy={false} onAccept={vi.fn()} />);
  const button = screen.getByRole("button", { name: "Solicitar sugerencia" }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  await userEvent.setup().click(button);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("habilita los límites mínimos, pero respeta el envío en curso y el modal cerrado", () => {
  const props = { title: "12345", description: "1234567890", open: true, busy: false, onAccept: vi.fn() };
  const { rerender } = render(<CategoryAssistance {...props} />);
  const button = () => screen.getByRole("button", { name: "Solicitar sugerencia" }) as HTMLButtonElement;
  expect(button().disabled).toBe(false);
  rerender(<CategoryAssistance {...props} busy />);
  expect(button().disabled).toBe(true);
  rerender(<CategoryAssistance {...props} open={false} />);
  expect(button().disabled).toBe(true);
});

it("una consulta pendiente no bloquea la selección manual ni el envío del formulario", async () => {
  const pending = deferred<Response>();
  fetchMock.mockReturnValue(pending.promise);
  const user = userEvent.setup(), onSubmit = vi.fn();
  render(<Harness onSubmit={onSubmit} />);
  await user.click(screen.getByRole("button", { name: "Solicitar sugerencia" }));
  expect((screen.getByRole("button", { name: "Consultando categoría…" }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "Enviar solicitud" }) as HTMLButtonElement).disabled).toBe(false);
  await user.selectOptions(screen.getByLabelText("Categoría"), "Infraestructura");
  await user.click(screen.getByRole("button", { name: "Enviar solicitud" }));
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith("Infraestructura");
});

it("invalida al editar y rechaza la respuesta antigua aunque fetch ignore la cancelación", async () => {
  const first = deferred<Response>(), second = deferred<Response>();
  fetchMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const user = userEvent.setup(), onAccept = vi.fn();
  render(<Harness onAccept={onAccept} />);
  await user.click(screen.getByRole("button", { name: "Solicitar sugerencia" }));
  const firstSignal = fetchMock.mock.calls[0][1]?.signal;
  await user.type(screen.getByLabelText("Título"), " revisada");
  expect(firstSignal?.aborted).toBe(true);
  await user.click(screen.getByRole("button", { name: "Solicitar sugerencia" }));
  await act(async () => second.resolve(response(suggested("BIOMEDICO"))));
  await screen.findByText("Equipamiento biomédico", { selector: "strong" });
  await act(async () => first.resolve(response(suggested("REDES"))));
  expect(screen.queryByText("Redes y conectividad", { selector: "strong" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Aceptar sugerencia" }));
  expect(onAccept).toHaveBeenCalledExactlyOnceWith("Equipamiento biomédico");
});

it.each(["Título", "Descripción"])("elimina una sugerencia mostrada al editar %s", async (field) => {
  fetchMock.mockResolvedValue(response(suggested()));
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Solicitar sugerencia" }));
  await screen.findByRole("button", { name: "Aceptar sugerencia" });
  await user.type(screen.getByLabelText(field), " corregida");
  expect(screen.queryByRole("button", { name: "Aceptar sugerencia" })).toBeNull();
  expect(fetchMock).toHaveBeenCalledOnce();
});

it("cancela al cerrar y descarta respuestas tardías al reabrir el mismo texto", async () => {
  const pending = deferred<Response>();
  fetchMock.mockReturnValue(pending.promise);
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Solicitar sugerencia" }));
  const signal = fetchMock.mock.calls[0][1]?.signal;
  await user.click(screen.getByRole("button", { name: "Cerrar modal" }));
  expect(signal?.aborted).toBe(true);
  await user.click(screen.getByRole("button", { name: "Abrir modal" }));
  await act(async () => pending.resolve(response(suggested())));
  expect(screen.queryByRole("button", { name: "Aceptar sugerencia" })).toBeNull();
  expect(screen.queryByText("Redes y conectividad", { selector: "strong" })).toBeNull();
});

it("reiniciar elimina la sugerencia y desmontar cancela una consulta", async () => {
  const pending = deferred<Response>();
  fetchMock.mockResolvedValueOnce(response(suggested())).mockReturnValueOnce(pending.promise);
  const user = userEvent.setup();
  const { unmount } = render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Solicitar sugerencia" }));
  await screen.findByRole("button", { name: "Aceptar sugerencia" });
  await user.click(screen.getByRole("button", { name: "Reiniciar formulario" }));
  expect(screen.queryByRole("button", { name: "Aceptar sugerencia" })).toBeNull();
  await user.type(screen.getByLabelText("Título"), initialTitle);
  await user.type(screen.getByLabelText("Descripción"), initialDescription);
  await user.click(screen.getByRole("button", { name: "Solicitar sugerencia" }));
  const signal = fetchMock.mock.calls[1][1]?.signal;
  unmount();
  expect(signal?.aborted).toBe(true);
  await act(async () => pending.resolve(response(suggested())));
});

it("abstención muestra baja evidencia sin categoría sugerida ni botón para aceptar", async () => {
  fetchMock.mockResolvedValue(response({ status: "abstained", suggestion: null, reason: "Detalles internos del modelo" }));
  const user = userEvent.setup(), onAccept = vi.fn(), onSubmit = vi.fn();
  render(<Harness onAccept={onAccept} onSubmit={onSubmit} />);
  await user.click(screen.getByRole("button", { name: "Solicitar sugerencia" }));
  await screen.findByText(/No hay evidencia suficiente/);
  expect(screen.queryByRole("button", { name: "Aceptar sugerencia" })).toBeNull();
  expect(screen.queryByText(/Sugerencia:/)).toBeNull();
  expect(screen.queryByText(/Detalles internos/)).toBeNull();
  expect((screen.getByLabelText("Categoría") as HTMLSelectElement).value).toBe("Soporte técnico");
  expect(onAccept).not.toHaveBeenCalled();
  expect(onSubmit).not.toHaveBeenCalled();
});

it.each(["disabled", "unavailable"])("%s deja disponible el formulario manual", async (status) => {
  fetchMock.mockResolvedValue(response({ status, suggestion: null }));
  const user = userEvent.setup(), onSubmit = vi.fn();
  render(<Harness onSubmit={onSubmit} />);
  await user.click(screen.getByRole("button", { name: "Solicitar sugerencia" }));
  await screen.findByText(status === "disabled" ? /La asistencia está desactivada/ : /La asistencia no está disponible/);
  expect(screen.queryByRole("button", { name: "Aceptar sugerencia" })).toBeNull();
  await user.selectOptions(screen.getByLabelText("Categoría"), "Infraestructura");
  await user.click(screen.getByRole("button", { name: "Enviar solicitud" }));
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith("Infraestructura");
});

it.each(["network", "http", "contract"])("controla el fallo %s sin cambiar categoría ni enviar", async (failure) => {
  if (failure === "network") fetchMock.mockRejectedValue(new Error("token privado y detalle de conexión"));
  else if (failure === "http") fetchMock.mockResolvedValue(response({ error: "detalle privado" }, 503));
  else fetchMock.mockResolvedValue(response({ status: "suggested", suggestion: { category: "REDES", probability: 0.99 } }));
  const user = userEvent.setup(), onAccept = vi.fn(), onSubmit = vi.fn();
  render(<Harness onAccept={onAccept} onSubmit={onSubmit} />);
  await user.click(screen.getByRole("button", { name: "Solicitar sugerencia" }));
  await screen.findByText(/La asistencia no está disponible/);
  expect(screen.queryByRole("button", { name: "Aceptar sugerencia" })).toBeNull();
  expect(screen.queryByText(/privado/)).toBeNull();
  expect(onAccept).not.toHaveBeenCalled();
  expect(onSubmit).not.toHaveBeenCalled();
  await waitFor(() => expect((screen.getByRole("button", { name: "Solicitar sugerencia" }) as HTMLButtonElement).disabled).toBe(false));
});
