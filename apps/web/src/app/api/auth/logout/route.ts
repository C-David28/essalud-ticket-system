import { NextResponse } from "next/server";
import { STAFF_COOKIE } from "@/lib/staff-session";
export async function POST(request:Request){const response=NextResponse.redirect(new URL("/acceso",request.url),303);
  response.cookies.set(STAFF_COOKIE,"",{httpOnly:true,sameSite:"strict",secure:new URL(request.url).protocol==="https:",path:"/",maxAge:0});return response;}
