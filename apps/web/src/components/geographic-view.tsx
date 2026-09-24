"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Building2,CircleAlert,LocateFixed,MapPin,RefreshCw,Ticket } from "lucide-react";
import { useEffect,useMemo,useRef,useState } from "react";
import { Button } from "@/components/ui/button";
import { getOrganizationCatalog } from "@/lib/organization-client";
import { listTickets } from "@/lib/ticket-client";
import { PRIORITIES,STATUSES,type DemoTicket } from "@/lib/demo-tickets";
import type { MapsClientConfig } from "@/lib/maps-config";
import type { StaffSession } from "@/lib/staff-session";

type Catalog=Awaited<ReturnType<typeof getOrganizationCatalog>>;
type LocatedCenter=Catalog["centers"][number]&{location:NonNullable<Catalog["centers"][number]["location"]>};
const priorityClass=(value:string)=>value.toLowerCase().replace("í","i");
const infoContent=(title:string,lines:string[],href?:string)=>{
  const article=document.createElement("article");article.className="map-info";
  const heading=document.createElement("strong");heading.textContent=title;article.append(heading);
  lines.forEach(line=>{const p=document.createElement("p");p.textContent=line;article.append(p);});
  if(href){const link=document.createElement("a");link.href=href;link.textContent=href.includes("centro=")?"Ver tickets":"Abrir detalle";link.className="map-info-link";article.append(link);}
  return article;
};
function GoogleMapCanvas({centers,tickets,config,onSelect}:{centers:LocatedCenter[];tickets:DemoTicket[];config:MapsClientConfig;onSelect:(id:string)=>void}){
  const container=useRef<HTMLDivElement>(null);const [status,setStatus]=useState<"loading"|"ready"|"error">("loading");
  useEffect(()=>{if(!container.current||!config.enabled||!centers.length)return;let cancelled=false;
    const markers:google.maps.marker.AdvancedMarkerElement[]=[],listeners:google.maps.MapsEventListener[]=[];let info:google.maps.InfoWindow|undefined;
    void import("@/lib/google-maps").then(({loadGoogleMaps})=>loadGoogleMaps(config.apiKey)).then(({maps,marker})=>{
      if(cancelled||!container.current)return;const first=centers[0].location;
      const map=new maps.Map(container.current,{center:{lat:first.latitude,lng:first.longitude},zoom:8,mapId:config.mapId,mapTypeControl:false,streetViewControl:false,fullscreenControl:true});
      const bounds=new google.maps.LatLngBounds();info=new maps.InfoWindow();
      centers.forEach(site=>{const position={lat:site.location.latitude,lng:site.location.longitude},siteTickets=tickets.filter(t=>t.centerId===site.centerId);bounds.extend(position);
        const pin=new marker.AdvancedMarkerElement({map,position,title:site.name});markers.push(pin);
        listeners.push(pin.addListener("click",()=>{onSelect(site.centerId);info?.setContent(infoContent(site.name,
          [site.address??"Dirección no configurada",siteTickets.length+" ticket(s) DEMO"],
          "/tecnico?centro="+encodeURIComponent(site.centerId)));info?.open({map,anchor:pin});}));
      });if(centers.length>1)map.fitBounds(bounds,70);setStatus("ready");
    }).catch(()=>{if(!cancelled)setStatus("error");});
    return()=>{cancelled=true;listeners.forEach(listener=>listener.remove());markers.forEach(marker=>marker.map=null);info?.close();};
  },[centers,tickets,config.apiKey,config.enabled,config.mapId,onSelect]);
  return <div className="map-canvas-wrap"><div ref={container} className="map-canvas" aria-label="Mapa interactivo de sedes e incidencias"/>
    {status==="loading"&&<div className="map-overlay" role="status">Cargando Google Maps…</div>}
    {status==="error"&&<div className="map-overlay error" role="alert">Google Maps no pudo cargarse. Usa la lista geográfica disponible.</div>}
    {status==="ready"&&<span className="map-live-status"><LocateFixed size={14}/> Mapa interactivo activo</span>}</div>;
}
const counts=(tickets:DemoTicket[])=>({open:tickets.filter(t=>t.status==="Abierto").length,progress:tickets.filter(t=>t.status==="En Proceso").length,
  resolved:tickets.filter(t=>t.status==="Resuelto"||t.status==="Cerrado").length,priority:tickets.filter(t=>t.priority==="Crítica"||t.priority==="Alta").length});

export function GeographicView({session,mapsConfig,initialCenterId}:{session:StaffSession;mapsConfig:MapsClientConfig;initialCenterId?:string}){
  const organization=useQuery({queryKey:["organization-catalog"],queryFn:getOrganizationCatalog,staleTime:60000});
  const ticketQuery=useQuery({queryKey:["tickets"],queryFn:listTickets,staleTime:15000});
  const [status,setStatus]=useState(""),[priority,setPriority]=useState(""),[selected,setSelected]=useState(initialCenterId??"");
  const centers=useMemo(()=>organization.data?.centers.filter((c):c is LocatedCenter=>c.active&&c.location!==null)??[],[organization.data]);
  const tickets=useMemo(()=>(ticketQuery.data??[]).filter(t=>(!status||t.status===status)&&(!priority||t.priority===priority)),[ticketQuery.data,status,priority]);
  useEffect(()=>{if(selected)document.getElementById("site-"+selected)?.scrollIntoView({behavior:"smooth",block:"nearest"});},[selected]);
  const retry=()=>{void organization.refetch();void ticketQuery.refetch();};
  if(organization.isPending||ticketQuery.isPending)return <div className="organization-state" role="status">Cargando cobertura geográfica…</div>;
  if(organization.isError||ticketQuery.isError)return <div className="organization-state error" role="alert"><p>No se pudo cargar la información geográfica autorizada.</p><Button variant="outline" onClick={retry}><RefreshCw/> Reintentar</Button></div>;
  return <div className="map-page">
    <div className="page-heading"><div><div className="eyebrow">COBERTURA GEOGRÁFICA · DATOS DEMO</div><h1>Mapa de sedes e incidencias</h1><p>Selecciona una sede para revisar sus tickets reales de demostración almacenados en PostgreSQL.</p></div><span className="catalog-code">{session.scope} · {centers.length} SEDES</span></div>
    <section className="map-summary" aria-label="Resumen geográfico"><div><Building2/><span>Sedes ubicadas<strong>{centers.length}</strong></span></div><div><Ticket/><span>Tickets visibles<strong>{tickets.length}</strong></span></div><div><MapPin/><span>Datos<strong>DEMO configurables</strong></span></div></section>
    <section className="map-panel" aria-labelledby="map-title"><div className="section-heading map-toolbar"><div><span className="eyebrow">VISTA INTERACTIVA OPCIONAL</span><h2 id="map-title">Sede → tickets → detalle</h2><p>El sistema sigue funcionando si Google Maps no está disponible.</p></div><div className="map-filters">
      <select className="field" aria-label="Filtrar mapa por estado" value={status} onChange={e=>setStatus(e.target.value)}><option value="">Todos los estados</option>{STATUSES.map(item=><option key={item}>{item}</option>)}</select>
      <select className="field" aria-label="Filtrar mapa por prioridad" value={priority} onChange={e=>setPriority(e.target.value)}><option value="">Todas las prioridades</option>{PRIORITIES.map(item=><option key={item}>{item}</option>)}</select>
    </div></div>
      {!centers.length?<div className="map-empty"><CircleAlert/><p>No hay sedes con coordenadas dentro de tu alcance.</p></div>:mapsConfig.enabled?<GoogleMapCanvas centers={centers} tickets={tickets} config={mapsConfig} onSelect={setSelected}/>:<div className="map-disabled" role="status"><MapPin/><div><strong>Google Maps está desactivado</strong><p>La lista conserva todo el flujo geográfico. Configura la clave restringida para activar el mapa.</p></div></div>}
    </section>
    <section className="map-site-list" aria-labelledby="site-list-title"><div className="section-heading"><div><span className="eyebrow">VISTA SIEMPRE DISPONIBLE</span><h2 id="site-list-title">Sedes autorizadas</h2><p>REFERENCE indica coordenada cartográfica referencial; DEMO requiere validación institucional.</p></div></div>
      <div className="map-site-grid">{centers.map(center=>{const incidents=tickets.filter(t=>t.centerId===center.centerId),stats=counts(incidents);return <article id={"site-"+center.centerId} className={selected===center.centerId?"selected":""} key={center.centerId}>
        <div className="map-site-heading"><span><Building2 size={19}/></span><div><small>{center.type} · {center.location.accuracy}</small><h3>{center.name}</h3><code>{center.code}</code></div><strong>{incidents.length}</strong></div>
        <p><MapPin size={14}/>{center.address??"Dirección no configurada"}</p>
        <div className="site-stats"><span>Abiertos <b>{stats.open}</b></span><span>En proceso <b>{stats.progress}</b></span><span>Resueltos <b>{stats.resolved}</b></span><span>Prioritarios <b>{stats.priority}</b></span></div>
        {incidents.length?<ul>{incidents.map(ticket=><li key={ticket.ticketId}><span className={"ticket-priority priority-"+priorityClass(ticket.priority)}>{ticket.priority}</span><Link href={"/tecnico?ticket="+encodeURIComponent(ticket.ticketId)}><strong>{ticket.id}</strong>{ticket.title}</Link></li>)}</ul>:<small className="no-incidents">Sin tickets con los filtros actuales</small>}
        <Link className="site-ticket-link" href={"/tecnico?centro="+encodeURIComponent(center.centerId)}>Ver tickets de esta sede</Link>
      </article>;})}</div>
    </section>
  </div>;
}
