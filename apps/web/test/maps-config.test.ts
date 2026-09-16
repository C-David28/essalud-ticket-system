// @vitest-environment node
import { describe,expect,it } from "vitest";
import { mapsClientConfig } from "../src/lib/maps-config";

describe("configuración opcional de Google Maps",()=>{
  it("mantiene Maps desactivado si no hay clave",()=>{
    expect(mapsClientConfig({})).toEqual({enabled:false,apiKey:"",mapId:"DEMO_MAP_ID"});
  });
  it("expone al cliente solo una clave de navegador configurada",()=>{
    expect(mapsClientConfig({GOOGLE_MAPS_BROWSER_KEY:"a".repeat(32),GOOGLE_MAPS_MAP_ID:"map-demo"}))
      .toEqual({enabled:true,apiKey:"a".repeat(32),mapId:"map-demo"});
  });
});
