"use client";
import { useState,type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, KeyRound, ShieldCheck, UserRoundCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ACCESS_EXPERIENCES } from "@/lib/access-model";

const accounts=[
  {username:"tecnico.n1",label:"Técnico N1",scope:"Sede configurada"},
  {username:"supervisor.red",label:"Supervisor",scope:"Red asistencial"},
  {username:"admin.gctic",label:"Administrador",scope:"Configuración nacional demo"},
];
export function StaffAccess() {
  const router=useRouter(),staff=ACCESS_EXPERIENCES.filter(item=>item.access==="authenticated");
  const [username,setUsername]=useState("supervisor.red"),[password,setPassword]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  async function submit(event:FormEvent){event.preventDefault();setBusy(true);setError("");
    try{const response=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})});
      if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.message??"No se pudo iniciar sesión.");}
      router.push("/tecnico");router.refresh();
    }catch(value){setError(value instanceof Error?value.message:"No se pudo iniciar sesión.");}finally{setBusy(false);}}
  return <div className="access-page">
    <section className="access-hero"><div><span className="eyebrow">ACCESO INSTITUCIONAL</span><h1>Espacio del personal autorizado</h1>
      <p>La sesión firmada determina el rol, la red y las sedes visibles. Esta implementación usa identidades ficticias únicamente en Docker local.</p></div>
      <span className="access-hero-icon"><ShieldCheck size={34}/></span></section>
    <div className="access-layout">
      <section className="access-card" aria-labelledby="institutional-login"><div className="access-card-heading"><KeyRound size={22}/><div>
        <h2 id="institutional-login">Ingreso de demostración</h2><p>El token queda en una cookie HttpOnly y vence automáticamente.</p></div></div>
        <form className="access-form" onSubmit={submit} noValidate>
          <label>Usuario<input className="field" autoComplete="username" value={username} onChange={event=>setUsername(event.target.value)} required/></label>
          <label>Contraseña<input className="field" type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} minLength={12} required/></label>
          {error&&<p className="login-error" role="alert">{error}</p>}
          <Button type="submit" disabled={busy||username.length<3||password.length<12}>{busy?"Verificando…":"Ingresar de forma segura"}<ArrowRight/></Button>
        </form>
      </section>
      <aside className="demo-access-card" aria-labelledby="demo-access"><span className="demo-access-icon"><Building2 size={25}/></span>
        <span className="eyebrow">CUENTAS FICTICIAS</span><h2 id="demo-access">Prueba tres alcances</h2>
        <p>Selecciona un usuario y usa la contraseña común <code>Demo-RAP-2026!</code>.</p>
        <div className="demo-account-list">{accounts.map(account=><button type="button" key={account.username} onClick={()=>{setUsername(account.username);setPassword("Demo-RAP-2026!");setError("");}}>
          <strong>{account.label}</strong><span>{account.username}</span><small>{account.scope}</small></button>)}</div>
        <small>Estas cuentas no están habilitadas en el entorno institucional.</small>
      </aside>
    </div>
    <section className="role-preview" aria-labelledby="role-preview-title"><div className="section-heading"><div><span className="eyebrow">RBAC ACTIVO</span>
      <h2 id="role-preview-title">Una interfaz según la responsabilidad</h2><p>La API valida cada operación y filtra tickets y sedes antes de responder.</p></div></div>
      <div className="role-grid">{staff.map(item=><article key={item.id}><UserRoundCheck size={21}/><h3>{item.label}</h3><p>{item.purpose}</p>
        <ul>{item.capabilities.map(capability=><li key={capability}>{capability}</li>)}</ul></article>)}</div></section>
  </div>;
}
