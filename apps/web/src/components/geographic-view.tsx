"use client";

import { useQuery } from "@tanstack/react-query";
import { Building2, CircleAlert, LocateFixed, MapPin, RefreshCw, Ticket } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { getOrganizationCatalog } from "@/lib/organization-client";
import { listTickets } from "@/lib/ticket-client";
import type { DemoTicket } from "@/lib/demo-tickets";
import type { MapsClientConfig } from "@/lib/maps-config";
import type { StaffSession } from "@/lib/staff-session";

type LocatedCenter = Awaited<ReturnType<typeof getOrganizationCatalog>>["centers"][number] & {
  location: NonNullable<Awaited<ReturnType<typeof getOrganizationCatalog>>["centers"][number]["location"]>;
};

const markerOffset = (ticketId: string, index: number) => {
  const seed = [...ticketId].reduce((total, value) => total + value.charCodeAt(0), index * 17);
  const angle = (seed % 360) * Math.PI / 180;
  const radius = 0.0025 + (index % 3) * 0.001;
  return { latitude: Math.sin(angle) * radius, longitude: Math.cos(angle) * radius };
};

const infoContent = (title: string, lines: string[]) => {
  const article = document.createElement("article");
  article.className = "map-info";
  const heading = document.createElement("strong"); heading.textContent = title; article.append(heading);
  for (const line of lines) { const paragraph=document.createElement("p"); paragraph.textContent=line; article.append(paragraph); }
  return article;
};

function GoogleMapCanvas({ centers, tickets, config }:{ centers:LocatedCenter[]; tickets:DemoTicket[]; config:MapsClientConfig }) {
  const container = useRef<HTMLDivElement>(null);
  const [status,setStatus] = useState<"loading"|"ready"|"error">("loading");
  useEffect(() => {
    if (!container.current || !config.enabled || centers.length === 0) return;
    let cancelled=false;
    const markers: google.maps.marker.AdvancedMarkerElement[]=[];
    const listeners: google.maps.MapsEventListener[]=[];
    let infoWindow:google.maps.InfoWindow|undefined;
    void import("@/lib/google-maps").then(({loadGoogleMaps})=>loadGoogleMaps(config.apiKey)).then(({maps,marker})=>{
      if(cancelled||!container.current)return;
      const center=centers[0].location;
      const map=new maps.Map(container.current,{center:{lat:center.latitude,lng:center.longitude},zoom:8,mapId:config.mapId,
        mapTypeControl:false,streetViewControl:false,fullscreenControl:true});
      const bounds=new google.maps.LatLngBounds(); infoWindow=new maps.InfoWindow();
      for(const site of centers){
        const position={lat:site.location.latitude,lng:site.location.longitude}; bounds.extend(position);
        const siteTickets=tickets.filter(ticket=>ticket.centerId===site.centerId);
        const siteMarker=new marker.AdvancedMarkerElement({map,position,title:site.name}); markers.push(siteMarker);
        listeners.push(siteMarker.addListener("click",()=>{infoWindow?.setContent(infoContent(site.name,[site.code+" · "+site.type,siteTickets.length+" incidencia(s) visible(s)"]));infoWindow?.open({map,anchor:siteMarker});}));
        siteTickets.forEach((ticket,index)=>{
          const offset=markerOffset(ticket.ticketId,index);
          const badge=document.createElement("span");badge.className="incident-map-marker priority-"+ticket.priority.toLowerCase().replace("í","i");badge.textContent="!";
          const incidentMarker=new marker.AdvancedMarkerElement({map,position:{lat:position.lat+offset.latitude,lng:position.lng+offset.longitude},title:ticket.id+" · "+ticket.title,content:badge});
          markers.push(incidentMarker); listeners.push(incidentMarker.addListener("click",()=>{infoWindow?.setContent(infoContent(ticket.id,[ticket.title,ticket.priority+" · "+ticket.status,site.name]));infoWindow?.open({map,anchor:incidentMarker});}));
        });
      }
      if(centers.length>1)map.fitBounds(bounds,70); setStatus("ready");
    }).catch(()=>{if(!cancelled)setStatus("error");});
    return()=>{cancelled=true;listeners.forEach(listener=>listener.remove());markers.forEach(item=>item.map=null);infoWindow?.close();};
  },[centers,tickets,config.apiKey,config.enabled,config.mapId]);
  return <div className="map-canvas-wrap"><div ref={container} className="map-canvas" aria-label="Mapa interactivo de sedes e incidencias" />
    {status==="loading"&&<div className="map-overlay" role="status">Cargando Google Maps…</div>}
    {status==="error"&&<div className="map-overlay error" role="alert">Google Maps no pudo cargarse. Usa la lista geográfica disponible.</div>}
    {status==="ready"&&<span className="map-live-status"><LocateFixed size={14}/> Mapa interactivo activo</span>}</div>;
}

export function GeographicView({session,mapsConfig}:{session:StaffSession;mapsConfig:MapsClientConfig}) {
  const organization=useQuery({queryKey:["organization-catalog"],queryFn:getOrganizationCatalog,staleTime:60000});
  const ticketQuery=useQuery({queryKey:["tickets"],queryFn:listTickets,staleTime:15000});
  const centers=useMemo(()=>organization.data?.centers.filter((center):center is LocatedCenter=>center.active&&center.location!==null)??[],[organization.data]);
  const tickets=ticketQuery.data??[];
  const retry=()=>{void organization.refetch();void ticketQuery.refetch();};
  if(organization.isPending||ticketQuery.isPending)return <div className="organization-state" role="status">Cargando cobertura geográfica…</div>;
  if(organization.isError||ticketQuery.isError)return <div className="organization-state error" role="alert"><p>No se pudo cargar la información geográfica autorizada.</p><Button variant="outline" onClick={retry}><RefreshCw/> Reintentar</Button></div>;
  return <div className="map-page">
    <div className="page-heading"><div><div className="eyebrow">COBERTURA GEOGRÁFICA</div><h1>Mapa de sedes e incidencias</h1><p>Ubicaciones referenciales y tickets de demostración dentro de tu alcance autorizado.</p></div><span className="catalog-code">{session.scope} · {centers.length} SEDES</span></div>
    <section className="map-summary" aria-label="Resumen geográfico"><div><Building2/><span>Sedes ubicadas<strong>{centers.length}</strong></span></div><div><Ticket/><span>Incidencias visibles<strong>{tickets.length}</strong></span></div><div><MapPin/><span>Fuente<strong>Configuración</strong></span></div></section>
    <section className="map-panel" aria-labelledby="map-title"><div className="section-heading"><div><span className="eyebrow">VISTA INTERACTIVA OPCIONAL</span><h2 id="map-title">Distribución operativa</h2><p>Selecciona una sede o incidencia para consultar su resumen.</p></div></div>
      {centers.length===0?<div className="map-empty"><CircleAlert/><p>No hay sedes con coordenadas dentro de tu alcance.</p></div>:mapsConfig.enabled?<GoogleMapCanvas centers={centers} tickets={tickets} config={mapsConfig}/>:<div className="map-disabled" role="status"><MapPin/><div><strong>Google Maps está desactivado</strong><p>La operación continúa disponible mediante la lista geográfica. Configura una clave de navegador para activar el mapa.</p></div></div>}
    </section>
    <section className="map-site-list" aria-labelledby="site-list-title"><div className="section-heading"><div><span className="eyebrow">VISTA SIEMPRE DISPONIBLE</span><h2 id="site-list-title">Sedes autorizadas</h2><p>Esta lista funciona aun cuando Google Maps no esté configurado o no tenga conexión.</p></div></div>
      <div className="map-site-grid">{centers.map(center=>{const incidents=tickets.filter(ticket=>ticket.centerId===center.centerId);return <article key={center.centerId}><div className="map-site-heading"><span><Building2 size={19}/></span><div><small>{center.type}</small><h3>{center.name}</h3><code>{center.code}</code></div><strong>{incidents.length}</strong></div><p><MapPin size={14}/>{center.location.latitude.toFixed(4)}, {center.location.longitude.toFixed(4)} · {center.location.source}</p>{incidents.length>0?<ul>{incidents.map(ticket=><li key={ticket.ticketId}><span className={"ticket-priority priority-"+ticket.priority.toLowerCase().replace("í","i")}>{ticket.priority}</span><span><strong>{ticket.id}</strong>{ticket.title}</span></li>)}</ul>:<small className="no-incidents">Sin incidencias visibles</small>}</article>;})}</div>
    </section>
  </div>;
}
