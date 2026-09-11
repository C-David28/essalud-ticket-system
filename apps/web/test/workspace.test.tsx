import { beforeEach, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Providers } from "../src/components/providers";
import { TicketWorkspace } from "../src/components/ticket-workspace";
import { initialTickets, makeDemoTicket, type DemoTicket } from "../src/lib/demo-tickets";

const api=vi.hoisted(()=>({listTickets:vi.fn(),createTicket:vi.fn(),transitionTicket:vi.fn()}));
vi.mock("../src/lib/ticket-client",()=>api);
class FakeEventSource {
  onopen:null|(()=>void)=null;onerror:null|(()=>void)=null;
  constructor(public url:string){queueMicrotask(()=>this.onopen?.());}
  addEventListener(){} close(){}
}
let server:DemoTicket[]=[];
beforeEach(()=>{
  server=initialTickets();
  api.listTickets.mockReset().mockImplementation(async()=>server.map(ticket=>({...ticket})));
  api.createTicket.mockReset().mockImplementation(async draft=>{
    const ticket=makeDemoTicket(draft,"NEW","2026-09-11T12:00:00Z");server=[ticket,...server];return ticket;
  });
  api.transitionTicket.mockReset().mockImplementation(async(ticketId,status)=>{
    server=server.map(ticket=>ticket.ticketId===ticketId?{...ticket,status}:ticket);
    return server.find(ticket=>ticket.ticketId===ticketId);
  });
  vi.stubGlobal("EventSource",FakeEventSource);
});
function setup(mode:"portal"|"tecnico"="portal") {
  const user=userEvent.setup();
  render(<Providers><TicketWorkspace mode={mode}/></Providers>);return user;
}
it("portal carga solicitudes persistentes y recupera un filtro vacío",async()=>{
  const user=setup();
  expect(await screen.findAllByRole("button",{name:/^Ver DEMO/})).toHaveLength(3);
  await user.type(screen.getByRole("textbox",{name:"Buscar solicitudes"}),"sin coincidencias");
  expect(screen.getByText("No encontramos solicitudes")).toBeTruthy();
  await user.click(screen.getByRole("button",{name:"Limpiar filtros"}));
  expect(screen.getAllByRole("button",{name:/^Ver DEMO/})).toHaveLength(3);
});
it("formulario valida y persiste una solicitud mediante el API",async()=>{
  const user=setup();await screen.findAllByRole("button",{name:/^Ver DEMO/});
  await user.click(screen.getByRole("button",{name:"Nueva solicitud de prueba"}));
  await user.click(screen.getByRole("button",{name:"Crear solicitud de prueba"}));
  expect(screen.getByText("Escribe un título de 5 a 120 caracteres.")).toBeTruthy();
  expect(document.activeElement?.id).toBe("draft-title");
  await user.type(screen.getByLabelText(/Qué necesitas resolver/),"Estación de trabajo de prueba");
  await user.type(screen.getByLabelText(/Describe el problema/),"El equipo ficticio no responde al abrir una aplicación local.");
  await user.click(screen.getByRole("button",{name:"Crear solicitud de prueba"}));
  expect(await screen.findByText(/guardada en PostgreSQL/)).toBeTruthy();
  expect(api.createTicket).toHaveBeenCalledOnce();
  expect(await screen.findAllByRole("button",{name:/^Ver (DEMO|DEMO-NEW)/})).toHaveLength(4);
});
it("Kanban filtra y aplica solo la siguiente transición con motivo",async()=>{
  const user=setup("tecnico");
  expect(await screen.findAllByRole("button",{name:/^Ver DEMO/})).toHaveLength(7);
  await user.selectOptions(screen.getByRole("combobox",{name:"Filtrar por prioridad"}),"Alta");
  expect(screen.getAllByRole("button",{name:/^Ver DEMO/})).toHaveLength(2);
  await user.selectOptions(screen.getByRole("combobox",{name:"Filtrar por prioridad"}),"");
  await user.click(screen.getByRole("button",{name:/Ver DEMO-001/}));
  expect((screen.getByRole("combobox",{name:"Siguiente estado"}) as HTMLSelectElement).value).toBe("En Proceso");
  await user.type(screen.getByLabelText("Motivo"),"Atención técnica iniciada");
  await user.click(screen.getByRole("button",{name:"Guardar cambio"}));
  await user.click(screen.getByRole("button",{name:"Cerrar detalle"}));
  const moved=within(screen.getByRole("region",{name:"En Proceso"})).getByRole("button",{name:/Ver DEMO-001/});
  expect(moved).toBeTruthy();expect(api.transitionTicket).toHaveBeenCalledOnce();
});
