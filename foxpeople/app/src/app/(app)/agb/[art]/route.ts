import { NextResponse } from "next/server";
import { getSession, darfKostenstelle } from "@/lib/auth";
import { db } from "@/lib/db";
import { agbPdf } from "@/lib/agb-pdf";

/** AGB als PDF – /agb/ueberlassung bzw. /agb/vermittlung, optional ?kunde=<id> für die kundenspezifischen Sätze. */
export async function GET(req: Request, { params }: { params: Promise<{ art: string }> }) {
  const { art } = await params;
  const s = await getSession();
  if (!s || s.totpPending) return NextResponse.redirect(new URL("/login", req.url));
  const a = art.toUpperCase() === "VERMITTLUNG" ? "VERMITTLUNG" : "UEBERLASSUNG";
  // Die kundenspezifischen Sätze (Übernahme, Vermittlung) stehen im PDF – deshalb prüfen, ob dieser
  // Nutzer den Kunden überhaupt sehen darf. Sonst liest jede Kostenstelle die Konditionen der anderen.
  let kundeId = new URL(req.url).searchParams.get("kunde");
  if (kundeId) {
    const k = await db.kunde.findUnique({ where: { id: kundeId }, select: { kostenstelleId: true } });
    if (!k || !darfKostenstelle(s, k.kostenstelleId)) kundeId = null;
  }
  const r = await agbPdf(a, kundeId);
  return new NextResponse(new Uint8Array(r.buf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${r.dateiname}"` } });
}
