"use client";
import { useQuery } from "@tanstack/react-query";
import { Building2, MapPin, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getOrganizationCatalog } from "@/lib/organization-client";

const typeLabel: Record<string,string> = {
  HOSPITAL: "Hospital", CAP: "CAP", POLICLINICO: "Policlínico", POSTA: "Posta", OTRO: "Otro",
};
const scopeLabel = { PROPIO: "Propio", SEDE: "Sede", RED: "Red", NACIONAL: "Nacional" };

export function OrganizationView() {
  const query = useQuery({ queryKey: ["organization-catalog"], queryFn: getOrganizationCatalog, staleTime: 60000 });
  if (query.isPending) return <div className="organization-state" role="status">Cargando estructura organizacional…</div>;
  if (query.isError) return <div className="organization-state error" role="alert">
    <p>No se pudo cargar la estructura organizacional.</p>
    <Button variant="outline" onClick={() => query.refetch()}><RefreshCw /> Reintentar</Button>
  </div>;
  const catalog = query.data;
  return (
    <div className="organization-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">ESTRUCTURA CONFIGURABLE</div>
          <h1>{catalog.network.name}</h1>
          <p>Red, sedes, áreas y roles cargados desde el catálogo local de demostración.</p>
        </div>
        <span className="catalog-code">{catalog.network.code}</span>
      </div>
      <section className="organization-summary" aria-label="Resumen organizacional">
        <div><Building2 /><span>Sedes activas<strong>{catalog.centers.filter(item => item.active).length}</strong></span></div>
        <div><MapPin /><span>Áreas activas<strong>{catalog.centers.flatMap(item => item.areas).filter(item => item.active).length}</strong></span></div>
        <div><ShieldCheck /><span>Roles configurados<strong>{catalog.roles.filter(item => item.active).length}</strong></span></div>
      </section>
      <section className="catalog-section" aria-labelledby="centers-title">
        <div className="section-heading"><div><span className="eyebrow">SEDES Y ÁREAS</span><h2 id="centers-title">Organización asistencial</h2>
          <p>Información ficticia reemplazable mediante configuración, sin cambios de código.</p></div></div>
        <div className="center-grid">
          {catalog.centers.map(center => <article key={center.centerId}>
            <div className="center-heading"><span><Building2 size={20} /></span><div><small>{typeLabel[center.type] ?? center.type}</small><h3>{center.name}</h3><code>{center.code}</code></div></div>
            <ul>{center.areas.map(area => <li key={area.areaId}><MapPin size={14} /><span>{area.name}<small>{area.code}</small></span></li>)}</ul>
          </article>)}
        </div>
      </section>
      <section className="catalog-section" aria-labelledby="roles-title">
        <div className="section-heading"><div><span className="eyebrow">ROLES INSTITUCIONALES</span><h2 id="roles-title">Catálogo de responsabilidades</h2>
          <p>Los alcances se aplicarán como permisos efectivos en la Subetapa 3.3.</p></div></div>
        <div className="role-catalog">{catalog.roles.map(role => <article key={role.roleId}>
          <div><ShieldCheck size={18} /><span className={"scope scope-"+role.scope.toLowerCase()}>{scopeLabel[role.scope]}</span></div>
          <h3>{role.name}</h3><code>{role.code}</code><p>{role.description}</p>
        </article>)}</div>
      </section>
    </div>
  );
}
