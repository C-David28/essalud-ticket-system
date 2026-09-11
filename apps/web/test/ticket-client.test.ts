import { afterEach, expect, it, vi } from "vitest";
import { createTicket, listTickets, transitionTicket } from "../src/lib/ticket-client";
import { CATEGORIES, CENTERS, type TicketDraft } from "../src/lib/demo-tickets";

const apiTicket={ticketId:"11111111-1111-4111-8111-111111111111",codigo:"INC-2026-0001",
 titulo:"Equipo sin conexión",descripcion:"Descripción ficticia suficientemente extensa",categoria:"REDES",
 prioridad:"CRITICA",estado:"ABIERTO",createdAt:"2026-09-11T12:00:00Z",solicitanteId:"22222222-2222-4222-8222-222222222222"};
afterEach(()=>vi.unstubAllGlobals());
it("mapea el contrato del API al tablero",async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(Response.json({items:[apiTicket]}));vi.stubGlobal("fetch",fetcher);
 const tickets=await listTickets();expect(tickets[0]).toMatchObject({ticketId:apiTicket.ticketId,id:"INC-2026-0001",
  category:"Redes y conectividad",priority:"Crítica",status:"Abierto"});
 expect(String(fetcher.mock.calls[0][0])).toBe("/api/tickets?page=1&pageSize=100");
});
it("crea y transiciona usando nombres del dominio",async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(apiTicket,{status:201}))
  .mockResolvedValueOnce(Response.json({...apiTicket,estado:"EN_PROCESO"}));vi.stubGlobal("fetch",fetcher);
 const draft:TicketDraft={title:apiTicket.titulo,description:apiTicket.descripcion,category:CATEGORIES[1],
  priority:"Crítica",center:CENTERS[0],area:"Área ficticia de pruebas"};
 await createTicket(draft);await transitionTicket(apiTicket.ticketId,"En Proceso","Atención iniciada");
 expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({categoria:"REDES",prioridad:"CRITICA"});
 expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({estado:"EN_PROCESO",motivo:"Atención iniciada"});
});
it("presenta el conflicto de transición sin filtrar la respuesta interna",async()=>{
 vi.stubGlobal("fetch",vi.fn<typeof fetch>().mockResolvedValue(Response.json({detail:"secreto"},{status:409})));
 await expect(transitionTicket(apiTicket.ticketId,"Cerrado","Salto inválido")).rejects.toThrow("transición no está permitida");
});
