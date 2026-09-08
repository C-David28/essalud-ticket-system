// @vitest-environment node
import { it, expect, vi } from "vitest";
import { backendHealth } from "../src/lib/backend-health";
it("consulta el endpoint existente y confirma las dos dependencias", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({ status: "ok", checks: { postgres: "up", redis: "up" } }),
    );
  expect(await backendHealth("http://127.0.0.1:3001", fetcher)).toEqual({
    status: "ok",
  });
  expect(String(fetcher.mock.calls[0][0])).toBe(
    "http://127.0.0.1:3001/api/v1/health/ready",
  );
  expect(fetcher.mock.calls[0][1]?.redirect).toBe("error");
});
it("degrada respuestas 503, contratos inesperados y errores sin filtrar información", async () => {
  for (const value of [
    Response.json({ status: "degraded" }, { status: 503 }),
    Response.json({ status: "ok", checks: { postgres: "up", redis: "down" } }),
    new Response("invalid"),
  ]) {
    expect(
      await backendHealth("http://localhost:3001", async () => value),
    ).toEqual({ status: "unavailable" });
  }
  expect(
    await backendHealth("http://localhost:3001", async () => {
      throw new Error("secret");
    }),
  ).toEqual({ status: "unavailable" });
});
it("rechaza configuración con credenciales o protocolos inesperados", async () => {
  const fetcher = vi.fn<typeof fetch>();
  for (const url of [
    "file:///private",
    "http://user:secret@localhost",
    "not-a-url",
  ])
    expect(await backendHealth(url, fetcher)).toEqual({
      status: "unavailable",
    });
  expect(fetcher).not.toHaveBeenCalled();
});
