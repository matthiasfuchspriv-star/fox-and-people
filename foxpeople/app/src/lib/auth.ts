import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { hash, verify } from "@node-rs/argon2";
import { verify as totpVerify, generateSecret as totpGenerateSecret, generateURI as totpGenerateURI } from "otplib";
import { db } from "./db";
import { darfZugreifen, LIMITS } from "./bremse";
import { decryptField } from "./crypto";
import type { Rolle } from "@/generated/prisma/enums";

const COOKIE = "fp_session";
/**
 * Sitzungsgeheimnis. Im Echtbetrieb muss es gesetzt sein – sonst würden alle Anmeldungen mit einem
 * Wert signiert, der im Quelltext steht, und jeder, der ihn kennt, könnte sich eine Systemadmin-Sitzung
 * selbst ausstellen. Deshalb bricht der Start hier ab statt stillschweigend weiterzulaufen.
 */
const BEKANNTE_BEISPIELWERTE = [
  "dev-only-change-me-please-32-chars-minimum-xxxxxxxx", // .env.example
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", // .env.example FIELD_ENCRYPTION_KEY
];
function sitzungsGeheimnis(): string {
  const v = process.env.SESSION_SECRET;
  if (!v || v.length < 32) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET fehlt oder ist kürzer als 32 Zeichen – die Anwendung startet nicht.");
    return "dev-secret-change-me-please-32-chars-minimum";
  }
  // Die veröffentlichten Beispielwerte sind so gut wie gar kein Geheimnis: Wer sie kennt, stellt sich
  // selbst ein Systemadmin-Cookie aus. Eine reine Längenprüfung lässt sie durch – deshalb hier hart.
  if (process.env.NODE_ENV === "production" && (BEKANNTE_BEISPIELWERTE.includes(v) || BEKANNTE_BEISPIELWERTE.includes(process.env.FIELD_ENCRYPTION_KEY ?? ""))) {
    throw new Error("SESSION_SECRET oder FIELD_ENCRYPTION_KEY ist noch der Beispielwert aus .env.example – bitte eigene Zufallswerte setzen (openssl rand -hex 32). Die Anwendung startet nicht.");
  }
  return v;
}
const secret = () => new TextEncoder().encode(sitzungsGeheimnis());

export interface Session {
  nutzerId: string;
  name: string;
  email: string;
  rolle: Rolle;
  kostenstelleId: string | null; // null = Zentrale/Admin (alle Kostenstellen)
  /** aktuell gewählte Kostenstelle für Filter (Zentrale kann umschalten, null = alle) */
  aktiveKostenstelleId: string | null;
  totpPending?: boolean;
}

export const hashPassword = (pw: string) => hash(pw, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
export const verifyPassword = (h: string, pw: string) => verify(h, pw);
/**
 * Wegwerf-Hash für die Zeitangleichung bei unbekannter E-Mail (Anti-Enumeration). Er gehört zu
 * keinem Konto – die Prüfung dagegen schlägt immer fehl, kostet aber gleich viel Rechenzeit wie
 * eine echte Passwortprüfung, sodass sich existierende Konten nicht an der Antwortzeit ablesen lassen.
 */
const DUMMY_HASH = "$argon2id$v=19$m=19456,t=2,p=1$UAsebbI4zA5XanNqRFzlLA$U+9RGLJMZxRaQj8H9xVY06v3h7WhLhnfLjh7O073UR0";

export async function createSession(s: Session) {
  const token = await new SignJWT({ ...s })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const s = payload as unknown as Session & { iat?: number };
    // Sitzung gegen den Nutzer prüfen: Wer deaktiviert wurde, sein Passwort geändert hat oder eine
    // andere Rolle bekommen hat, darf mit einem alten Zugang nicht weiterarbeiten. Vorher galt ein
    // gestohlener Cookie bis zu 12 Stunden weiter – mit der alten Rolle und der alten Kostenstelle.
    const n = await db.nutzer.findUnique({
      where: { id: s.nutzerId },
      select: { aktiv: true, rolle: true, kostenstelleId: true, sitzungenGueltigAb: true },
    });
    if (!n || !n.aktiv) return null;
    if (n.sitzungenGueltigAb && s.iat && s.iat * 1000 < n.sitzungenGueltigAb.getTime()) return null;
    // Rolle und Kostenstelle immer aus der Datenbank, nie aus dem Cookie
    return { ...s, rolle: n.rolle, kostenstelleId: n.kostenstelleId };
  } catch {
    return null;
  }
}

/** Alle bestehenden Sitzungen eines Nutzers sofort ungültig machen. */
export async function sitzungenBeenden(nutzerId: string) {
  await db.nutzer.update({ where: { id: nutzerId }, data: { sitzungenGueltigAb: new Date() } });
}

/** Liefert die Session oder leitet zum Login weiter. */
export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s || s.totpPending) redirect("/login");
  return s;
}

export const istZentrale = (s: Session) => s.rolle === "SYSTEMADMIN" || s.rolle === "ZENTRALE";
export const istAdmin = (s: Session) => s.rolle === "SYSTEMADMIN";
/** Darf sensible Felder (SVNR, Sperrgrund, Lohndaten) sehen */
export const darfSensibel = (s: Session) => s.rolle !== "SACHBEARBEITUNG";
/** Darf Rechnungen freigeben/versenden */
export const darfRechnungen = (s: Session) => s.rolle !== "SACHBEARBEITUNG";

export async function requireRolle(...rollen: Rolle[]) {
  const s = await requireSession();
  if (!rollen.includes(s.rolle)) redirect("/?fehler=keine-berechtigung");
  return s;
}

/** Mandantenfilter: Zentrale darf alles (optional eingeschränkt auf gewählte KSt), andere nur die eigene. */
export function tenantWhere(s: Session): { kostenstelleId?: string } {
  if (istZentrale(s)) return s.aktiveKostenstelleId ? { kostenstelleId: s.aktiveKostenstelleId } : {};
  return { kostenstelleId: s.kostenstelleId! };
}

/** Prüft, ob eine Kostenstelle für die Session zulässig ist (Schreibzugriff). */
export function darfKostenstelle(s: Session, kostenstelleId: string) {
  return istZentrale(s) || s.kostenstelleId === kostenstelleId;
}

/** Löst die Kostenstelle für neu angelegte Datensätze auf. */
export function zielKostenstelle(s: Session, gewuenscht?: string | null): string {
  if (istZentrale(s)) {
    if (gewuenscht) return gewuenscht;
    if (s.aktiveKostenstelleId) return s.aktiveKostenstelleId;
    throw new Error("Bitte Kostenstelle wählen");
  }
  if (gewuenscht && gewuenscht !== s.kostenstelleId) throw new Error("Keine Berechtigung für diese Kostenstelle");
  return s.kostenstelleId!;
}

export async function clientIp() {
  const h = await headers();
  // Letzter Eintrag: den schreibt unser Reverse-Proxy. Der erste stammt vom Aufrufer und ist fälschbar.
  const f = h.get("x-forwarded-for");
  const teile = f ? f.split(",").map((x) => x.trim()).filter(Boolean) : [];
  return teile.length ? teile[teile.length - 1]! : (h.get("x-real-ip") ?? null);
}

// ---- Login-Flow ----------------------------------------------------------

export async function login(email: string, passwort: string): Promise<{ ok: true; totp: boolean } | { ok: false; fehler: string }> {
  const ip = await clientIp();
  // Bremse gegen Durchprobieren vieler Konten von einer Stelle aus
  if (!(await darfZugreifen(`login:ip:${ip ?? "unbekannt"}`, LIMITS.loginIp)))
    return { ok: false, fehler: "Zu viele Anmeldeversuche. Bitte in einer Stunde erneut versuchen." };
  const n = await db.nutzer.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!n || !n.aktiv) {
    // Gegen Konto-Enumeration über die Antwortzeit: Bei bekannter Adresse läuft immer die
    // Argon2-Prüfung (Zehntelsekunden). Fehlte hier eine gleich teure Rechnung, verriete die
    // schnellere Antwort, welche E-Mail-Adressen existieren. Deshalb einmal gegen einen
    // Wegwerf-Hash prüfen, damit beide Fälle gleich lange dauern.
    await verifyPassword(DUMMY_HASH, passwort).catch(() => false);
    await db.auditLog.create({ data: { nutzerName: email, aktion: "LOGIN_FAILED", entitaet: "Nutzer", ip, beschreibung: "Unbekannter Nutzer" } });
    return { ok: false, fehler: "E-Mail oder Passwort falsch." };
  }
  if (n.gesperrtBis && n.gesperrtBis > new Date()) return { ok: false, fehler: "E-Mail oder Passwort falsch." };
  const okPw = await verifyPassword(n.passwortHash, passwort);
  if (!okPw) {
    const fehl = (n.gesperrtBis && n.gesperrtBis <= new Date() ? 0 : n.fehlversuche) + 1;
    await db.nutzer.update({
      where: { id: n.id },
      data: { fehlversuche: fehl, gesperrtBis: fehl >= 10 ? new Date(Date.now() + 15 * 60 * 1000) : null },
    });
    await db.auditLog.create({ data: { nutzerId: n.id, nutzerName: n.name, aktion: "LOGIN_FAILED", entitaet: "Nutzer", datensatzId: n.id, ip } });
    return { ok: false, fehler: "E-Mail oder Passwort falsch." };
  }
  await db.nutzer.update({ where: { id: n.id }, data: { fehlversuche: 0, gesperrtBis: null, letzterLogin: n.totpSecret ? n.letzterLogin : new Date() } });
  const session: Session = {
    nutzerId: n.id,
    name: n.name,
    email: n.email,
    rolle: n.rolle,
    kostenstelleId: n.kostenstelleId,
    aktiveKostenstelleId: n.kostenstelleId,
    totpPending: !!n.totpSecret,
  };
  await createSession(session);
  if (!n.totpSecret) await db.auditLog.create({ data: { nutzerId: n.id, nutzerName: n.name, aktion: "LOGIN", entitaet: "Nutzer", datensatzId: n.id, ip } });
  return { ok: true, totp: !!n.totpSecret };
}

export async function verifyTotp(code: string): Promise<boolean> {
  const s = await getSession();
  if (!s?.totpPending) return false;
  // Bremse: Der zweite Faktor hat nur 10^6 Möglichkeiten – ohne Limit ließe er sich nach einem
  // erbeuteten Passwort schlicht durchprobieren.
  const { darfZugreifen } = await import("./bremse");
  if (!(await darfZugreifen(`totp:${s.nutzerId}`, { anzahl: 10, fensterMinuten: 15 }))) return false;
  const n = await db.nutzer.findUnique({ where: { id: s.nutzerId } });
  let sec: string | null = null;
  try { sec = decryptField(n?.totpSecret); } catch { return false; }
  if (!sec) return false;
  const r = await totpVerify({ token: code.replace(/\s/g, ""), secret: sec });
  if (!r.valid) return false;
  await createSession({ ...s, totpPending: false });
  await db.nutzer.update({ where: { id: s.nutzerId }, data: { letzterLogin: new Date() } });
  await db.auditLog.create({ data: { nutzerId: s.nutzerId, nutzerName: s.name, aktion: "LOGIN", entitaet: "Nutzer", datensatzId: s.nutzerId, beschreibung: "mit 2FA" } });
  return true;
}

export { totpGenerateSecret, totpGenerateURI, totpVerify };
