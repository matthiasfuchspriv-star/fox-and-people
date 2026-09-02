import nodemailer from "nodemailer";
import { db } from "./db";

export interface MailOptions {
  an: string;
  /** Kopie (CC) – mehrere Adressen mit Komma getrennt. Leere Einträge werden verworfen. */
  cc?: string | null;
  betreff: string;
  text: string;
  html?: string;
  anhang?: { filename: string; content: Buffer; contentType?: string };
  anhaenge?: { filename: string; content: Buffer; contentType?: string }[]; // weitere Anhänge (z. B. Stundennachweise)
  referenzTyp?: string;
  referenzId?: string;
}

/** Adressliste aus einem Feld mit Komma- oder Semikolontrennung – leere Einträge fallen weg. */
export function ccListe(cc: string | null | undefined): string[] {
  return (cc ?? "").split(/[,;]/).map((x) => x.trim()).filter((x) => x.includes("@"));
}

/** Versand über SMTP; im MAIL_MODE=test wird nur protokolliert (MailLog). */
export async function sendeMail(m: MailOptions): Promise<{ ok: boolean; status: string; fehler?: string }> {
  const test = (process.env.MAIL_MODE ?? "test") === "test" || !process.env.SMTP_HOST;
  let status = test ? "TEST" : "GESENDET";
  let fehler: string | undefined;
  if (!test) {
    try {
      const t = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: Number(process.env.SMTP_PORT ?? 587) === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      });
      await t.sendMail({
        from: process.env.MAIL_FROM ?? "Fox & People <office@foxandpeople.at>",
        to: m.an,
        ...(ccListe(m.cc).length ? { cc: ccListe(m.cc) } : {}),
        subject: m.betreff,
        text: m.text,
        html: m.html,
        attachments: [...(m.anhang ? [m.anhang] : []), ...(m.anhaenge ?? [])].map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
      });
    } catch (e) {
      status = "FEHLER";
      fehler = e instanceof Error ? e.message : String(e);
    }
  }
  await db.mailLog.create({
    // Die Kopie gehört ins Protokoll: Sonst ist später nicht nachvollziehbar, wer die Rechnung
    // tatsächlich bekommen hat.
    // Anmeldecodes der Mitarbeiter-App sind 10 Minuten gültig – im Klartext protokolliert könnte sich
    // jeder mit Leserechten auf die Datenbank in diesem Fenster als Mitarbeiter anmelden.
    data: { an: ccListe(m.cc).length ? `${m.an} (CC: ${ccListe(m.cc).join(", ")})` : m.an, betreff: m.betreff, text: m.referenzTyp === "AppLogin" ? m.text.replace(/\b\d{6}\b/g, "••••••") : m.text, anhangName: [m.anhang?.filename, ...(m.anhaenge ?? []).map((a) => a.filename)].filter(Boolean).join(", ") || null, status, fehler, referenzTyp: m.referenzTyp, referenzId: m.referenzId },
  });
  // Ein gescheiterter Versand stand bisher nur im MailLog – einer Liste, in die man nur schaut, wenn
  // man ohnehin schon etwas vermutet. Damit wäre ein toter SMTP-Zugang erst aufgefallen, wenn
  // wochenlang keine Stundenzettel mehr eingehen. Jetzt steht er auch im Fehlerprotokoll und damit
  // am nächsten Morgen in der Mail. Die Tagesmail selbst ist ausgenommen: Ist der Versand kaputt,
  // käme die Meldung darüber ohnehin nicht an, und sie würde sich täglich selbst neu eintragen.
  if (status === "FEHLER" && m.referenzTyp !== "Tagesmail") {
    const { fehlerMelden } = await import("./fehler");
    await fehlerMelden("Mailversand", fehler ?? "unbekannter Fehler", { detail: `An: ${m.an}\nBetreff: ${m.betreff}` });
  }
  return { ok: status !== "FEHLER", status, fehler };
}
