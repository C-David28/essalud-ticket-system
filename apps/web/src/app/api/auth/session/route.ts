import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/staff-session";
export const dynamic="force-dynamic";export const runtime="nodejs";
export async function GET(){const session=await getStaffSession();return session?NextResponse.json(session):NextResponse.json({message:"No autenticado"},{status:401});}
