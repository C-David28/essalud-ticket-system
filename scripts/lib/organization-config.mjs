import { readFileSync } from "node:fs";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const code = /^[A-Z][A-Z0-9_]{2,29}$/;
const centerTypes = new Set(["HOSPITAL", "CAP", "POLICLINICO", "POSTA", "OTRO"]);
const scopes = new Set(["PROPIO", "SEDE", "RED", "NACIONAL"]);
const locationSources = new Set(["CONFIGURED", "NETWORK", "GEOCODED"]);
const text = (value, min, max, field) => {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max)
    throw new Error("Configuración organizacional inválida: " + field);
  return value.trim();
};
const identifier = (value, field) => {
  if (typeof value !== "string" || !uuid.test(value)) throw new Error("Configuración organizacional inválida: " + field);
  return value;
};
const catalogCode = (value, field) => {
  if (typeof value !== "string" || !code.test(value)) throw new Error("Configuración organizacional inválida: " + field);
  return value;
};
const sql = value => "'" + value.replaceAll("'", "''") + "'";
const coordinate = (value, min, max, field) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
    throw new Error("Configuración organizacional inválida: " + field);
  return value;
};

export function loadOrganizationConfig(env, source = new URL("../../config/organization.demo.json", import.meta.url)) {
  const config = JSON.parse(readFileSync(source, "utf8"));
  if (config.version !== 2 || !Array.isArray(config.centers) || !Array.isArray(config.roles))
    throw new Error("Versión de configuración organizacional no soportada");
  const redId = identifier(env.TICKETS_LOCAL_RED_ID, "red local");
  const localCenter = identifier(env.TICKETS_LOCAL_CENTRO_ID, "centro local");
  const localArea = identifier(env.TICKETS_LOCAL_AREA_ID, "área local");
  const seenCenterIds = new Set(), seenCenterCodes = new Set(), seenRoleIds = new Set(), seenRoleCodes = new Set();
  const resolve = (value, token, local, field) => value === token ? local : identifier(value, field);
  const centers = config.centers.map((center, centerIndex) => {
    const id = resolve(center.id, "$LOCAL_CENTER_ID", localCenter, "centro " + centerIndex);
    const centerCode = catalogCode(center.code, "código de centro");
    if (seenCenterIds.has(id) || seenCenterCodes.has(centerCode)) throw new Error("Centro duplicado en configuración");
    seenCenterIds.add(id); seenCenterCodes.add(centerCode);
    if (!centerTypes.has(center.type) || !Array.isArray(center.areas) || center.areas.length === 0)
      throw new Error("Centro organizacional inválido");
    let location = null;
    if (center.location !== undefined) {
      if (!locationSources.has(center.location?.source))
        throw new Error("Configuración organizacional inválida: origen de ubicación");
      location = {
        latitude: coordinate(center.location.latitude, -90, 90, "latitud de centro"),
        longitude: coordinate(center.location.longitude, -180, 180, "longitud de centro"),
        source: center.location.source,
      };
    }
    const seenAreaIds = new Set(), seenAreaCodes = new Set();
    const areas = center.areas.map((area, areaIndex) => {
      const areaId = resolve(area.id, "$LOCAL_AREA_ID", localArea, "área " + areaIndex);
      const areaCode = catalogCode(area.code, "código de área");
      if (seenAreaIds.has(areaId) || seenAreaCodes.has(areaCode)) throw new Error("Área duplicada dentro del centro");
      seenAreaIds.add(areaId); seenAreaCodes.add(areaCode);
      return { id: areaId, code: areaCode, name: text(area.name, 2, 200, "nombre de área") };
    });
    return { id, code: centerCode, name: text(center.name, 2, 200, "nombre de centro"), type: center.type, location, areas };
  });
  const roles = config.roles.map((role, index) => {
    const id = identifier(role.id, "rol " + index), roleCode = catalogCode(role.code, "código de rol");
    if (seenRoleIds.has(id) || seenRoleCodes.has(roleCode)) throw new Error("Rol duplicado en configuración");
    seenRoleIds.add(id); seenRoleCodes.add(roleCode);
    if (!scopes.has(role.scope)) throw new Error("Alcance de rol inválido");
    return { id, code: roleCode, name: text(role.name, 3, 120, "nombre de rol"),
      description: text(role.description, 10, 500, "descripción de rol"), scope: role.scope };
  });
  if (!centers.some(item => item.id === localCenter && item.areas.some(area => area.id === localArea)))
    throw new Error("La configuración debe conservar el centro y área locales");
  return { red: { id: redId, code: catalogCode(config.network?.code, "código de red"),
    name: text(config.network?.name, 2, 200, "nombre de red") }, centers, roles };
}

export function organizationSeedSql(env, source) {
  const config = loadOrganizationConfig(env, source);
  const statements = [
    "UPDATE app.redes_asistenciales SET codigo=" + sql(config.red.code) + ",nombre=" + sql(config.red.name) +
      ",activo=true WHERE red_asistencial_id=" + sql(config.red.id) + "::uuid;"
  ];
  for (const center of config.centers) {
    statements.push("INSERT INTO app.centros_asistenciales(red_asistencial_id,centro_asistencial_id,codigo,nombre,tipo,latitude,longitude,location_source,activo) VALUES (" +
      [sql(config.red.id)+"::uuid",sql(center.id)+"::uuid",sql(center.code),sql(center.name),sql(center.type),
        center.location?String(center.location.latitude):"NULL",center.location?String(center.location.longitude):"NULL",
        center.location?sql(center.location.source):"NULL","true"].join(",") +
      ") ON CONFLICT(red_asistencial_id,centro_asistencial_id) DO UPDATE SET codigo=EXCLUDED.codigo,nombre=EXCLUDED.nombre,tipo=EXCLUDED.tipo,"+
      "latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,location_source=EXCLUDED.location_source,activo=true;");
    for (const area of center.areas) statements.push("INSERT INTO app.areas(red_asistencial_id,centro_asistencial_id,area_id,codigo,nombre,activo) VALUES (" +
      [sql(config.red.id)+"::uuid",sql(center.id)+"::uuid",sql(area.id)+"::uuid",sql(area.code),sql(area.name),"true"].join(",") +
      ") ON CONFLICT(red_asistencial_id,centro_asistencial_id,area_id) DO UPDATE SET codigo=EXCLUDED.codigo,nombre=EXCLUDED.nombre,activo=true;");
  }
  for (const role of config.roles) statements.push("INSERT INTO app.roles_institucionales(red_asistencial_id,role_id,codigo,nombre,descripcion,alcance,activo) VALUES (" +
    [sql(config.red.id)+"::uuid",sql(role.id)+"::uuid",sql(role.code),sql(role.name),sql(role.description),sql(role.scope),"true"].join(",") +
    ") ON CONFLICT(red_asistencial_id,role_id) DO UPDATE SET codigo=EXCLUDED.codigo,nombre=EXCLUDED.nombre,descripcion=EXCLUDED.descripcion,alcance=EXCLUDED.alcance,activo=true;");
  return statements.join(String.fromCharCode(10)+"    ");
}
