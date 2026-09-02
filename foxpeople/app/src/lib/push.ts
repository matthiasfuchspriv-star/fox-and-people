import webpush from "web-push";
import { db } from "./db";
import { einstellung, setEinstellung } from "./einstellungen";

/**
 * Web-Push für die Mitarbeiter-App: kostenlos, ohne App Store, funktioniert auf Android und (ab iOS 16.4)
 * auf dem iPhone, sobald die App zum Startbildschirm hinzugefügt wurde. Der Mitarbeiter meldet sich mit
 * einem Klick an; die Schlüssel (VAPID) erzeugt das Programm beim ersten Mal selbst und legt sie in den
 * Einstellungen ab. Ohne Abo passiert nichts – die Zustellung ist immer „best effort“.
 */
export interface VapidSchluessel { publicKey: string; privateKey: string }

export async function vapidSchluessel(): Promise<VapidSchluessel> {
  const vorhanden = await einstellung<VapidSchluessel | null>("vapid", null);
  if (vorhanden?.publicKey && vorhanden?.privateKey) return vorhanden;
  const neu = webpush.generateVAPIDKeys();
  await setEinstellung("vapid", neu);
  return neu;
}

/** Öffentlicher Schlüssel für den Browser (im Client zum Abonnieren nötig). */
export async function vapidPublicKey(): Promise<string> {
  return (await vapidSchluessel()).publicKey;
}

export type PushAnlass = "STUNDEN_BESTAETIGT" | "STUNDEN_KORREKTUR" | "URLAUB" | "LOHNZETTEL" | "CHAT" | "EINSATZ" | "ERINNERUNG";

export interface PushNachricht { titel: string; text: string; url?: string; anlass: PushAnlass }

/**
 * Schickt eine Nachricht an alle Geräte eines Mitarbeiters. Abos, die der Browser dauerhaft ablehnt
 * (404/410), werden entfernt; vorübergehende Fehler werden gezählt und nach fünf Versuchen aufgeräumt.
 */
export async function pushAn(personId: string, n: PushNachricht): Promise<{ gesendet: number; entfernt: number }> {
  const abos = await db.pushAbo.findMany({ where: { personId } });
  if (!abos.length) return { gesendet: 0, entfernt: 0 };
  const { publicKey, privateKey } = await vapidSchluessel();
  const kontakt = process.env.PUSH_KONTAKT ?? "mailto:office@foxandpeople.at";
  webpush.setVapidDetails(kontakt, publicKey, privateKey);
  const payload = JSON.stringify({ titel: n.titel, text: n.text, url: n.url ?? "/app", anlass: n.anlass });
  let gesendet = 0, entfernt = 0;
  for (const a of abos) {
    try {
      await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, payload);
      await db.pushAbo.update({ where: { id: a.id }, data: { zuletztOk: new Date(), fehler: 0 } });
      gesendet++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410 || a.fehler >= 4) { await db.pushAbo.delete({ where: { id: a.id } }).catch(() => undefined); entfernt++; }
      else await db.pushAbo.update({ where: { id: a.id }, data: { fehler: a.fehler + 1 } });
    }
  }
  return { gesendet, entfernt };
}

/** Kurzform für die häufigen Anlässe – so steht der Text nur an einer Stelle. */
export const PUSH_TEXTE: Record<PushAnlass, (x: string) => PushNachricht> = {
  STUNDEN_BESTAETIGT: (x) => ({ anlass: "STUNDEN_BESTAETIGT", titel: "Stunden bestätigt", text: x, url: "/app/stunden" }),
  STUNDEN_KORREKTUR: (x) => ({ anlass: "STUNDEN_KORREKTUR", titel: "Stundennachweis bitte korrigieren", text: x, url: "/app/stunden" }),
  URLAUB: (x) => ({ anlass: "URLAUB", titel: "Urlaubsantrag", text: x, url: "/app/abwesenheit" }),
  LOHNZETTEL: (x) => ({ anlass: "LOHNZETTEL", titel: "Neuer Lohnzettel", text: x, url: "/app/lohn" }),
  CHAT: (x) => ({ anlass: "CHAT", titel: "Neue Nachricht von Fox & People", text: x, url: "/app/chat" }),
  EINSATZ: (x) => ({ anlass: "EINSATZ", titel: "Dein Einsatz", text: x, url: "/app" }),
  ERINNERUNG: (x) => ({ anlass: "ERINNERUNG", titel: "Erinnerung", text: x, url: "/app/stunden" }),
};
