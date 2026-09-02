import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { firma as ladeFirma } from "@/lib/einstellungen";
import { TextPdf, pdfBuffer } from "@/lib/pdf";

export async function GET(req: Request) {
  const s = await getSession();
  // totpPending mitprüfen: sonst käme man mit dem Passwort allein, ohne zweiten Faktor, an die Monatsreports
  if (!s || s.totpPending || s.rolle !== "SYSTEMADMIN") return new NextResponse("Nicht erlaubt", { status: 403 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const r = await db.monatsreport.findUnique({ where: { id } });
  if (!r) return new NextResponse("Nicht gefunden", { status: 404 });
  const f = await ladeFirma();
  const buf = await pdfBuffer(TextPdf({ firma: f, titel: `Monatsreport ${r.monat}/${r.jahr}`, inhalt: r.inhalt.replace(/^- /gm, "• ") }));
  return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="Monatsreport_${r.jahr}-${String(r.monat).padStart(2, "0")}.pdf"` } });
}
