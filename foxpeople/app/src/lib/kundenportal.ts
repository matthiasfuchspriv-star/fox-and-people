import { db } from "./db";
import { sha256 } from "./crypto";
import { randomBytes } from "node:crypto";
import { isoWoche, montagDerKw } from "./wochen";

/**
 * Kundenportal light: Der Beschäftiger bekommt einen Link per E-Mail und kann damit ohne Login
 * die Wochenstunden seiner überlassenen Mitarbeiter freigeben und eine kurze Bewertung abgeben.
 * Der Link ist an einen Zufallstoken gebunden (nur der Hash liegt in der Datenbank) und läuft ab.
 */
export const PORTAL_GUELTIG_TAGE = 7;
/**
 * Nach dem ersten Öffnen bleibt der Link noch so lange nutzbar. Damit kann der Beschäftiger am selben
 * Tag nochmal hineinschauen oder die Bewertung nachreichen – ein weitergeleiteter oder in einem
 * Postfach vergessener Link ist aber am nächsten Tag tot statt drei Wochen lang offen.
 */
export const PORTAL_NACHFRIST_STUNDEN = 24;

/** Ist dieser Token jetzt noch gültig? Ablaufdatum UND Nachfrist nach der ersten Verwendung. */
export function portalGueltig(t: { gultigBis: Date; verwendetAm: Date | null }, jetzt = new Date()): boolean {
  if (t.gultigBis < jetzt) return false;
  if (t.verwendetAm && t.verwendetAm.getTime() + PORTAL_NACHFRIST_STUNDEN * 3600000 < jetzt.getTime()) return false;
  return true;
}

export async function kundenPortalLink(opts: { kundeId: string; an: string; name?: string | null; zweck?: "STUNDEN" | "BEWERTUNG" | "BEIDES"; jahr?: number; kw?: number; tage?: number }): Promise<{ token: string; url: string; gultigBis: Date }> {
  const token = randomBytes(24).toString("base64url");
  const gultigBis = new Date(Date.now() + (opts.tage ?? PORTAL_GUELTIG_TAGE) * 86400000);
  const w = isoWoche(new Date(Date.now() - 3 * 86400000)); // Standard: die zuletzt abgeschlossene Woche
  await db.kundenPortalToken.create({
    data: { kundeId: opts.kundeId, tokenHash: sha256(token), an: opts.an, name: opts.name ?? null, zweck: opts.zweck ?? "BEIDES", jahr: opts.jahr ?? w.jahr, kw: opts.kw ?? w.kw, gultigBis },
  });
  const basis = process.env.APP_URL ?? "https://app.foxandpeople.at";
  return { token, url: `${basis.replace(/\/$/, "")}/kundenportal/${token}`, gultigBis };
}

export async function kundenPortalLaden(token: string) {
  const t = await db.kundenPortalToken.findUnique({ where: { tokenHash: sha256(token) }, include: { kunde: true } });
  if (!t || !portalGueltig(t)) return null;
  // Erste Verwendung festhalten – ab da läuft die Nachfrist
  if (!t.verwendetAm) await db.kundenPortalToken.update({ where: { id: t.id }, data: { verwendetAm: new Date() } });
  const jahr = t.jahr ?? isoWoche(new Date()).jahr;
  const kw = t.kw ?? isoWoche(new Date()).kw;
  const einsaetze = await db.einsatz.findMany({
    where: { kundeId: t.kundeId, status: { in: ["AKTIV", "BEENDET"] } },
    include: { person: { select: { id: true, vorname: true, nachname: true } } },
    orderBy: { von: "desc" },
  });
  const personIds = [...new Set(einsaetze.map((e) => e.personId))];
  const nachweise = await db.stundennachweis.findMany({
    where: { personId: { in: personIds }, jahr, kw },
    include: { person: { select: { id: true, vorname: true, nachname: true } } },
  });
  return { t, jahr, kw, montag: montagDerKw(jahr, kw), einsaetze, nachweise, personIds };
}
