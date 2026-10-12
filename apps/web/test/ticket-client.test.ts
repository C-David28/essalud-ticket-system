import { afterEach, expect, it, vi } from "vitest";
import { assignTicket, autoAssignTicket, createTicket, getTicket, getTicketSummary, listTechnicians, listTicketPage, listTickets, transitionTicket } from "../src/lib/ticket-client";
import { CATEGORIES, CENTERS, type TicketDraft } from "../src/lib/demo-tickets";

const apiTicket={ticketId:"11111111-1111-4111-8111-111111111111",codigo:"INC-2026-0001",
 titulo:"Equipo sin conexión",descripcion:"Descripción ficticia suficientemente extensa",categoria:"REDES",
 prioridad:"CRITICA",estado:"ABIERTO",createdAt:"2026-09-11T12:00:00Z",solicitanteId:"22222222-2222-4222-8222-222222222222",
 centroAsistencialId:"33333333-3333-4333-8333-333333333333",areaId:"44444444-4444-4444-8444-444444444444",
 centroNombre:"Hospital DEMO",areaNombre:"TI DEMO",isDemo:true,assignedTo:null,assignedAt:null,assignmentMode:null};
afterEach(()=>vi.unstubAllGlobals());
it("mapea el contrato del API al tablero",async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(Response.json({items:[apiTicket],page:1,pageSize:25,hasMore:false}));vi.stubGlobal("fetch",fetcher);
 const tickets=await listTickets();expect(tickets[0]).toMatchObject({ticketId:apiTicket.ticketId,id:"INC-2026-0001",
  category:"Redes y conectividad",priority:"Crítica",status:"Abierto"});
 expect(String(fetcher.mock.calls[0][0])).toBe("/api/tickets?page=1&pageSize=25");
});
it("serializa filtros del servidor, página acotada, resumen y detalle directo",async()=>{
 const summary={total:142,active:135,history:7,priority:90,byState:{ABIERTO:135,EN_PROCESO:0,PENDIENTE:0,RESUELTO:7,CERRADO:0},centers:[]};
 const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({items:[apiTicket],page:6,pageSize:25,hasMore:true}))
  .mockResolvedValueOnce(Response.json(summary)).mockResolvedValueOnce(Response.json(apiTicket));vi.stubGlobal("fetch",fetcher);
 const filters={view:"active" as const,search:" x".repeat(70),status:"Abierto" as const,priority:"Crítica" as const,
  category:"Redes y conectividad" as const,centerId:apiTicket.centroAsistencialId};
 expect(await listTicketPage(filters,6,25,"public")).toMatchObject({page:6,pageSize:25,hasMore:true,items:[{id:apiTicket.codigo}]});
 const url=new URL(String(fetcher.mock.calls[0][0]),"http://localhost");
 expect(url.searchParams.get("search")).toHaveLength(100);expect(url.searchParams.get("estado")).toBe("ABIERTO");
 expect(url.searchParams.get("prioridad")).toBe("CRITICA");expect(url.searchParams.get("categoria")).toBe("REDES");
 expect(url.searchParams.get("centroAsistencialId")).toBe(apiTicket.centroAsistencialId);
 expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({"X-Ticket-Audience":"public"});
 expect(await getTicketSummary({view:"all"})).toEqual(summary);
 expect(String(fetcher.mock.calls[1][0])).toBe("/api/tickets/resumen?view=all");
 expect((await getTicket(apiTicket.ticketId)).ticketId).toBe(apiTicket.ticketId);
 expect(String(fetcher.mock.calls[2][0])).toBe("/api/tickets/"+apiTicket.ticketId);
 await expect(getTicket("INC-2026-0001")).rejects.toThrow("no es válido");expect(fetcher).toHaveBeenCalledTimes(3);
});
it("crea y transiciona usando nombres del dominio",async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(apiTicket,{status:201}))
  .mockResolvedValueOnce(Response.json({...apiTicket,estado:"EN_PROCESO"}));vi.stubGlobal("fetch",fetcher);
 const draft:TicketDraft={title:apiTicket.titulo,description:apiTicket.descripcion,category:CATEGORIES[1],
  priority:"Crítica",center:CENTERS[0],area:"Área ficticia de pruebas",centerId:apiTicket.centroAsistencialId,areaId:apiTicket.areaId};
 await createTicket(draft);await transitionTicket(apiTicket.ticketId,"En Proceso","Atención iniciada");
 expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({categoria:"REDES",prioridad:"CRITICA",
  centroAsistencialId:apiTicket.centroAsistencialId,areaId:apiTicket.areaId});
 expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({estado:"EN_PROCESO",motivo:"Atención iniciada"});
});
it("presenta el conflicto de transición sin filtrar la respuesta interna",async()=>{
 vi.stubGlobal("fetch",vi.fn<typeof fetch>().mockResolvedValue(Response.json({detail:"secreto"},{status:409})));
 await expect(transitionTicket(apiTicket.ticketId,"Cerrado","Salto inválido")).rejects.toThrow("transición no está permitida");
});
it("consulta carga y envía asignaciones manual y automática",async()=>{
 const technicians=[{technicianId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",name:"Técnico local 01",level:"N1",maxCapacity:4,activeLoad:1,availableCapacity:3}];
 const fetcher=vi.fn<typeof fetch>()
  .mockResolvedValueOnce(Response.json(technicians))
  .mockResolvedValueOnce(Response.json({...apiTicket,assignedTo:technicians[0].technicianId,assignmentMode:"MANUAL"}))
  .mockResolvedValueOnce(Response.json({...apiTicket,assignedTo:technicians[0].technicianId,assignmentMode:"AUTOMATICA"}));
 vi.stubGlobal("fetch",fetcher);
 expect(await listTechnicians()).toEqual(technicians);
 await assignTicket(apiTicket.ticketId,technicians[0].technicianId,"Asignación de prueba");
 await autoAssignTicket(apiTicket.ticketId);
 expect(String(fetcher.mock.calls[0][0])).toBe("/api/tickets/asignacion/tecnicos");
 expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({tecnicoId:technicians[0].technicianId,motivo:"Asignación de prueba"});
 expect(fetcher.mock.calls[2][1]?.method).toBe("POST");
 expect(fetcher.mock.calls[2][1]?.body).toBeUndefined();
});
