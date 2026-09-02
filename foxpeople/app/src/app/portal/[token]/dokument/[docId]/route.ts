import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { leseDokument, darfInline } from "@/lib/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string; docId: string }> }) {
  const { token, docId } = await params;
  const t = await db.portalToken.findUnique({ where: { tokenHash: sha256(token) }, include: { person: { select: { appGesperrtAm: true, status: true } } } });
  if (!t || t.gultigBis < new Date()) return new NextResponse("Link abgelaufen", { status: 403 });
  // Sperre/Austritt wirken sofort – wie in der Mitarbeiter-App (siehe requireApp).
  if (t.person.appGesperrtAm || t.person.status === "AUSGESCHIEDEN" || t.person.status === "GESPERRT") return new NextResponse("Link abgelaufen", { status: 403 });
  const d = await db.dokument.findUnique({ where: { id: docId } });
  if (!d || d.personId !== t.personId || !d.sichtbarImPortal) return new NextResponse("Nicht gefunden", { status: 404 });
  await db.auditLog.create({ data: { nutzerName: `Portal ${t.personId.slice(-6)}`, aktion: "EXPORT", entitaet: "Dokument", datensatzId: d.id, beschreibung: `Portal-Download ${d.dateiname}`, kostenstelleId: d.kostenstelleId } });
  return new NextResponse(new Uint8Array(await leseDokument(d.speicherpfad)), { headers: { "Content-Type": darfInline(d.mime) ? d.mime : "application/octet-stream", "Content-Disposition": `${darfInline(d.mime) ? "inline" : "attachment"}; filename="${encodeURIComponent(d.dateiname)}"`, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'" } });
}
