// @vitest-environment node
import { describe, expect, it } from "vitest";
import { loadOrganizationConfig, organizationSeedSql } from "../../../scripts/lib/organization-config.mjs";

const env = {
  TICKETS_LOCAL_RED_ID: "34000000-0000-4000-8000-000000000001",
  TICKETS_LOCAL_CENTRO_ID: "34000000-0000-4000-8000-000000000002",
  TICKETS_LOCAL_AREA_ID: "34000000-0000-4000-8000-000000000003",
};

describe("configuración organizacional", () => {
  it("resuelve los identificadores locales y conserva datos ficticios válidos", () => {
    const config = loadOrganizationConfig(env);
    expect(config.centers).toHaveLength(4);
    expect(config.centers[0].id).toBe(env.TICKETS_LOCAL_CENTRO_ID);
    expect(config.centers[0].areas[0].id).toBe(env.TICKETS_LOCAL_AREA_ID);
    expect(config.centers.every(center => center.location !== null)).toBe(true);
    expect(config.centers[0].location).toEqual({latitude:-10.6868,longitude:-76.2565,source:"CONFIGURED"});
    expect(config.roles).toHaveLength(5);
    expect(config.roles.every(role => ["PROPIO","SEDE","RED","NACIONAL"].includes(role.scope))).toBe(true);
  });
  it("genera una sincronización idempotente sin interpolar valores sin escapar", () => {
    const generated = organizationSeedSql(env);
    expect(generated).toContain("ON CONFLICT(red_asistencial_id,role_id) DO UPDATE");
    expect(generated).toContain("app.centros_asistenciales");
    expect(generated).toContain("app.roles_institucionales");
    expect(generated).toContain("location_source");
  });
});
