import { NextResponse } from "next/server";
import { apiHeaders, localApiConfig } from "@/lib/local-api";
import { STAFF_COOKIE } from "@/lib/staff-session";

export const dynamic="force-dynamic";export const runtime="nodejs";
export async function POST(request:Request){
  try {
    const body=await request.json(),config=localApiConfig();
    const upstream=await fetch(new URL("/api/v1/auth/login",config.base),{method:"POST",headers:{...apiHeaders(config),"Content-Type":"application/json"},
      body:JSON.stringify(body),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(12000)});
    if(!upstream.ok)return NextResponse.json({message:upstream.status===401?"Usuario o contraseña incorrectos.":"No se pudo iniciar sesión."},{status:upstream.status});
    const result=await upstream.json();
    const response=NextResponse.json({session:result.session},{status:200});
    response.cookies.set(STAFF_COOKIE,result.token,{httpOnly:true,sameSite:"strict",secure:new URL(request.url).protocol==="https:",path:"/",maxAge:result.expiresIn});
    return response;
  } catch{return NextResponse.json({message:"Servicio de acceso no disponible."},{status:503});}
}
