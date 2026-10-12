import { beforeEach, it, expect, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Providers, ticketScope, useTickets } from "../src/components/providers";
import { TicketWorkspace } from "../src/components/ticket-workspace";
import { initialTickets, makeDemoTicket, type DemoTicket } from "../src/lib/demo-tickets";
import { authorizedTickets, serverPage, serverSummary } from "./ticket-server-fixture";

const api=vi.hoisted(()=>({
  listTicketPage:vi.fn(),getTicketSummary:vi.fn(),getTicket:vi.fn(),listTechnicians:vi.fn(),createTicket:vi.fn(),transitionTicket:vi.fn(),
  assignTicket:vi.fn(),autoAssignTicket:vi.fn(),
  getPublicOrganizationCatalog:vi.fn(),
}));
vi.mock("../src/lib/ticket-client",async importOriginal=>({...await importOriginal<typeof import("../src/lib/ticket-client")>(),...api}));
vi.mock("../src/lib/organization-client",()=>({getPublicOrganizationCatalog:api.getPublicOrganizationCatalog}));
class FakeEventSource {
  static instances:FakeEventSource[]=[];
  listeners=new Map<string,()=>void>();
  onopen:null|(()=>void)=null;onerror:null|(()=>void)=null;
  constructor(public url:string){FakeEventSource.instances.push(this);queueMicrotask(()=>this.onopen?.());}
  addEventListener(name:string,listener:()=>void){this.listeners.set(name,listener);} close(){}
  emit(){this.listeners.get("ticket")?.();}
}
let server:DemoTicket[]=[];
beforeEach(()=>{
  api.getPublicOrganizationCatalog.mockReset().mockResolvedValue({network:{networkId:"red",code:"DEMO",name:"Red demo",active:true},
    centers:[{centerId:"33333333-3333-4333-8333-333333333333",code:"SEDE_DEMO",name:"Centro ficticio de pruebas",
      type:"CAP",active:true,address:"Dirección demo",location:null,
      areas:[{areaId:"44444444-4444-4444-8444-444444444444",code:"AREA_DEMO",name:"Área ficticia de pruebas",active:true}]}]});
  FakeEventSource.instances=[];
  server=initialTickets().map(ticket=>({...ticket,centerId:ticket.center==="Centro ficticio de pruebas"?"33333333-3333-4333-8333-333333333333":"55555555-5555-4555-8555-555555555555"}));
  api.listTicketPage.mockReset().mockImplementation(async(filters,page,pageSize,audience)=>serverPage(server,filters,page,pageSize,audience));
  api.getTicketSummary.mockReset().mockImplementation(async(filters,audience)=>serverSummary(server,filters,audience));
  api.getTicket.mockReset().mockImplementation(async(id,audience)=>{
    const ticket=authorizedTickets(server,audience).find(ticket=>ticket.ticketId===id);
    if(!ticket)throw new Error("No autorizado");return {...ticket};
  });
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
function setup(mode:"portal"|"tecnico"="portal",props:{initialTicket?:string;initialCenterId?:string}={}) {
  const user=userEvent.setup();
  const access=mode==="tecnico"?{authenticated:true as const,redAsistencialId:"30000000-0000-4000-8000-000000000001",userId:"34000000-0000-4000-8000-000000000001",
    displayName:"Supervisor demo",roles:["SUPERVISOR_RED" as const],scope:"RED" as const,centerIds:[],
    permissions:["tickets:transition","tickets:assign"]}:undefined;
  render(<Providers><TicketWorkspace mode={mode} access={access} {...props}/></Providers>);return user;
}
it("portal carga solicitudes persistentes y recupera un filtro vacío",async()=>{
  const user=setup();
  expect(await screen.findAllByRole("button",{name:/^Ver DEMO/})).toHaveLength(2);
  expect(api.listTechnicians).not.toHaveBeenCalled();
  await user.type(screen.getByRole("textbox",{name:"Buscar solicitudes"}),"sin coincidencias");
  expect(await screen.findByText("No encontramos solicitudes")).toBeTruthy();
  await user.click(screen.getByRole("button",{name:"Limpiar filtros"}));
  expect(await screen.findAllByRole("button",{name:/^Ver DEMO/})).toHaveLength(2);
  await user.click(screen.getByRole("button",{name:/^Historial/}));
  expect(await screen.findByRole("button",{name:/Ver DEMO-006/})).toBeTruthy();
});
function largeServer(count=126) {
  return Array.from({length:count},(_,index)=>({...server[0],
    ticketId:"00000000-0000-4000-8000-"+String(index+1).padStart(12,"0"),
    id:"LARGE-"+String(index+1).padStart(3,"0"), title:"Solicitud numerada "+(index+1),
    status:index===count-1?"Resuelto" as const:"Abierto" as const,
  }));
}
it("pagina más de 100 registros y aplica búsqueda y filtros en el servidor desde página uno",async()=>{
  server=largeServer();const user=setup("tecnico");
  expect(await screen.findAllByRole("button",{name:/^Ver LARGE/})).toHaveLength(25);
  expect(screen.getByRole("button",{name:/Trabajo activo 125/})).toBeTruthy();
  for(let page=2;page<=5;page++) {
    await user.click(screen.getByRole("button",{name:"Siguiente"}));
    await waitFor(()=>expect(api.listTicketPage.mock.lastCall?.[1]).toBe(page));
    await waitFor(()=>expect((screen.getByRole("button",{name:"Siguiente"}) as HTMLButtonElement).disabled).toBe(page===5));
  }
  expect(await screen.findByRole("button",{name:/Ver LARGE-101/})).toBeTruthy();
  await user.type(screen.getByRole("textbox",{name:"Buscar solicitudes"}),"LARGE-120");
  await waitFor(()=>expect(screen.getAllByRole("button",{name:/^Ver LARGE/})).toHaveLength(1));
  expect(api.listTicketPage.mock.lastCall?.slice(0,3)).toEqual([expect.objectContaining({search:"LARGE-120",view:"active"}),1,25]);
  expect(api.listTicketPage.mock.calls.some(([filters,page])=>filters.search==="LARGE-120"&&page!==1)).toBe(false);
  await user.selectOptions(screen.getByRole("combobox",{name:"Filtrar por categoría"}),"Infraestructura");
  expect(await screen.findByText("No encontramos solicitudes")).toBeTruthy();
  expect(api.listTicketPage.mock.lastCall?.[0]).toMatchObject({category:"Infraestructura"});
});
it("abre un UUID histórico fuera de la página y conserva el detalle al reabrir la atención",async()=>{
  server=largeServer();const historical=server.at(-1)!;
  const user=setup("tecnico",{initialTicket:historical.ticketId});
  expect(await screen.findByRole("dialog",{name:historical.title})).toBeTruthy();
  expect(api.getTicket).toHaveBeenCalledWith(historical.ticketId,"staff");
  expect(api.listTicketPage.mock.calls.every(([, ,pageSize])=>pageSize===25)).toBe(true);
  await user.click(screen.getByRole("button",{name:"Cerrar detalle"}));
  await user.click(screen.getByRole("button",{name:/^Historial/}));
  expect(await screen.findByRole("table",{name:"Historial de solicitudes"})).toBeTruthy();
  await user.click(screen.getByRole("button",{name:/Ver LARGE-126/}));
  await screen.findByRole("combobox",{name:"Siguiente estado"});
  await user.type(screen.getByLabelText("Motivo"),"Reapertura solicitada por validación");
  await user.click(screen.getByRole("button",{name:"Guardar cambio"}));
  expect(await screen.findByText("En Proceso",{selector:".status-badge"})).toBeTruthy();
  expect(screen.getByRole("dialog",{name:historical.title})).toBeTruthy();
  await user.click(screen.getByRole("button",{name:"Cerrar detalle"}));
  expect(await screen.findByText("No encontramos solicitudes")).toBeTruthy();
  await user.click(screen.getByRole("button",{name:/^Trabajo activo/}));
  expect(await screen.findByRole("button",{name:/Trabajo activo 126/})).toBeTruthy();
  expect(server).toHaveLength(126);expect(server.find(ticket=>ticket.ticketId===historical.ticketId)?.status).toBe("En Proceso");
});
it("SSE refresca página, resumen y detalle sin restaurar el filtro inicial de sede",async()=>{
  const user=setup("tecnico",{initialCenterId:"33333333-3333-4333-8333-333333333333"});
  expect(await screen.findAllByRole("button",{name:/^Ver DEMO/})).toHaveLength(3);
  await user.selectOptions(screen.getByRole("combobox",{name:"Filtrar por centro"}),"");
  await waitFor(()=>expect(screen.getAllByRole("button",{name:/^Ver DEMO/})).toHaveLength(5));
  await user.click(screen.getByRole("button",{name:/Ver DEMO-001/}));
  await screen.findByRole("dialog",{name:server[0].title});
  const listCalls=api.listTicketPage.mock.calls.length,summaryCalls=api.getTicketSummary.mock.calls.length,detailCalls=api.getTicket.mock.calls.length;
  server=server.map(ticket=>ticket.id==="DEMO-001"?{...ticket,status:"Resuelto"}:ticket);
  FakeEventSource.instances.at(-1)!.emit();
  expect(await screen.findByText("Resuelto",{selector:".status-badge"})).toBeTruthy();
  await waitFor(()=>expect(api.listTicketPage.mock.calls.length).toBeGreaterThan(listCalls));
  expect(api.getTicketSummary.mock.calls.length).toBeGreaterThan(summaryCalls);expect(api.getTicket.mock.calls.length).toBeGreaterThan(detailCalls);
  await user.click(screen.getByRole("button",{name:"Cerrar detalle"}));
  expect((screen.getByRole("combobox",{name:"Filtrar por centro"}) as HTMLSelectElement).value).toBe("");
  expect(api.listTicketPage.mock.lastCall?.[0]).toMatchObject({centerId:"",view:"active"});
  expect(screen.getByRole("button",{name:/Historial 3/})).toBeTruthy();
  const source=FakeEventSource.instances.at(-1)!;source.onerror?.();
  expect(await screen.findByText("Reconectando")).toBeTruthy();source.onopen?.();
  expect(await screen.findByText("Tiempo real activo")).toBeTruthy();
});
it("portal utiliza contexto público también para eventos y mantiene totales fuera de su página",async()=>{
  server=largeServer();setup();
  expect(await screen.findAllByRole("button",{name:/^Ver LARGE/})).toHaveLength(25);
  expect(screen.getByRole("button",{name:/Trabajo activo 125/})).toBeTruthy();
  expect(api.listTicketPage.mock.lastCall?.[3]).toBe("public");expect(api.getTicketSummary.mock.lastCall?.[1]).toBe("public");
  expect(FakeEventSource.instances.at(-1)?.url).toBe("/api/tickets/events?audience=public");
});
it("aísla la caché al cambiar de principal dentro del mismo Provider",async()=>{
  const access={authenticated:true as const,redAsistencialId:"red-one",userId:"user-one",displayName:"Supervisor",
    roles:["SUPERVISOR_RED" as const],scope:"RED" as const,centerIds:[],permissions:["tickets:list"]};
  const nextAccess={...access,userId:"user-two",redAsistencialId:"red-two",centerIds:["33333333-3333-4333-8333-333333333333"]};
  expect(ticketScope()).not.toBe(ticketScope(access));expect(ticketScope(access)).not.toBe(ticketScope(nextAccess));
  const rendered=render(<Providers><TicketWorkspace mode="tecnico" access={access}/></Providers>);
  await screen.findByRole("button",{name:/Ver DEMO-001/});
  let release:(value:ReturnType<typeof serverPage>)=>void=()=>{};
  api.listTicketPage.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
  rendered.rerender(<Providers><TicketWorkspace mode="tecnico" access={nextAccess}/></Providers>);
  expect(screen.queryByRole("button",{name:/Ver DEMO-001/})).toBeNull();
  expect(await screen.findByText("Cargando solicitudes")).toBeTruthy();
  release(serverPage([{...server[0],id:"OTHER-001",title:"Otro principal autorizado"}],{view:"active"}));
  expect(await screen.findByRole("button",{name:/Ver OTHER-001/})).toBeTruthy();
  expect(screen.queryByRole("button",{name:/Ver DEMO-001/})).toBeNull();
});
it("una transición pendiente conserva la caché del principal que la inició",async()=>{
  const user=userEvent.setup(),cache=new QueryClient({defaultOptions:{queries:{retry:false}}});
  const scopeA="staff-principal-A",scopeB="staff-principal-B",ticketId=server[0].ticketId;
  let principal=scopeA,complete:(ticket:DemoTicket)=>void=()=>{};
  api.getTicket.mockImplementation(()=>principal===scopeA?Promise.resolve({...server[0]}):new Promise(()=>{}));
  api.transitionTicket.mockImplementation(()=>new Promise(resolve=>{complete=resolve;}));
  function PendingTransition({scope}:{scope:string}) {
    const state=useTickets({scope,selectedTicketId:ticketId,filters:{view:"active"}});
    return <><button onClick={()=>void state.move(ticketId,"En Proceso","Atención iniciada por A")}>Iniciar transición</button>
      <span>{state.detail?.title??"Detalle pendiente del principal actual"}</span></>;
  }
  const rendered=render(<QueryClientProvider client={cache}><PendingTransition scope={scopeA}/></QueryClientProvider>);
  await screen.findByText(server[0].title);
  await user.click(screen.getByRole("button",{name:"Iniciar transición"}));
  expect(api.transitionTicket).toHaveBeenCalledOnce();
  principal=scopeB;
  rendered.rerender(<QueryClientProvider client={cache}><PendingTransition scope={scopeB}/></QueryClientProvider>);
  await screen.findByText("Detalle pendiente del principal actual");
  const result={...server[0],status:"En Proceso" as const,title:"Detalle exclusivo del principal A"};complete(result);
  await waitFor(()=>expect(cache.getQueryData(["tickets",scopeA,"detail",ticketId])).toMatchObject({title:result.title,status:"En Proceso"}));
  expect(cache.getQueryData(["tickets",scopeB,"detail",ticketId])).toBeUndefined();
  expect(screen.queryByText(result.title)).toBeNull();
  expect(screen.getByText("Detalle pendiente del principal actual")).toBeTruthy();
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
  expect(await screen.findAllByRole("button",{name:/^Ver (DEMO|DEMO-NEW)/})).toHaveLength(3);
});
it("crear desde el historial regresa al trabajo activo y muestra la nueva solicitud",async()=>{
  const user=setup();await screen.findAllByRole("button",{name:/^Ver DEMO/});
  await user.click(screen.getByRole("button",{name:/^Historial/}));
  await screen.findByRole("button",{name:/Ver DEMO-006/});
  await user.click(screen.getByRole("button",{name:"Reportar incidencia"}));
  await user.type(screen.getByLabelText(/Qué necesitas resolver/),"Nuevo equipo ficticio sin red");
  await user.type(screen.getByLabelText(/Describe el problema/),"La estación ficticia no conecta después de reiniciar el equipo.");
  await user.click(screen.getByRole("button",{name:"Enviar solicitud"}));
  expect(await screen.findByText(/guardada en PostgreSQL/)).toBeTruthy();
  expect(await screen.findByRole("button",{name:/Ver DEMO-NEW/})).toBeTruthy();
  expect(screen.getByRole("button",{name:/^Trabajo activo/}).getAttribute("aria-pressed")).toBe("true");
  expect(api.listTicketPage.mock.lastCall?.slice(0,2)).toEqual([expect.objectContaining({view:"active",search:"",status:"",centerId:""}),1]);
});
it("Kanban filtra y aplica solo la siguiente transición con motivo",async()=>{
  const user=setup("tecnico");
  expect(await screen.findAllByRole("button",{name:/^Ver DEMO/})).toHaveLength(5);
  expect(screen.queryByRole("region",{name:"Resuelto"})).toBeNull();
  await user.selectOptions(screen.getByRole("combobox",{name:"Filtrar por prioridad"}),"Alta");
  await waitFor(()=>expect(screen.getAllByRole("button",{name:/^Ver DEMO/})).toHaveLength(2));
  await user.selectOptions(screen.getByRole("combobox",{name:"Filtrar por prioridad"}),"");
  await user.click(await screen.findByRole("button",{name:/Ver DEMO-001/}));
  await screen.findByRole("combobox",{name:"Siguiente estado"});
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
  await user.click(await screen.findByRole("button",{name:"Asignar por menor carga"}));
  expect(api.autoAssignTicket).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001");
  expect(await screen.findByText(/Actual: Técnico local 02 · Automática/)).toBeTruthy();
});
