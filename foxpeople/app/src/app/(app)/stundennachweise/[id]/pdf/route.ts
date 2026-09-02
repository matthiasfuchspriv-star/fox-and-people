import { NextResponse } from "next/server";
import { getSession, darfKostenstelle } from "@/lib/auth";
import { wochennachweisPdf } from "@/lib/nachweis-pdf";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  if (!s || s.totpPending) return NextResponse.redirect(new URL("/login", req.url));
  const r = await wochennachweisPdf(id);
  if (!r || !darfKostenstelle(s, r.kostenstelleId)) return new NextResponse("Nicht gefunden", { status: 404 });
  return new NextResponse(new Uint8Array(r.buf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${encodeURIComponent(r.dateiname)}"` } });
}
