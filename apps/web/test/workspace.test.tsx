import { beforeEach, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Providers } from "../src/components/providers";
import { TicketWorkspace } from "../src/components/ticket-workspace";
import { initialTickets, makeDemoTicket, type DemoTicket } from "../src/lib/demo-tickets";

const api=vi.hoisted(()=>({
  listTickets:vi.fn(),listTechnicians:vi.fn(),createTicket:vi.fn(),transitionTicket:vi.fn(),
  assignTicket:vi.fn(),autoAssignTicket:vi.fn(),
}));
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
  api.listTechnicians.mockReset().mockResolvedValue([
    {technicianId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",name:"Técnico local 01",level:"N1",maxCapacity:4,activeLoad:1,availableCapacity:3},
    {technicianId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",name:"Técnico local 02",level:"N1",maxCapacity:4,activeLoad:0,availableCapacity:4},
  ]);
  api.createTicket.mockReset().mockImplementation(async draft=>{
    const ticket=makeDemoTicket(draft,"NEW","2026-09-11T12:00:00Z");server=[ticket,...server];return ticket;
  });
  api.transitionTicket.mockReset().mockImplementation(async(ticketId,status)=>{
    server=server.map(ticket=>ticket.ticketId===ticketId?{...ticket,status}:ticket);
    return server.find(ticket=>ticket.ticketId===ticketId);
  });
  api.assignTicket.mockReset().mockImplementation(async(ticketId,technicianId)=>{
    server=server.map(ticket=>ticket.ticketId===ticketId?{...ticket,assigneeId:technicianId,assignmentMode:"MANUAL" as const}:ticket);
  });
  api.autoAssignTicket.mockReset().mockImplementation(async ticketId=>{
    server=server.map(ticket=>ticket.ticketId===ticketId?{...ticket,
      assigneeId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",assignmentMode:"AUTOMATICA" as const}:ticket);
  });
  vi.stubGlobal("EventSource",FakeEventSource);
});
function setup(mode:"portal"|"tecnico"="portal") {
  const user=userEvent.setup();
  const access=mode==="tecnico"?{authenticated:true as const,redAsistencialId:"30000000-0000-4000-8000-000000000001",userId:"34000000-0000-4000-8000-000000000001",
    displayName:"Supervisor demo",roles:["SUPERVISOR_RED" as const],scope:"RED" as const,centerIds:[],
    permissions:["tickets:transition","tickets:assign"]}:undefined;
  render(<Providers><TicketWorkspace mode={mode} access={access}/></Providers>);return user;
}
it("portal carga solicitudes persistentes y recupera un filtro vacío",async()=>{
  const user=setup();
  expect(await screen.findAllByRole("button",{name:/^Ver DEMO/})).toHaveLength(3);
  expect(api.listTechnicians).not.toHaveBeenCalled();
  await user.type(screen.getByRole("textbox",{name:"Buscar solicitudes"}),"sin coincidencias");
  expect(screen.getByText("No encontramos solicitudes")).toBeTruthy();
  await user.click(screen.getByRole("button",{name:"Limpiar filtros"}));
  expect(screen.getAllByRole("button",{name:/^Ver DEMO/})).toHaveLength(3);
});
it("formulario valida y persiste una solicitud mediante el API",async()=>{
  const user=setup();await screen.findAllByRole("button",{name:/^Ver DEMO/});
  await user.click(screen.getByRole("button",{name:"Reportar incidencia"}));
  await user.click(screen.getByRole("button",{name:"Enviar solicitud"}));
  expect(screen.getByText("Escribe un título de 5 a 120 caracteres.")).toBeTruthy();
  expect(document.activeElement?.id).toBe("draft-title");
  await user.type(screen.getByLabelText(/Qué necesitas resolver/),"Estación de trabajo de prueba");
  await user.type(screen.getByLabelText(/Describe el problema/),"El equipo ficticio no responde al abrir una aplicación local.");
  await user.click(screen.getByRole("button",{name:"Enviar solicitud"}));
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
it("Kanban muestra capacidad y asigna automáticamente por carga",async()=>{
  const user=setup("tecnico");
  const workload=await screen.findByLabelText("Carga activa por técnico");
  expect(workload.textContent).toContain("Técnico local 02N1");
  await user.click(screen.getByRole("button",{name:/Ver DEMO-001/}));
  await user.click(screen.getByRole("button",{name:"Asignar por menor carga"}));
  expect(api.autoAssignTicket).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001");
  expect(await screen.findByText(/Actual: Técnico local 02 · Automática/)).toBeTruthy();
});
