import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { randomToken } from "./crypto";
import { db } from "./db";

const dir = () => path.resolve(process.env.FILE_STORAGE_DIR ?? "./storage");

/**
 * Erlaubte Dateitypen. Alles andere wird abgelehnt.
 *
 * Grund: Vorher wurde jede Datei mit dem vom Hochladenden angegebenen Typ direkt im Browser angezeigt.
 * Eine hochgeladene HTML- oder SVG-Datei hätte damit fremdes JavaScript im Browser der Dispo ausgeführt,
 * mit deren Rechten. Der Typ wird jetzt aus dieser Liste bestimmt, nicht aus der Angabe des Absenders.
 */
const ERLAUBT: Record<string, { mime: string; inline: boolean; endungen: string[] }> = {
  "application/pdf":  { mime: "application/pdf",  inline: true,  endungen: [".pdf"] },
  "image/jpeg":       { mime: "image/jpeg",       inline: true,  endungen: [".jpg", ".jpeg"] },
  "image/png":        { mime: "image/png",        inline: true,  endungen: [".png"] },
  "image/heic":       { mime: "image/jpeg",       inline: true,  endungen: [".heic"] },
  "image/heif":       { mime: "image/jpeg",       inline: true,  endungen: [".heif"] },
  "image/webp":       { mime: "image/webp",       inline: true,  endungen: [".webp"] },
  // Büro-Unterlagen: werden heruntergeladen statt angezeigt
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", inline: false, endungen: [".docx"] },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":       { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",       inline: false, endungen: [".xlsx"] },
  "text/csv":         { mime: "text/csv",         inline: false, endungen: [".csv"] },
};

/** Maximale Dateigröße – gilt für jeden Upload, egal aus welcher Maske. */
export const MAX_DATEI = 15 * 1024 * 1024;

export class DateiAbgelehnt extends Error {}

/** Prüft Typ und Größe und liefert den Typ, unter dem die Datei gespeichert und ausgeliefert wird. */
export function dateiPruefen(mime: string, dateiname: string, groesse: number): { mime: string; inline: boolean } {
  if (groesse > MAX_DATEI) throw new DateiAbgelehnt("Die Datei ist zu groß (höchstens 15 MB).");
  const endung = path.extname(dateiname).toLowerCase();
  const e = ERLAUBT[mime.toLowerCase().split(";")[0]!.trim()]
    ?? Object.values(ERLAUBT).find((x) => x.endungen.includes(endung));
  if (!e) throw new DateiAbgelehnt("Dieser Dateityp ist nicht erlaubt. Möglich sind PDF, JPG, PNG, Word, Excel und CSV.");
  return { mime: e.mime, inline: e.inline };
}

/** Wird die Datei im Browser angezeigt oder heruntergeladen? Unbekanntes wird immer heruntergeladen. */
export function darfInline(mime: string): boolean {
  return ERLAUBT[mime.toLowerCase().split(";")[0]!.trim()]?.inline ?? false;
}

export async function speichereDokument(opts: {
  kostenstelleId: string;
  dateiname: string;
  mime: string;
  inhalt: Buffer;
  kategorie: string;
  personId?: string | null;
  kundeId?: string | null;
  vertragId?: string | null;
  rechnungId?: string | null;
  angebotId?: string | null;
  sichtbarImPortal?: boolean;
  hochgeladenVon?: string;
  geprueft?: boolean;
  quelle?: string;
  /** Ablaufdatum des Dokuments (Ausweis, Bewilligung, Nachweis) – fließt in den Verfallsmonitor. */
  gultigBis?: Date | null;
  /** Wohin bei abgelehntem Dateityp zurückgeleitet wird (Server Actions). Ohne Angabe wird geworfen. */
  fehlerZiel?: string;
}) {
  // Typ und Größe prüfen, bevor irgendetwas auf die Platte kommt
  let geprueftTyp: { mime: string; inline: boolean };
  try {
    geprueftTyp = dateiPruefen(opts.mime, opts.dateiname, opts.inhalt.length);
  } catch (e) {
    if (e instanceof DateiAbgelehnt && opts.fehlerZiel) {
      const { redirect } = await import("next/navigation");
      redirect(`${opts.fehlerZiel}${opts.fehlerZiel.includes("?") ? "&" : "?"}fehler=dateityp`);
    }
    throw e;
  }
  const sub = path.join(dir(), opts.kostenstelleId);
  await mkdir(sub, { recursive: true });
  // Handyfotos sind oft 5–10 MB und tragen GPS-Daten im EXIF – verkleinern und Metadaten entfernen
  let inhalt = opts.inhalt, mime = geprueftTyp.mime, dateiname = opts.dateiname;
  if (/^image\/(jpe?g|png|heic|heif|webp)$/i.test(mime) && inhalt.length > 400_000) {
    try {
      const sharp = (await import("sharp")).default;
      const klein = await sharp(inhalt, { failOn: "none" }).rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
      if (klein.length < inhalt.length) { inhalt = klein; mime = "image/jpeg"; dateiname = dateiname.replace(/\.[^.]+$/, "") + ".jpg"; }
    } catch { /* Bild bleibt wie es ist – lieber Original speichern als gar nichts */ }
  }
  const name = `${Date.now()}-${randomToken(8)}${path.extname(dateiname) || ""}`;
  const p = path.join(sub, name);
  await writeFile(p, inhalt);
  return db.dokument.create({
    data: {
      kostenstelleId: opts.kostenstelleId,
      dateiname,
      mime,
      groesse: inhalt.length,
      speicherpfad: path.relative(dir(), p),
      kategorie: opts.kategorie,
      personId: opts.personId ?? null,
      kundeId: opts.kundeId ?? null,
      vertragId: opts.vertragId ?? null,
      rechnungId: opts.rechnungId ?? null,
      angebotId: opts.angebotId ?? null,
      sichtbarImPortal: opts.sichtbarImPortal ?? false,
      geprueft: opts.geprueft ?? true,
      quelle: opts.quelle ?? "INTERN",
      gultigBis: opts.gultigBis ?? null,
      hochgeladenVon: opts.hochgeladenVon,
    },
  });
}

export async function leseDokument(speicherpfad: string) {
  return readFile(path.join(dir(), speicherpfad));
}

/** Datei aus dem Dokumentenspeicher entfernen (Fehler werden vom Aufrufer ignoriert). */
export async function loescheDatei(speicherpfad: string) {
  const { unlink } = await import("node:fs/promises");
  await unlink(path.join(dir(), speicherpfad));
}
