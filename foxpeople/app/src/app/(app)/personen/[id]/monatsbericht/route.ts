import { NextResponse } from "next/server";
import { getSession, darfKostenstelle } from "@/lib/auth";
import { monatsberichtPdf } from "@/lib/nachweis-pdf";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  if (!s || s.totpPending) return NextResponse.redirect(new URL("/login", req.url));
  const u = new URL(req.url);
  const heute = new Date();
  const jahr = Number(u.searchParams.get("jahr")) || heute.getFullYear();
  const monat = Number(u.searchParams.get("monat")) || heute.getMonth() + 1;
  const r = await monatsberichtPdf(id, jahr, monat);
  if (!r || !darfKostenstelle(s, r.kostenstelleId)) return new NextResponse("Nicht gefunden", { status: 404 });
  return new NextResponse(new Uint8Array(r.buf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${encodeURIComponent(r.dateiname)}"` } });
}
