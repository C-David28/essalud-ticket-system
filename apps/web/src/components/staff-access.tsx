import Link from "next/link";
import { ArrowRight, Building2, KeyRound, ShieldCheck, UserRoundCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ACCESS_EXPERIENCES } from "@/lib/access-model";

export function StaffAccess() {
  const staff = ACCESS_EXPERIENCES.filter((experience) => experience.access === "authenticated");
  return (
    <div className="access-page">
      <section className="access-hero">
        <div>
          <span className="eyebrow">ACCESO INSTITUCIONAL</span>
          <h1>Espacio del personal autorizado</h1>
          <p>
            El personal técnico, los supervisores y los administradores ingresarán
            con una identidad institucional. Cada perfil verá únicamente las
            funciones y sedes que tenga autorizadas.
          </p>
        </div>
        <span className="access-hero-icon"><ShieldCheck size={34} /></span>
      </section>

      <div className="access-layout">
        <section className="access-card" aria-labelledby="institutional-login">
          <div className="access-card-heading">
            <KeyRound size={22} />
            <div>
              <h2 id="institutional-login">Ingreso con cuenta institucional</h2>
              <p>Interfaz preparada para el proveedor de identidad y RBAC de la Subetapa 3.3.</p>
            </div>
          </div>
          <form className="access-form" aria-label="Ingreso institucional pendiente">
            <label>
              Correo o usuario institucional
              <input className="field" type="email" placeholder="usuario@institucion.gob.pe" disabled />
            </label>
            <label>
              Contraseña
              <input className="field" type="password" placeholder="••••••••••••" disabled />
            </label>
            <Button type="button" disabled>
              Ingresar de forma segura
              <ArrowRight />
            </Button>
          </form>
          <p className="access-pending">
            La autenticación todavía no está activa. Ningún dato escrito aquí se procesa ni se envía.
          </p>
        </section>

        <aside className="demo-access-card" aria-labelledby="demo-access">
          <span className="demo-access-icon"><Building2 size={25} /></span>
          <span className="eyebrow">DEMOSTRACIÓN LOCAL</span>
          <h2 id="demo-access">Revisa el flujo operativo construido</h2>
          <p>
            Esta vista usa una identidad técnica ficticia y solo funciona en el
            entorno local de demostración.
          </p>
          <Button asChild>
            <Link href="/tecnico">
              Abrir tablero de demostración
              <ArrowRight />
            </Link>
          </Button>
          <small>No representa una sesión autenticada ni concede permisos institucionales.</small>
        </aside>
      </div>

      <section className="role-preview" aria-labelledby="role-preview-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">EXPERIENCIAS AUTORIZADAS</span>
            <h2 id="role-preview-title">Una interfaz según la responsabilidad</h2>
            <p>Estos perfiles guían el diseño; sus permisos se aplicarán en el backend durante 3.3.</p>
          </div>
        </div>
        <div className="role-grid">
          {staff.map((experience) => (
            <article key={experience.id}>
              <UserRoundCheck size={21} />
              <h3>{experience.label}</h3>
              <p>{experience.purpose}</p>
              <ul>
                {experience.capabilities.map((capability) => <li key={capability}>{capability}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
