import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, darfKostenstelle } from "@/lib/auth";
import { firma as ladeFirma } from "@/lib/einstellungen";
import { vertragsKontext, renderVorlage } from "@/lib/vertrag";
import { TextPdf, pdfBuffer } from "@/lib/pdf";

/** Einsatzbestätigung = Überlassungsmitteilung gemäß § 12 AÜG, direkt aus dem Einsatz */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  if (!s || s.totpPending) return NextResponse.redirect(new URL("/login", req.url));
  const e = await db.einsatz.findUnique({ where: { id }, include: { kostenstelle: true } });
  if (!e || !darfKostenstelle(s, e.kostenstelleId)) return new NextResponse("Nicht gefunden", { status: 404 });
  const vorlage = await db.vertragsvorlage.findFirst({ where: { typ: "UEBERLASSUNGSMITTEILUNG", aktiv: true } });
  const { ctx } = await vertragsKontext({ einsatzId: id, kostenstelleId: e.kostenstelleId });
  const inhalt = vorlage ? renderVorlage(vorlage.inhalt, ctx) : `# Einsatzbestätigung\n\n${ctx["person.vorname"]} ${ctx["person.nachname"]} ist ab ${ctx["einsatz.von"]} bei ${ctx["kunde.firmenname"]} als ${ctx["einsatz.rolle"]} im Einsatz.`;
  const f = await ladeFirma();
  const buf = await pdfBuffer(TextPdf({ firma: f, titel: "Überlassungsmitteilung", inhalt, ks: e.kostenstelle }));
  return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="Ueberlassungsmitteilung.pdf"` } });
}
