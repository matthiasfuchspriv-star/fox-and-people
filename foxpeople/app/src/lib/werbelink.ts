import { db } from "./db";
import { randomToken } from "./crypto";

/**
 * Persönlicher Empfehlungs-Link „Freunde werben Freunde“.
 *
 * Der Mitarbeiter teilt einen Link wie meine.foxandpeople.at/w/thomas-4f2a per WhatsApp. Sein Freund
 * bewirbt sich darüber selbst – ohne Login, in einer halben Minute. Damit fällt das Abtippen von Name und
 * Telefonnummer weg (die häufigste Abbruchstelle) und das Einverständnis gibt der Freund selbst, statt dass
 * der Werber es für ihn behauptet (Art. 14 DSGVO).
 *
 * Derselbe Mechanismus ohne Werbercode ist die allgemeine Kurzbewerbung unter /bewerben – der QR-Code dazu
 * gehört auf Flyer, Aushang, Fahrzeug, Visitenkarte und auf jede Einsatzbestätigung.
 */

const slug = (t: string) =>
  t.toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "fox";

/** Erzeugt den Werbecode einer Person beim ersten Aufruf und gibt ihn zurück. */
export async function werbecodeFuer(personId: string): Promise<string> {
  const p = await db.person.findUniqueOrThrow({ where: { id: personId }, select: { werbecode: true, vorname: true, nachname: true } });
  if (p.werbecode) return p.werbecode;
  for (let i = 0; i < 5; i++) {
    const code = `${slug(p.vorname)}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4)}`;
    const frei = !(await db.person.findFirst({ where: { werbecode: code }, select: { id: true } }));
    if (!frei) continue;
    await db.person.update({ where: { id: personId }, data: { werbecode: code } });
    return code;
  }
  const fallback = randomToken(8).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
  await db.person.update({ where: { id: personId }, data: { werbecode: fallback } });
  return fallback;
}

export function appBasis(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export const werbeUrl = (code: string) => `${appBasis()}/w/${code}`;
export const bewerbenUrl = (quelle?: string) => `${appBasis()}/bewerben${quelle ? `?q=${encodeURIComponent(quelle)}` : ""}`;

/** Fertiger Text zum Teilen – kurz genug für WhatsApp, mit dem Link am Ende. */
export function werbeText(vorname: string, url: string, praemie: number, startbonus: number): string {
  const eur = (n: number) => `${n.toLocaleString("de-AT")} €`;
  return `Hallo! Ich arbeite bei Fox & People und wir suchen Leute. Wenn du über meinen Link anfängst, bekommst du ${eur(startbonus)} Startbonus – und ich ${eur(praemie)}. Dauert 30 Sekunden:\n${url}\nLG ${vorname}`;
}

/** Werber zu einem Code finden (nur aktive Mitarbeiter und Bewerber im Pool dürfen werben). */
export async function werberZuCode(code: string) {
  if (!code) return null;
  return db.person.findFirst({
    where: { werbecode: code.toLowerCase(), status: { in: ["VERMITTELT", "SUCHT"] } },
    select: { id: true, vorname: true, nachname: true, kostenstelleId: true },
  });
}
