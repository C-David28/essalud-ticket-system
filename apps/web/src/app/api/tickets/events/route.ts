import { apiHeaders, localApiConfig } from "@/lib/local-api";
import { staffToken } from "@/lib/staff-session";

export const dynamic="force-dynamic";
export const runtime="nodejs";

export async function GET(request:Request) {
  try {
    const config=localApiConfig();
    const headers:Record<string,string>={...apiHeaders(config,"text/event-stream")};
    const token=await staffToken();if(token)headers.Authorization="Bearer "+token;
    const lastEventId=request.headers.get("last-event-id");
    if(lastEventId) headers["Last-Event-ID"]=lastEventId;
    const response=await fetch(new URL("/api/v1/tickets/events",config.base),{
      headers,cache:"no-store",redirect:"error",signal:request.signal,
    });
    if(!response.ok||!response.body) return Response.json({message:"Eventos no disponibles"},{status:503});
    return new Response(response.body,{headers:{
      "Content-Type":"text/event-stream; charset=utf-8","Cache-Control":"no-cache, no-transform",
      Connection:"keep-alive","X-Accel-Buffering":"no",
    }});
  } catch {return Response.json({message:"Eventos no disponibles"},{status:503});}
}
