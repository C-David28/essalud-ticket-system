// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const config=vi.hoisted(()=>({staffToken:vi.fn(),base:"http://127.0.0.1:3001",key:"test-local-api-key"}));
vi.mock("../src/lib/local-api",()=>({localApiConfig:()=>({base:config.base,key:config.key}),
  apiHeaders:(_config:unknown,accept="application/json")=>({"X-Local-Api-Key":config.key,Accept:accept})}));
vi.mock("../src/lib/staff-session",()=>({staffToken:config.staffToken}));
import { GET, POST } from "../src/app/api/tickets/[[...path]]/route";
import { GET as events } from "../src/app/api/tickets/events/route";
const fetcher=vi.fn<typeof fetch>();
const context=(path:string[]=[])=>({params:Promise.resolve({path})});
beforeEach(()=>{config.staffToken.mockReset().mockResolvedValue("test-staff-cookie");fetcher.mockReset().mockImplementation(async()=>Response.json({items:[],page:1,pageSize:25,hasMore:false}));vi.stubGlobal("fetch",fetcher);});
afterEach(()=>vi.unstubAllGlobals());

it("el proxy permite resumen y reenvía sólo filtros/paginación definidos",async()=>{
  await GET(new Request("http://localhost/api/tickets?view=history&page=6&pageSize=25&search=prueba&estado=RESUELTO&prioridad=ALTA&categoria=REDES&centroAsistencialId=11111111-1111-4111-8111-111111111111&unexpected=ignored"),context());
  const list=new URL(String(fetcher.mock.calls[0][0]));expect(list.pathname).toBe("/api/v1/tickets");
  expect(Object.fromEntries(list.searchParams)).toEqual({view:"history",page:"6",pageSize:"25",search:"prueba",estado:"RESUELTO",prioridad:"ALTA",categoria:"REDES",centroAsistencialId:"11111111-1111-4111-8111-111111111111"});
  await GET(new Request("http://localhost/api/tickets/resumen?view=all&page=4&pageSize=100&search=prueba"),context(["resumen"]));
  const summary=new URL(String(fetcher.mock.calls[1][0]));expect(summary.pathname).toBe("/api/v1/tickets/resumen");
  expect(Object.fromEntries(summary.searchParams)).toEqual({view:"all",search:"prueba"});
  expect((await POST(new Request("http://localhost/api/tickets/resumen",{method:"POST"}),context(["resumen"]))).status).toBe(404);
});
it("el contexto público omite cookie staff en lista, resumen, detalle y creación sin perder autenticación local",async()=>{
  const id="11111111-1111-4111-8111-111111111111";
  for(const path of [[],["resumen"],[id]]) await GET(new Request("http://localhost/api/tickets/"+path.join("/"),{headers:{"X-Ticket-Audience":"public","Authorization":"Bearer forged"}}),context(path));
  await POST(new Request("http://localhost/api/tickets",{method:"POST",headers:{"Content-Type":"application/json","X-Ticket-Audience":"public"},body:JSON.stringify({titulo:"Incidencia pública"})}),context());
  expect(config.staffToken).not.toHaveBeenCalled();
  for(const [,init] of fetcher.mock.calls){const headers=new Headers(init?.headers);expect(headers.get("authorization")).toBeNull();expect(headers.get("x-local-api-key")).toBe(config.key);}
});
it("el contexto staff conserva JWT del servidor y una cabecera forjada nunca crea privilegios",async()=>{
  await GET(new Request("http://localhost/api/tickets",{headers:{"X-Ticket-Audience":"admin","Authorization":"Bearer forged"}}),context());
  expect(new Headers(fetcher.mock.calls[0][1]?.headers).get("authorization")).toBe("Bearer test-staff-cookie");
  config.staffToken.mockResolvedValue(null);
  await GET(new Request("http://localhost/api/tickets",{headers:{"X-Ticket-Audience":"staff","Authorization":"Bearer forged"}}),context());
  expect(new Headers(fetcher.mock.calls[1][1]?.headers).get("authorization")).toBeNull();
});
it("SSE público omite JWT y SSE staff preserva sesión y Last-Event-ID",async()=>{
  fetcher.mockImplementation(async()=>new Response("event: ticket\\n\\n",{headers:{"Content-Type":"text/event-stream"}}));
  await events(new Request("http://localhost/api/tickets/events?audience=public",{headers:{"Last-Event-ID":"event-123"}}));
  expect(config.staffToken).not.toHaveBeenCalled();expect(new Headers(fetcher.mock.calls[0][1]?.headers).get("authorization")).toBeNull();
  expect(new Headers(fetcher.mock.calls[0][1]?.headers).get("last-event-id")).toBe("event-123");
  await events(new Request("http://localhost/api/tickets/events?audience=admin"));
  expect(new Headers(fetcher.mock.calls[1][1]?.headers).get("authorization")).toBe("Bearer test-staff-cookie");
});
