import { NextResponse } from "next/server";
import { requireSession, istZentrale, darfKostenstelle } from "@/lib/auth";
import { db } from "@/lib/db";
import { firma } from "@/lib/einstellungen";
import { TextPdf, pdfBuffer } from "@/lib/pdf";
import { provisionsbelegText } from "@/lib/provisionsbeleg";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const b = await db.provisionsabrechnung.findUnique({ where: { id }, include: { kostenstelle: true } });
  if (!b || !darfKostenstelle(s, b.kostenstelleId)) return new NextResponse("Nicht gefunden", { status: 404 });
  // Kostenstellen sehen nur freigegebene/ausbezahlte Belege
  if (!istZentrale(s) && b.status === "ENTWURF") return new NextResponse("Beleg noch nicht freigegeben", { status: 403 });
  const f = await firma();
  const buf = await pdfBuffer(TextPdf({ firma: f, titel: `Provisionsabrechnung ${b.monat}/${b.jahr} – ${b.kostenstelle.name}`, inhalt: provisionsbelegText(b), ks: { name: b.kostenstelle.name, strasse: b.kostenstelle.strasse, plz: b.kostenstelle.plz, ort: b.kostenstelle.ort, email: b.kostenstelle.email } }));
  return new NextResponse(new Uint8Array(buf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="Provision-${b.kostenstelle.kuerzel}-${b.jahr}-${String(b.monat).padStart(2, "0")}.pdf"` } });
}
