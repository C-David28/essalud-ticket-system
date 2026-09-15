"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  Building2,
  Headset,
  KeyRound,
  LayoutDashboard,
  Network,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { isPublicExperience } from "@/lib/access-model";

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
      {query.isPending ? "Verificando API" : ready ? "API disponible" : "API no disponible"}
    </span>
  );
}

function Brand() {
  return (
    <Link href="/portal" className="brand" aria-label="Mesa de ayuda Red Pasco, inicio">
      <span className="brand-icon"><Activity size={26} /></span>
      <span>Red Pasco<small>EsSalud · Mesa de ayuda</small></span>
    </Link>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <span><Headset size={15} /> Soporte para quienes cuidan</span>
      <span>Red Pasco · Proyecto académico <ArrowUpRight size={13} /></span>
    </footer>
  );
}

function PublicShell({ children, path }: { children: ReactNode; path: string }) {
  return (
    <div className="public-shell">
      <a href="#contenido" className="skip-link">Saltar al contenido</a>
      <header className="public-header">
        <Brand />
        <nav aria-label="Portal institucional">
          <Link href="/portal" className={path === "/portal" ? "active" : ""} aria-current={path === "/portal" ? "page" : undefined}>
            Solicitar soporte
          </Link>
          <Link href="/acceso" className={"staff-access-link " + (path === "/acceso" ? "active" : "")} aria-current={path === "/acceso" ? "page" : undefined}>
            <KeyRound size={17} /> Acceso del personal
          </Link>
        </nav>
        <ApiStatus />
      </header>
      <div className="demo-banner">
        <span><strong>Demostración local</strong> Usa únicamente información ficticia.</span>
        <span className="demo-tag">Portal público · Sin inicio de sesión</span>
      </div>
      <main id="contenido" tabIndex={-1} className="public-main">{children}</main>
      <Footer />
    </div>
  );
}

function StaffShell({ children, path }: { children: ReactNode; path: string }) {
  return (
    <div className="app-shell">
      <a href="#contenido" className="skip-link">Saltar al contenido</a>
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">ESPACIO DEL PERSONAL</div>
        <nav aria-label="Herramientas de personal">
          <Link href="/tecnico" className={path === "/tecnico" ? "active" : ""} aria-current={path === "/tecnico" ? "page" : undefined}>
            <LayoutDashboard size={19} /> Gestión de tickets
          </Link>
          <Link href="/organizacion" className={path === "/organizacion" ? "active" : ""} aria-current={path === "/organizacion" ? "page" : undefined}>
            <Network size={19} /> Organización
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <ShieldCheck size={21} />
          <strong>Vista técnica de demostración</strong>
          <p>Identidad ficticia local. La autenticación institucional se incorpora en 3.3.</p>
          <Link href="/portal" className="sidebar-return"><ArrowLeft size={15} /> Volver al portal público</Link>
          <span className="sidebar-version">SUBETAPA 3.2</span>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="breadcrumb">
            <Building2 size={16} />
            <span>Red Asistencial Pasco</span>
            <span className="breadcrumb-slash">/</span>
            <strong>Operación técnica</strong>
          </div>
          <ApiStatus />
        </header>
        <div className="demo-banner">
          <span><strong>Acceso local de demostración</strong> Esta vista no representa autenticación institucional.</span>
          <span className="demo-tag">PostgreSQL + Redis + SSE</span>
        </div>
        <main id="contenido" tabIndex={-1}>{children}</main>
        <Footer />
      </div>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  return isPublicExperience(path) ? <PublicShell path={path}>{children}</PublicShell> : <StaffShell path={path}>{children}</StaffShell>;
}
