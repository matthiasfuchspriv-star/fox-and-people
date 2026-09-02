import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomInt } from "node:crypto";
import { db } from "./db";
import { sha256 } from "./crypto";
import { sendeMail } from "./mail";

/** Session der Mitarbeiter-App: eigener Cookie, 30 Tage, nur personId. Login per 6-stelligem Code an die E-Mail-Adresse. */
const COOKIE = "fp_app";
// Eigenes Geheimnis je Zugangsart, damit ein Zugang der Mitarbeiter-App nie als Büro-Zugang gilt
function appGeheimnis(): string {
  const v = process.env.SESSION_SECRET;
  if (!v || v.length < 32) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET fehlt oder ist kürzer als 32 Zeichen – die Anwendung startet nicht.");
    return "dev-secret-change-me-please-32-chars-minimum";
  }
  return `${v}:app`;
}
const secret = () => new TextEncoder().encode(appGeheimnis());

export interface AppSession { personId: string; name: string }

export async function appSessionErstellen(personId: string, name: string) {
  const token = await new SignJWT({ personId, name }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(secret());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
}
export async function appSessionBeenden() { (await cookies()).delete(COOKIE); }
export async function appSession(): Promise<AppSession | null> {
  const t = (await cookies()).get(COOKIE)?.value; if (!t) return null;
  try { const { payload } = await jwtVerify(t, secret()); return payload as unknown as AppSession; } catch { return null; }
}
export async function requireApp(): Promise<AppSession> {
  const s = await appSession();
  if (!s) redirect("/app/login");
  // Zugang kann vom Büro sofort gesperrt werden (Austritt, verlorenes Handy) – die Session gilt dann nicht mehr
  const p = await db.person.findUnique({ where: { id: s.personId }, select: { appGesperrtAm: true, status: true } });
  if (!p || p.appGesperrtAm || p.status === "AUSGESCHIEDEN" || p.status === "GESPERRT") { await appSessionBeenden(); redirect("/app/login?fehler=gesperrt"); }
  return s;
}

/** Person zur Eingabe (E-Mail oder Telefon) finden – nur aktive Mitarbeiter und Bewerber im Pool */
export async function personFuerLogin(eingabe: string) {
  const e = eingabe.trim().toLowerCase();
  // E-Mail: gezielte, indexierbare Abfrage. Der Endpunkt ist unauthentifiziert – die frühere Fassung
  // lud bei JEDEM Login-Versuch alle Personen mit Telefonnummer in den Speicher (mit tausenden
  // Bewerbern ein billiger Weg, die Datenbank lahmzulegen).
  if (e.includes("@")) {
    return db.person.findFirst({ where: { status: { in: ["VERMITTELT", "SUCHT"] }, email: { equals: e, mode: "insensitive" } }, select: { id: true, vorname: true, nachname: true, email: true, telefon: true } });
  }
  // Telefonnummer: Ziffern normalisiert in der Datenbank vergleichen statt alles zu laden.
  const tel = e.replace(/[^0-9+]/g, "").replace(/^\+43/, "0");
  if (tel.replace(/\D/g, "").length < 6) return null;
  const treffer = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Person"
    WHERE status IN ('VERMITTELT', 'SUCHT') AND telefon IS NOT NULL
      AND regexp_replace(replace(regexp_replace(telefon, '[^0-9+]', '', 'g'), '+43', '0'), '[^0-9]', '', 'g')
        = ${tel.replace(/\D/g, "")}
    LIMIT 2`;
  if (treffer.length !== 1) return null; // mehrdeutig oder nichts – kein Rateergebnis herausgeben
  return db.person.findUnique({ where: { id: treffer[0].id }, select: { id: true, vorname: true, nachname: true, email: true, telefon: true } });
}

/**
 * Code erzeugen, speichern (Hash) und **per E-Mail** zustellen (Entscheidung Matthias, 30.08.2026: kein SMS-Versand).
 * Gefunden werden kann die Person auch über die Telefonnummer – der Code geht aber immer an die hinterlegte E-Mail.
 * Im Testmodus (kein SMTP eingetragen) wird der Code zurückgegeben und am Bildschirm angezeigt.
 */
export async function loginCodeSenden(personId: string) {
  const p = await db.person.findUniqueOrThrow({ where: { id: personId } });
  if (!p.email) return { zugestelltAn: null, testCode: null, keineMail: true };
  // Der Code ist der einzige Faktor der App-Anmeldung – er muss aus einem kryptografischen
  // Zufallsgenerator kommen. Math.random() ist vorhersagbar (der interne Zustand lässt sich aus
  // Ausgaben rekonstruieren) und hat in einem Anmeldegeheimnis nichts verloren.
  const code = String(randomInt(100000, 1000000));
  await db.appLogin.deleteMany({ where: { personId } });
  await db.appLogin.create({ data: { personId, codeHash: sha256(code), gultigBis: new Date(Date.now() + 10 * 60000) } });
  const testMail = (process.env.MAIL_MODE ?? "test") === "test" || !process.env.SMTP_HOST;
  await sendeMail({
    an: p.email,
    betreff: `${code} ist dein Anmeldecode – Fox & People App`,
    text: `Hallo ${p.vorname},\n\ndein Code für die Fox & People App lautet: ${code}\n\nEr ist 10 Minuten gültig. Wenn du dich nicht anmelden wolltest, ignoriere diese Nachricht.\n\nFox & People\n+43 676 4574096`,
    referenzTyp: "AppLogin",
    referenzId: personId,
  });
  return { zugestelltAn: maskiere(p.email), testCode: testMail ? code : null, keineMail: false };
}
const maskiere = (m: string) => m.replace(/^(.).*(@.*)$/, "$1***$2");

export async function loginCodePruefen(personId: string, code: string) {
  const l = await db.appLogin.findFirst({ where: { personId }, orderBy: { erstelltAm: "desc" } });
  if (!l || l.gultigBis < new Date() || l.versuche >= 5) return false;
  if (l.codeHash !== sha256(code.trim())) { await db.appLogin.update({ where: { id: l.id }, data: { versuche: { increment: 1 } } }); return false; }
  await db.appLogin.deleteMany({ where: { personId } });
  await db.person.update({ where: { id: personId }, data: { appZuletztAktiv: new Date() } });
  return true;
}
