"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Building2, CircleAlert, LocateFixed, MapPin, RefreshCw, Ticket } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ticketScope, useTickets } from "@/components/providers";
import { getOrganizationCatalog } from "@/lib/organization-client";
import { isTicketId, type TicketCenterSummary } from "@/lib/ticket-client";
import { PRIORITIES, STATUSES, type DemoTicket, type TicketStatus } from "@/lib/demo-tickets";
import type { MapsClientConfig } from "@/lib/maps-config";
import type { StaffSession } from "@/lib/staff-session";

type Catalog = Awaited<ReturnType<typeof getOrganizationCatalog>>;
type LocatedCenter = Catalog["centers"][number] & { location: NonNullable<Catalog["centers"][number]["location"]> };
const priorityClass = (value: string) => value.toLowerCase().replace("í", "i");
const infoContent = (title: string, lines: string[], href?: string) => {
  const article = document.createElement("article"); article.className = "map-info";
  const heading = document.createElement("strong"); heading.textContent = title; article.append(heading);
  lines.forEach(line => { const p = document.createElement("p"); p.textContent = line; article.append(p); });
  if (href) { const link = document.createElement("a"); link.href = href; link.textContent = "Ver tickets"; link.className = "map-info-link"; article.append(link); }
  return article;
};
function GoogleMapCanvas({ centers, summaries, config, onSelect }: { centers: LocatedCenter[]; summaries: TicketCenterSummary[];
  config: MapsClientConfig; onSelect: (id: string) => void }) {
  const container = useRef<HTMLDivElement>(null); const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    if (!container.current || !config.enabled || !centers.length) return; let cancelled = false;
    const markers: google.maps.marker.AdvancedMarkerElement[] = [], listeners: google.maps.MapsEventListener[] = []; let info: google.maps.InfoWindow | undefined;
    void import("@/lib/google-maps").then(({ loadGoogleMaps }) => loadGoogleMaps(config.apiKey)).then(({ maps, marker }) => {
      if (cancelled || !container.current) return; const first = centers[0].location;
      const map = new maps.Map(container.current, { center: { lat: first.latitude, lng: first.longitude }, zoom: 8, mapId: config.mapId, mapTypeControl: false, streetViewControl: false, fullscreenControl: true });
      const bounds = new google.maps.LatLngBounds(); info = new maps.InfoWindow();
      centers.forEach(site => {
        const position = { lat: site.location.latitude, lng: site.location.longitude }, stats = summaries.find(item => item.centerId === site.centerId); bounds.extend(position);
        const pin = new marker.AdvancedMarkerElement({ map, position, title: site.name }); markers.push(pin);
        listeners.push(pin.addListener("click", () => {
          onSelect(site.centerId); info?.setContent(infoContent(site.name,
            [site.address ?? "Dirección no configurada", (stats?.total ?? 0) + " ticket(s) DEMO", (stats?.priority ?? 0) + " prioritarios"],
            "/tecnico?centro=" + encodeURIComponent(site.centerId))); info?.open({ map, anchor: pin });
        }));
      }); if (centers.length > 1) map.fitBounds(bounds, 70); setStatus("ready");
    }).catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; listeners.forEach(listener => listener.remove()); markers.forEach(marker => marker.map = null); info?.close(); };
  }, [centers, summaries, config.apiKey, config.enabled, config.mapId, onSelect]);
  return <div className="map-canvas-wrap"><div ref={container} className="map-canvas" aria-label="Mapa interactivo de sedes e incidencias" />
    {status === "loading" && <div className="map-overlay" role="status">Cargando Google Maps…</div>}
    {status === "error" && <div className="map-overlay error" role="alert">Google Maps no pudo cargarse. Usa la lista geográfica disponible.</div>}
    {status === "ready" && <span className="map-live-status"><LocateFixed size={14} /> Mapa interactivo activo</span>}</div>;
}

export function GeographicView({ session, mapsConfig, initialCenterId }: { session: StaffSession; mapsConfig: MapsClientConfig; initialCenterId?: string }) {
  const scope = ticketScope(session);
  const organization = useQuery({ queryKey: ["organization-catalog", scope], queryFn: getOrganizationCatalog, staleTime: 60000 });
  const [filters, setFilters] = useState<{ status: TicketStatus | ""; priority: DemoTicket["priority"] | ""; selected: string; page: number }>(() => ({
    status: "", priority: "", selected: initialCenterId && isTicketId(initialCenterId) ? initialCenterId : "", page: 1,
  }));
  const { status, priority, selected, page } = filters;
  const centers = useMemo(() => organization.data?.centers.filter((c): c is LocatedCenter => c.active && c.location !== null) ?? [], [organization.data]);
  const { tickets, summary, summaryError, loading, fetching, error, hasMore, refresh } = useTickets({
    technical: true, scope, filters: { view: "all", status, priority, centerId: selected },
    summaryFilters: { view: "all", status, priority }, page, enabled: centers.some(center => center.centerId === selected),
  });
  const selectCenter = useCallback((id: string) => setFilters(old => ({ ...old, selected: id, page: 1 })), []);
  useEffect(() => { if (centers[0] && !centers.some(center => center.centerId === selected)) selectCenter(centers[0].centerId); }, [selected, centers, selectCenter]);
  useEffect(() => { if (selected) document.getElementById("site-" + selected)?.scrollIntoView?.({ behavior: "smooth", block: "nearest" }); }, [selected]);
  const retry = () => { void organization.refetch(); void refresh(); };
  if (organization.isPending || (!summary && !summaryError)) return <div className="organization-state" role="status">Cargando cobertura geográfica…</div>;
  if (organization.isError || summaryError) return <div className="organization-state error" role="alert"><p>No se pudo cargar la información geográfica autorizada.</p><Button variant="outline" onClick={retry}><RefreshCw /> Reintentar</Button></div>;
  return <div className="map-page">
    <div className="page-heading"><div><div className="eyebrow">COBERTURA GEOGRÁFICA · DATOS DEMO</div><h1>Mapa de sedes e incidencias</h1><p>Selecciona una sede para revisar sus tickets reales de demostración almacenados en PostgreSQL.</p></div><span className="catalog-code">{session.scope} · {centers.length} SEDES</span></div>
    <section className="map-summary" aria-label="Resumen geográfico"><div><Building2 /><span>Sedes ubicadas<strong>{centers.length}</strong></span></div><div><Ticket /><span>Tickets visibles<strong>{summary?.total ?? "—"}</strong></span></div><div><MapPin /><span>Datos<strong>DEMO configurables</strong></span></div></section>
    <section className="map-panel" aria-labelledby="map-title"><div className="section-heading map-toolbar"><div><span className="eyebrow">VISTA INTERACTIVA OPCIONAL</span><h2 id="map-title">Sede → tickets → detalle</h2><p>El sistema sigue funcionando si Google Maps no está disponible.</p></div><div className="map-filters">
      <select className="field" aria-label="Filtrar mapa por estado" value={status} onChange={e => setFilters(old => ({ ...old, status: e.target.value as TicketStatus | "", page: 1 }))}><option value="">Todos los estados</option>{STATUSES.map(item => <option key={item}>{item}</option>)}</select>
      <select className="field" aria-label="Filtrar mapa por prioridad" value={priority} onChange={e => setFilters(old => ({ ...old, priority: e.target.value as DemoTicket["priority"] | "", page: 1 }))}><option value="">Todas las prioridades</option>{PRIORITIES.map(item => <option key={item}>{item}</option>)}</select>
    </div></div>
      {!centers.length ? <div className="map-empty"><CircleAlert /><p>No hay sedes con coordenadas dentro de tu alcance.</p></div> : mapsConfig.enabled ? <GoogleMapCanvas centers={centers} summaries={summary?.centers ?? []} config={mapsConfig} onSelect={selectCenter} /> : <div className="map-disabled" role="status"><MapPin /><div><strong>Google Maps está desactivado</strong><p>La lista conserva todo el flujo geográfico. Configura la clave restringida para activar el mapa.</p></div></div>}
    </section>
    <section className="map-site-list" aria-labelledby="site-list-title"><div className="section-heading"><div><span className="eyebrow">VISTA SIEMPRE DISPONIBLE</span><h2 id="site-list-title">Sedes autorizadas</h2><p>REFERENCE indica coordenada cartográfica referencial; DEMO requiere validación institucional.</p></div></div>
      <div className="map-site-grid">{centers.map(center => {
        const stats = summary?.centers.find(item => item.centerId === center.centerId);
        return <article id={"site-" + center.centerId} className={selected === center.centerId ? "selected" : ""} key={center.centerId}>
          <div className="map-site-heading"><span><Building2 size={19} /></span><div><small>{center.type} · {center.location.accuracy}</small><h3>{center.name}</h3><code>{center.code}</code></div><strong>{stats?.total ?? 0}</strong></div>
          <p><MapPin size={14} />{center.address ?? "Dirección no configurada"}</p>
          <div className="site-stats"><span>Abiertos <b>{stats?.byState.ABIERTO ?? 0}</b></span><span>En proceso <b>{stats?.byState.EN_PROCESO ?? 0}</b></span><span>Pendientes <b>{stats?.byState.PENDIENTE ?? 0}</b></span><span>Atendidos <b>{(stats?.byState.RESUELTO ?? 0) + (stats?.byState.CERRADO ?? 0)}</b></span><span>Prioritarios <b>{stats?.priority ?? 0}</b></span></div>
          <Button variant="outline" aria-pressed={selected === center.centerId} onClick={() => selectCenter(center.centerId)}>Ver incidencias de {center.name}</Button>
          {selected === center.centerId && <div className="map-center-tickets" aria-label={"Incidencias de " + center.name}>
            {loading ? <p role="status">Cargando tickets de la sede…</p> : error ? <p role="alert">{error}</p> : tickets.length ? <ul>{tickets.map(ticket => <li key={ticket.ticketId}><span className={"ticket-priority priority-" + priorityClass(ticket.priority)}>{ticket.priority}</span><Link href={"/tecnico?ticket=" + encodeURIComponent(ticket.ticketId)}><strong>{ticket.id}</strong>{ticket.title}</Link></li>)}</ul> : <small className="no-incidents">Sin tickets con los filtros actuales</small>}
            <nav className="ticket-pagination" aria-label="Paginación de la sede">
              <Button variant="outline" disabled={page === 1 || fetching} onClick={() => setFilters(old => ({ ...old, page: old.page - 1 }))}>Anterior</Button>
              <span>Página {page} · Hasta 25 tickets</span>
              <Button variant="outline" disabled={!hasMore || fetching} onClick={() => setFilters(old => ({ ...old, page: old.page + 1 }))}>Siguiente</Button>
            </nav>
          </div>}
          <Link className="site-ticket-link" href={"/tecnico?centro=" + encodeURIComponent(center.centerId)}>Ver tickets de esta sede</Link>
        </article>;
      })}</div>
    </section>
  </div>;
}
