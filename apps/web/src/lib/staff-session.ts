import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiHeaders, localApiConfig } from "./local-api";

export const STAFF_COOKIE="essalud_staff_session";
export type StaffSession={authenticated:true;redAsistencialId:string;userId:string;displayName:string;
  roles:Array<"TECNICO_N1"|"TECNICO_N2"|"SUPERVISOR_RED"|"ADMIN_GCTIC">;
  scope:"SEDE"|"RED"|"NACIONAL";centerIds:string[];permissions:string[]};

export async function staffToken(){return (await cookies()).get(STAFF_COOKIE)?.value??null}
export async function getStaffSession():Promise<StaffSession|null>{
  const token=await staffToken();if(!token)return null;
  try {
    const config=localApiConfig();
    const response=await fetch(new URL("/api/v1/auth/me",config.base),{headers:{...apiHeaders(config),Authorization:"Bearer "+token},
      cache:"no-store",redirect:"error",signal:AbortSignal.timeout(8000)});
    if(!response.ok)return null;return response.json();
  } catch{return null;}
}
export async function requireStaffSession(){const session=await getStaffSession();if(!session)redirect("/acceso");return session}
