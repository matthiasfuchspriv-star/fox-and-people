import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, darfKostenstelle } from "@/lib/auth";
import { randomToken, sha256 } from "@/lib/crypto";
import { sendeMail } from "@/lib/mail";
import { firma as ladeFirma } from "@/lib/einstellungen";
import { audit } from "@/lib/audit";

/** Sendet einen Portal-Link (7 Tage gültig) an die E-Mail des Mitarbeiters */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  if (!s || s.totpPending) return NextResponse.redirect(new URL("/login", req.url));
  const p = await db.person.findUnique({ where: { id } });
  if (!p || !darfKostenstelle(s, p.kostenstelleId) || !p.email) return NextResponse.redirect(new URL(`/personen/${id}?tab=dokumente&fehler=email`, req.url));
  const token = randomToken(32);
  await db.portalToken.create({ data: { personId: id, tokenHash: sha256(token), gultigBis: new Date(Date.now() + 7 * 86400000) } });
  const f = await ladeFirma();
  const url = `${process.env.APP_URL ?? new URL(req.url).origin}/portal/${token}`;
  const r = await sendeMail({ an: p.email, betreff: `${f.name}: Ihre Unterlagen`, text: `Hallo ${p.vorname},\n\nüber folgenden persönlichen Link können Sie Ihre Unterlagen (Lohnzettel, Verträge, Einsatzbestätigungen) sicher abrufen. Der Link ist 7 Tage gültig und nur für Sie bestimmt:\n\n${url}\n\nMit freundlichen Grüßen\n${f.name} · ${f.telefon}`, referenzTyp: "Portal", referenzId: id });
  await audit(s, "SEND", "Portal", id, `Portal-Link an ${p.email} (${r.status})`, undefined, p.kostenstelleId);
  return NextResponse.redirect(new URL(`/personen/${id}?tab=dokumente&portal=${r.status}`, req.url), 303);
}
