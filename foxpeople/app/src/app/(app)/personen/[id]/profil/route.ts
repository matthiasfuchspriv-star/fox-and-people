import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, darfKostenstelle } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { erzeugeKundenprofil } from "@/lib/profil-pdf";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  if (!s || s.totpPending) return NextResponse.redirect(new URL("/login", req.url));
  const r = await erzeugeKundenprofil(id, s.name);
  if (!r || !darfKostenstelle(s, r.person.kostenstelleId)) return new NextResponse("Nicht gefunden", { status: 404 });
  await audit(s, "EXPORT", "Person", id, "Kundenprofil-PDF erzeugt", undefined, r.person.kostenstelleId);
  await db.aktivitaet.create({ data: { typ: "PROFIL", text: "Kundenprofil (PDF) erzeugt / angesehen", nutzerName: s.name, personId: id } });
  return new NextResponse(new Uint8Array(r.buf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${encodeURIComponent(r.dateiname)}"` } });
}
