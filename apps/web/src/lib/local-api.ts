import "server-only";

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

export function localApiConfig(env:NodeJS.ProcessEnv=process.env) {
  const raw=env.API_BASE_URL??"http://127.0.0.1:3001";
  let base:URL;
  try {base=new URL(raw);} catch {throw new Error("API_BASE_URL inválida");}
  if(base.protocol!=="http:"||base.username||base.password||base.pathname!=="/"||base.search||base.hash)
    throw new Error("API_BASE_URL debe ser un origen HTTP local sin credenciales");
  if(!["127.0.0.1","localhost","api","[::1]"].includes(base.hostname))
    throw new Error("API_BASE_URL debe apuntar al API local");
  const key=env.TICKETS_LOCAL_KEY??"";
  if(!/^[a-f0-9]{64}$/.test(key)) throw new Error("TICKETS_LOCAL_KEY inválida");
  const centroAsistencialId=env.TICKETS_LOCAL_CENTRO_ID??"",areaId=env.TICKETS_LOCAL_AREA_ID??"";
  if(!uuid.test(centroAsistencialId)||!uuid.test(areaId)) throw new Error("Catálogo local inválido");
  return {base:base.origin,key,centroAsistencialId,areaId};
}

export function apiHeaders(config:ReturnType<typeof localApiConfig>,accept="application/json") {
  return {"X-Local-Api-Key":config.key,Accept:accept};
}
