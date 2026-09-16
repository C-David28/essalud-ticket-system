import { beforeEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Providers } from "../src/components/providers";
import { GeographicView } from "../src/components/geographic-view";

const api=vi.hoisted(()=>({getOrganizationCatalog:vi.fn(),listTickets:vi.fn()}));
vi.mock("../src/lib/organization-client",()=>({getOrganizationCatalog:api.getOrganizationCatalog}));
vi.mock("../src/lib/ticket-client",()=>({listTickets:api.listTickets}));

beforeEach(()=>{
  api.getOrganizationCatalog.mockReset().mockResolvedValue({
    network:{networkId:"red",code:"PASCO_DEMO",name:"Red demo",active:true},
    centers:[
      {centerId:"center-visible",code:"HOSPITAL_DEMO",name:"Hospital demo",type:"HOSPITAL",active:true,
        location:{latitude:-10.6868,longitude:-76.2565,source:"CONFIGURED"},areas:[]},
      {centerId:"center-no-location",code:"SIN_UBICACION",name:"Sede sin ubicación",type:"CAP",active:true,location:null,areas:[]},
    ],roles:[],
  });
  api.listTickets.mockReset().mockResolvedValue([{ticketId:"ticket-1",id:"INC-2026-0001",title:"Incidencia geográfica demo",
    description:"Descripción ficticia",category:"Redes y conectividad",center:"Hospital demo",centerId:"center-visible",area:"TI",
    priority:"Alta",status:"Abierto",createdAt:"2026-09-15T12:00:00Z",requester:"demo",assignee:null}]);
});

it("mantiene una vista geográfica funcional cuando Google Maps no está configurado",async()=>{
  const session={authenticated:true as const,redAsistencialId:"red",userId:"user",displayName:"Técnico demo",
    roles:["TECNICO_N1" as const],scope:"SEDE" as const,centerIds:["center-visible"],permissions:["organization:read","tickets:list"]};
  render(<Providers><GeographicView session={session} mapsConfig={{enabled:false,apiKey:"",mapId:"DEMO_MAP_ID"}}/></Providers>);
  expect(await screen.findByRole("heading",{name:"Mapa de sedes e incidencias"})).toBeTruthy();
  expect(screen.getByText("Google Maps está desactivado")).toBeTruthy();
  expect(screen.getByText("Hospital demo")).toBeTruthy();
  expect(screen.getByText("INC-2026-0001")).toBeTruthy();
  expect(screen.queryByText("Sede sin ubicación")).toBeNull();
  expect(screen.getByText(/1 SEDES/,{selector:".catalog-code"})).toBeTruthy();
});
