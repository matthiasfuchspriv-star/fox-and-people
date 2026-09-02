import { NextResponse } from "next/server";
import { appSessionBeenden } from "@/lib/app-auth";
export async function GET(req: Request) { await appSessionBeenden(); return NextResponse.redirect(new URL("/app/login", req.url)); }
