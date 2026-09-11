"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowUpRight,
  Building2,
  Headset,
  LayoutDashboard,
  PanelsTopLeft,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
function ApiStatus() {
  const query = useQuery({
    queryKey: ["backend-health"],
    queryFn: async () => {
      const response = await fetch("/api/backend-health", {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error("unavailable");
      return response.json() as Promise<{ status: string }>;
    },
    retry: false,
    refetchInterval: 30000,
    staleTime: 10000,
  });
  const ready = !query.isError && query.data?.status === "ok";
  return (
    <span className={"connection " + (ready ? "connected" : "")} role="status">
      <span />
      {query.isPending
        ? "Verificando API"
        : ready
          ? "API disponible"
          : "API no disponible"}
    </span>
  );
}
export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <div className="app-shell">
      <a href="#contenido" className="skip-link">
        Saltar al contenido
      </a>
      <aside className="sidebar">
        <Link
          href="/portal"
          className="brand"
          aria-label="Mesa de ayuda Red Pasco, inicio"
        >
          <span className="brand-icon">
            <Activity size={26} />
          </span>
          <span>
            Red Pasco<small>EsSalud · Mesa de ayuda</small>
          </span>
        </Link>
        <div className="workspace-label">ESPACIO DE TRABAJO</div>
        <nav aria-label="Vistas de demostración">
          <Link
            href="/portal"
            className={path === "/portal" ? "active" : ""}
            aria-current={path === "/portal" ? "page" : undefined}
          >
            <LayoutDashboard size={19} />
            Portal del usuario
          </Link>
          <Link
            href="/tecnico"
            className={path === "/tecnico" ? "active" : ""}
            aria-current={path === "/tecnico" ? "page" : undefined}
          >
            <PanelsTopLeft size={19} />
            Tablero técnico
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <ShieldCheck size={21} />
          <strong>Piloto académico</strong>
          <p>
            Soporte técnico e infraestructura.
            <br />
            Vista de demostración.
          </p>
          <span className="sidebar-version">SUBETAPA 2.3</span>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="breadcrumb">
            <Building2 size={16} />
            <span>Red Asistencial Pasco</span>
            <span className="breadcrumb-slash">/</span>
            <strong>Mesa de ayuda</strong>
          </div>
          <ApiStatus />
        </header>
        <div className="demo-banner">
          <span>
            <strong>Demostración local</strong> Usa datos ficticios. Los cambios
            se guardan y sincronizan en tiempo real.
          </span>
          <span className="demo-tag">PostgreSQL + Redis + SSE</span>
        </div>
        <main id="contenido" tabIndex={-1}>
          {children}
        </main>
        <footer className="footer">
          <span>
            <Headset size={15} /> Soporte para quienes cuidan
          </span>
          <span>
            Red Pasco · Proyecto académico <ArrowUpRight size={13} />
          </span>
        </footer>
      </div>
    </div>
  );
}
