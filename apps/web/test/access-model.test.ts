import { describe, expect, it } from "vitest";
import { ACCESS_EXPERIENCES, isPublicExperience } from "../src/lib/access-model";

describe("modelo de experiencias institucionales", () => {
  it("mantiene al solicitante público y exige autenticación para perfiles internos", () => {
    const requester = ACCESS_EXPERIENCES.find((item) => item.id === "requester");
    const staff = ACCESS_EXPERIENCES.filter((item) => item.id !== "requester");
    expect(requester?.access).toBe("public");
    expect(staff).toHaveLength(3);
    expect(staff.every((item) => item.access === "authenticated")).toBe(true);
  });

  it("clasifica portal y acceso como públicos, pero no el tablero operativo", () => {
    expect(isPublicExperience("/portal")).toBe(true);
    expect(isPublicExperience("/portal/consulta")).toBe(true);
    expect(isPublicExperience("/acceso")).toBe(true);
    expect(isPublicExperience("/tecnico")).toBe(false);
    expect(isPublicExperience("/ruta-inexistente")).toBe(true);
  });
});
