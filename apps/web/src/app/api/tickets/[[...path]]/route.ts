import { apiHeaders, localApiConfig } from "@/lib/local-api";
import { staffToken } from "@/lib/staff-session";

export const dynamic="force-dynamic";
export const runtime="nodejs";
type Context={params:Promise<{path?:string[]}>};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

function allowed(method:string,path:string[]) {
  if(path.length===0) return method==="GET"||method==="POST";
  if(path.length===2&&path[0]==="asignacion"&&path[1]==="tecnicos") return method==="GET";
  if(path.length===1&&uuid.test(path[0]??"")) return ["GET","PATCH","DELETE"].includes(method);
  if(path.length===2&&uuid.test(path[0]??"")&&path[1]==="estado") return method==="PATCH";
  if(path.length===2&&uuid.test(path[0]??"")&&path[1]==="asignacion") return method==="PATCH";
  if(path.length===3&&uuid.test(path[0]??"")&&path[1]==="estado"&&path[2]==="historial") return method==="GET";
  return path.length===3&&uuid.test(path[0]??"")&&path[1]==="asignacion"&&
    ((path[2]==="automatica"&&method==="POST")||(path[2]==="historial"&&method==="GET"));
}
async function proxy(request:Request,context:Context) {
  try {
    const path=(await context.params).path??[];
    if(!allowed(request.method,path)) return Response.json({message:"Ruta no disponible"},{status:404});
    const config=localApiConfig();
    const token=await staffToken();
    const url=new URL("/api/v1/tickets"+(path.length?"/"+path.map(encodeURIComponent).join("/"):""),config.base);
    if(!path.length&&request.method==="GET") for(const name of ["page","pageSize"])
      if(new URL(request.url).searchParams.has(name)) url.searchParams.set(name,new URL(request.url).searchParams.get(name)!);
    let body:string|undefined;
    if(request.method==="PATCH"||(request.method==="POST"&&!path.length)) {
      let value:Record<string,unknown>;
      try {value=await request.json() as Record<string,unknown>;}
      catch {return Response.json({message:"Solicitud inválida"},{status:400,headers:{"Cache-Control":"no-store"}});}
      body=JSON.stringify(value);
    }
    const response=await fetch(url,{method:request.method,headers:{...apiHeaders(config),...(token?{Authorization:"Bearer "+token}:{}),...(body?{"Content-Type":"application/json"}:{})},
      body,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(12000)});
    const responseBody=response.status===204?null:await response.arrayBuffer();
    return new Response(responseBody,{status:response.status,headers:{
      "Content-Type":response.headers.get("content-type")??"application/json",
      "Cache-Control":"no-store",
      ...(response.headers.get("x-request-id")?{"X-Request-Id":response.headers.get("x-request-id")!}:{}),
    }});
  } catch {return Response.json({message:"API local no disponible"},{status:503,headers:{"Cache-Control":"no-store"}});}
}
export const GET=proxy;
export const POST=proxy;
export const PATCH=proxy;
export const DELETE=proxy;
