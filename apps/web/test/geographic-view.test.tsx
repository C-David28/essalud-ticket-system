import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Providers } from "../src/components/providers";
import { GeographicView } from "../src/components/geographic-view";
import type { DemoTicket } from "../src/lib/demo-tickets";
import { serverPage, serverSummary } from "./ticket-server-fixture";

const api = vi.hoisted(() => ({ getOrganizationCatalog: vi.fn(), listTicketPage: vi.fn(), getTicketSummary: vi.fn(), getTicket: vi.fn() }));
vi.mock("../src/lib/organization-client", () => ({ getOrganizationCatalog: api.getOrganizationCatalog }));
vi.mock("../src/lib/ticket-client", async importOriginal => ({ ...await importOriginal<typeof import("../src/lib/ticket-client")>(), ...api }));
const centerId="11111111-1111-4111-8111-111111111111",otherId="22222222-2222-4222-8222-222222222222";
const session = { authenticated: true as const, redAsistencialId: "red", userId: "user", displayName: "Técnico demo",
  roles: ["TECNICO_N1" as const], scope: "SEDE" as const, centerIds: [centerId,otherId], permissions: ["organization:read", "tickets:list"] };
let server:DemoTicket[]=[];
let catalog:Record<string,unknown>;
class FakeEventSource { addEventListener(){} close(){} }
beforeEach(() => {
  vi.stubGlobal("EventSource",FakeEventSource);
  catalog={ network: { networkId: "red", code: "PASCO_DEMO", name: "Red demo", active: true },
    centers: [
      { centerId, code: "HOSPITAL_DEMO", name: "Hospital demo", type: "HOSPITAL", active: true,
        location: { latitude: -10.6868, longitude: -76.2565, source: "CONFIGURED" }, areas: [] },
      { centerId: "center-no-location", code: "SIN_UBICACION", name: "Sede sin ubicación", type: "CAP", active: true, location: null, areas: [] },
    ], roles: [] };
  api.getOrganizationCatalog.mockReset().mockImplementation(async()=>catalog);
  server=[{ ticketId: "00000000-0000-4000-8000-000000000001", id: "INC-2026-0001", title: "Incidencia geográfica demo",
    description: "Descripción ficticia", category: "Redes y conectividad", center: "Hospital demo", centerId, area: "TI",
    priority: "Alta", status: "Abierto", createdAt: "2026-09-15T12:00:00Z", requester: "demo", assignee: null }];
  api.listTicketPage.mockReset().mockImplementation(async(filters,page,pageSize,audience)=>serverPage(server,filters,page,pageSize,audience));
  api.getTicketSummary.mockReset().mockImplementation(async(filters,audience)=>serverSummary(server,filters,audience));
  api.getTicket.mockReset();
});

it("mantiene una vista geográfica funcional cuando Google Maps no está configurado", async () => {
  render(<Providers><GeographicView session={session} mapsConfig={{ enabled: false, apiKey: "", mapId: "DEMO_MAP_ID" }} /></Providers>);
  expect(await screen.findByRole("heading", { name: "Mapa de sedes e incidencias" })).toBeTruthy();
  expect(screen.getByText("Google Maps está desactivado")).toBeTruthy();
  expect(screen.getByText("Hospital demo")).toBeTruthy();
  expect(await screen.findByText("INC-2026-0001")).toBeTruthy();
  expect(screen.queryByText("Sede sin ubicación")).toBeNull();
  expect(screen.getByText(/1 SEDES/, { selector: ".catalog-code" })).toBeTruthy();
  expect(api.listTicketPage.mock.lastCall?.slice(0,3)).toEqual([expect.objectContaining({centerId,view:"all"}),1,25]);
});
it("recupera una sede inicial fuera del catálogo sin consultar páginas ajenas",async()=>{
  render(<Providers><GeographicView session={session} mapsConfig={{enabled:false,apiKey:"",mapId:"DEMO"}}
    initialCenterId="99999999-9999-4999-8999-999999999999"/></Providers>);
  expect(await screen.findByText("INC-2026-0001")).toBeTruthy();
  expect(api.listTicketPage.mock.calls.every(([filters])=>filters.centerId===centerId)).toBe(true);
  expect(screen.getByRole("button",{name:"Ver incidencias de Hospital demo"}).getAttribute("aria-pressed")).toBe("true");
});
it("no descarga páginas cuando no hay sedes autorizadas con coordenadas",async()=>{
  catalog={...catalog,centers:[{centerId,name:"Hospital demo",active:true,location:null,areas:[]}]};
  render(<Providers><GeographicView session={session} mapsConfig={{enabled:false,apiKey:"",mapId:"DEMO"}} initialCenterId={centerId}/></Providers>);
  expect(await screen.findByText("No hay sedes con coordenadas dentro de tu alcance.")).toBeTruthy();
  expect(api.listTicketPage).not.toHaveBeenCalled();
});
it("al cambiar de principal selecciona una sede de su nuevo catálogo sin reutilizar páginas anteriores",async()=>{
  const rendered=render(<Providers><GeographicView session={session} mapsConfig={{enabled:false,apiKey:"",mapId:"DEMO"}}/></Providers>);
  await screen.findByText("INC-2026-0001");
  const previousCalls=api.listTicketPage.mock.calls.length;
  catalog={...catalog,centers:[{centerId:otherId,code:"NEW_SEDE",name:"Sede del nuevo principal",type:"CAP",active:true,
    location:{latitude:-10.7,longitude:-76.3,source:"CONFIGURED"},areas:[]}]};
  server=[{...server[0],ticketId:"00000000-0000-4000-8000-000000000002",id:"NEW-0002",centerId:otherId,center:"Sede del nuevo principal"}];
  const nextSession={...session,userId:"new-user",redAsistencialId:"new-red",centerIds:[otherId]};
  rendered.rerender(<Providers><GeographicView session={nextSession} mapsConfig={{enabled:false,apiKey:"",mapId:"DEMO"}}/></Providers>);
  expect(screen.queryByText("INC-2026-0001")).toBeNull();
  expect(await screen.findByText("NEW-0002")).toBeTruthy();
  expect(api.listTicketPage.mock.calls.slice(previousCalls).every(([filters])=>filters.centerId===otherId)).toBe(true);
  expect(screen.getByRole("button",{name:"Ver incidencias de Sede del nuevo principal"}).getAttribute("aria-pressed")).toBe("true");
});

it("muestra agregados de más de 100 tickets y descarga sólo la página de la sede seleccionada",async()=>{
  const user=userEvent.setup();
  catalog.centers=[...(catalog.centers as unknown[]),{centerId:otherId,code:"CAP_DEMO",name:"Otra sede demo",type:"CAP",active:true,
    location:{latitude:-10.7,longitude:-76.3,source:"CONFIGURED"},areas:[]}];
  const first=server[0];
  server=Array.from({length:133},(_,index)=>({...first,ticketId:"00000000-0000-4000-8000-"+String(index+1).padStart(12,"0"),
    id:"MAP-"+String(index+1).padStart(3,"0"),title:"Ticket de mapa "+(index+1),centerId:index<130?centerId:otherId,
    center:index<130?"Hospital demo":"Otra sede demo",status:index===129?"Resuelto" as const:"Abierto" as const}));
  render(<Providers><GeographicView session={session} mapsConfig={{enabled:false,apiKey:"",mapId:"DEMO"}}/></Providers>);
  const summary=await screen.findByLabelText("Resumen geográfico");expect(summary.textContent).toContain("133");
  const selected=await screen.findByLabelText("Incidencias de Hospital demo");
  expect(await within(selected).findAllByRole("link")).toHaveLength(25);
  expect(screen.queryByText("MAP-131")).toBeNull();
  await user.click(within(selected).getByRole("button",{name:"Siguiente"}));
  await waitFor(()=>expect(api.listTicketPage.mock.lastCall?.[1]).toBe(2));
  expect(await screen.findByText("MAP-026")).toBeTruthy();
  await user.click(screen.getByRole("button",{name:"Ver incidencias de Otra sede demo"}));
  expect(await screen.findByText("MAP-131")).toBeTruthy();
  expect(screen.queryByText("MAP-026")).toBeNull();
  expect(api.listTicketPage.mock.lastCall?.slice(0,3)).toEqual([expect.objectContaining({centerId:otherId}),1,25]);
  expect(api.listTicketPage.mock.calls.every(([filters,,size])=>!!filters.centerId&&size===25)).toBe(true);
  expect(screen.getByRole("link",{name:/MAP-131/}).getAttribute("href")).toBe("/tecnico?ticket="+server[130].ticketId);
  expect(api.getTicket).not.toHaveBeenCalled();
  await user.selectOptions(screen.getByRole("combobox",{name:"Filtrar mapa por estado"}),"Resuelto");
  expect(await screen.findByText("Sin tickets con los filtros actuales")).toBeTruthy();
  expect(api.getTicketSummary.mock.lastCall?.[0]).toEqual({view:"all",status:"Resuelto",priority:""});
});
