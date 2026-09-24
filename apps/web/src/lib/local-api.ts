import "server-only";
import {isIP} from "node:net";

export function localApiConfig(env:NodeJS.ProcessEnv=process.env) {
  const raw=env.API_BASE_URL??"http://127.0.0.1:3001";
  let base:URL;
  try {base=new URL(raw);} catch {throw new Error("API_BASE_URL inválida");}
  const publicDemo=env.PUBLIC_DEMO_ENABLED==="true",localHosts=["127.0.0.1","localhost","api","[::1]"];
  if(base.username||base.password||base.pathname!=="/"||base.search||base.hash)throw new Error("API_BASE_URL debe ser un origen sin credenciales");
  if(publicDemo){
    if(base.protocol!=="https:"||isIP(base.hostname)||base.hostname.endsWith(".internal")||localHosts.includes(base.hostname))
      throw new Error("API_BASE_URL pública debe usar HTTPS y un dominio público");
  }else if(base.protocol!=="http:"||!localHosts.includes(base.hostname))throw new Error("API_BASE_URL debe apuntar al API local");
  const key=env.TICKETS_LOCAL_KEY??"";
  if(!/^[a-f0-9]{64}$/.test(key)) throw new Error("TICKETS_LOCAL_KEY inválida");
  return {base:base.origin,key};
}

export function apiHeaders(config:ReturnType<typeof localApiConfig>,accept="application/json") {
  return {"X-Local-Api-Key":config.key,Accept:accept};
}
