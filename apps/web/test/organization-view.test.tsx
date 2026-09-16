import { beforeEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Providers } from "../src/components/providers";
import { OrganizationView } from "../src/components/organization-view";

const api=vi.hoisted(()=>({getOrganizationCatalog:vi.fn()}));
vi.mock("../src/lib/organization-client",()=>api);
beforeEach(()=>api.getOrganizationCatalog.mockReset().mockResolvedValue({
  network:{networkId:"1",code:"PASCO_DEMO",name:"Red Pasco - demostración",active:true},
  centers:[{centerId:"2",code:"HOSPITAL_DEMO",name:"Hospital demo",type:"HOSPITAL",active:true,
    location:{latitude:-10.6868,longitude:-76.2565,source:"CONFIGURED"},
    areas:[{areaId:"3",code:"TI_DEMO",name:"Tecnologías de información",active:true}]}],
  roles:[{roleId:"4",code:"TECNICO_N1",name:"Técnico N1",description:"Atiende incidencias de demostración.",scope:"SEDE",active:true}],
}));
it("presenta red, sedes, áreas y roles desde el catálogo configurable",async()=>{
  const session={authenticated:true as const,redAsistencialId:"1",userId:"user",displayName:"Técnico demo",roles:["TECNICO_N1" as const],scope:"SEDE" as const,centerIds:["2"],permissions:["organization:read"]};
  render(<Providers><OrganizationView session={session}/></Providers>);
  expect(await screen.findByRole("heading",{name:"Red Pasco - demostración"})).toBeTruthy();
  expect(screen.getByText("Hospital demo")).toBeTruthy();
  expect(screen.getByText("Tecnologías de información")).toBeTruthy();
  expect(screen.getByText("Técnico N1")).toBeTruthy();
  expect(screen.getByText("Sede")).toBeTruthy();
  expect(screen.getByText("Técnico demo · SEDE")).toBeTruthy();
});
