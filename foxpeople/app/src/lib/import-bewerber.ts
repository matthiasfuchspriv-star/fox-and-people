import ExcelJS from "exceljs";
import { db } from "./db";
import { encryptField } from "./crypto";
import { staatAusText } from "./staaten";
import type { PersonStatus } from "@/generated/prisma/enums";

/**
 * Bewerber aus einer beliebigen Excel- oder CSV-Datei übernehmen.
 *
 * Der ältere Import ist fest auf das Verrechnungstool zugeschnitten: festes Blatt, feste Spalten,
 * Start in Zeile 5. Für eine Liste vom AMS, von einer Jobmesse oder aus einer anderen Software hilft
 * das nicht. Hier wird deshalb erst gelesen, was in der Datei steht, dann ordnet der Nutzer die
 * Spalten zu (mit einem Vorschlag, der die üblichen Überschriften erkennt), und erst dann wird
 * importiert – mit Vorschau und Dublettenprüfung, damit niemand dieselbe Person dreimal im Pool hat.
 */

export interface Tabelle {
  spalten: string[];
  zeilen: string[][];
}

/**
 * Obergrenzen beim Einlesen. Eine 15-MB-Excel-Datei kann entpackt mehrere Gigabyte ergeben
 * (16.384 Spalten × 1 Million Zeilen sind im Format vorgesehen) – ohne Grenzen reicht eine einzige
 * solche Datei, um den Server lahmzulegen. Für eine Bewerberliste sind diese Werte reichlich.
 */
export const MAX_ZEILEN = 20000;
export const MAX_SPALTEN = 100;
export const MAX_ZELLE = 500;
/**
 * Zusätzlich zur Zeilen- und Spaltengrenze eine Obergrenze für die Gesamtzahl der Zellen: 20.000
 * Zeilen sind bei 22 Spalten harmlos, bei 100 Spalten wären es zwei Millionen Zellen. Diese Grenze
 * begrenzt den Speicherbedarf unabhängig davon, wie die Datei geformt ist.
 */
export const MAX_ZELLEN = 400000;

class ZuGross extends Error {
  constructor(was: string) {
    super(`Die Datei ist zu groß: ${was}. Bitte teile die Liste auf oder entferne überflüssige Spalten.`);
  }
}

/**
 * Zielfelder, auf die eine Spalte gelegt werden kann.
 *
 * Zwei Gruppen: Die Basisfelder gelten für jede Liste. Die Mitarbeiterfelder erscheinen nur, wenn die
 * Liste als **Mitarbeiter** übernommen wird – eine Bewerberliste vom AMS enthält keine SVNR und keinen
 * Stundenlohn, und was nicht angeboten wird, kann auch niemand versehentlich falsch zuordnen.
 */
const BASIS_FELDER = [
  { key: "nachname", label: "Nachname", pflicht: true, muster: /nachname|familienname|zuname|surname|last.?name/i },
  { key: "vorname", label: "Vorname", pflicht: false, muster: /vorname|first|given/i },
  { key: "name", label: "Name (Vor- und Nachname in einer Spalte)", pflicht: false, muster: /^(voll|ganzer )?name$|full.?name|^person$/i },
  { key: "telefon", label: "Telefon", pflicht: false, muster: /tel|handy|mobil|phone|nummer/i },
  { key: "email", label: "E-Mail", pflicht: false, muster: /mail/i },
  { key: "geburtsdatum", label: "Geburtsdatum", pflicht: false, muster: /geb|birth/i },
  { key: "adresse", label: "Adresse (PLZ, Ort und Straße in einer Spalte)", pflicht: false, muster: /^adresse|anschrift|^address/i },
  { key: "strasse", label: "Straße", pflicht: false, muster: /stra(ß|ss)e|street|^str\.?$/i },
  { key: "plz", label: "PLZ", pflicht: false, muster: /plz|zip|postleit/i },
  { key: "ort", label: "Ort", pflicht: false, muster: /^ort$|wohnort|stadt|city/i },
  { key: "staatsangehoerigkeit", label: "Staatsangehörigkeit", pflicht: false, muster: /staat|nationalit|^country$/i },
  { key: "geschlecht", label: "Geschlecht oder Anrede", pflicht: false, muster: /geschlecht|gender|anrede/i },
  { key: "standardrolle", label: "Beruf / Rolle", pflicht: false, muster: /beruf|rolle|position|taetigkeit|tätigkeit|qualifikation/i, bevorzugt: /bew\.? ?beruf|wunschberuf|gesuchte/i },
  { key: "verfuegbarAb", label: "Verfügbar ab", pflicht: false, muster: /verf(ü|ue)gbar|einsatzbereit|ab wann|frei ab|^start/i },
  { key: "beworbenAm", label: "Beworben am / Erstkontakt", pflicht: false, muster: /bew\.? ?am|beworben|bewerbung|erstkontakt|eingang|angelegt/i },
  { key: "quelle", label: "Quelle (AMS, Messe …)", pflicht: false, muster: /quelle|herkunft|source|kanal/i },
  { key: "notizen", label: "Notiz", pflicht: false, muster: /notiz|bemerk|kommentar|anmerk/i },
  { key: "fuehrerschein", label: "Führerschein (ja/nein)", pflicht: false, muster: /f(ü|ue)hrerschein|(fs|pkw).?b|\bfs\b|driv/i },
  { key: "stapler", label: "Staplerschein (ja/nein)", pflicht: false, muster: /stapler|gabelstapler|forklift/i },
] as const;

/** Zusatzfelder für Mitarbeiterlisten – Stammdaten, die ein Bewerber noch nicht hat. */
const MITARBEITER_FELDER = [
  { key: "svnr", label: "Sozialversicherungsnummer", pflicht: false, muster: /svnr|sozialvers|versicherungsnummer|\bsv\b/i },
  { key: "eintrittsdatum", label: "Eintrittsdatum", pflicht: false, muster: /eintritt|beginn|einstell|dienstbeginn/i },
  { key: "austrittsdatum", label: "Austrittsdatum", pflicht: false, muster: /austritt|ende|beendig|abgang/i },
  { key: "stundenlohn", label: "Bruttostundenlohn (€)", pflicht: false, muster: /stundenlohn|std.?lohn|stundensatz|std.?satz|bruttolohn|^lohn$|gehalt/i },
  { key: "wochenstunden", label: "Wochenstunden", pflicht: false, muster: /wochenstunden|stunden.?woche|wochenarbeit|besch.?ausma/i },
  { key: "beschaeftigungsgruppe", label: "Beschäftigungsgruppe (KV)", pflicht: false, muster: /besch(ä|ae)ftigungsgruppe|lohngruppe|kv.?gruppe|verwendungsgruppe/i },
  { key: "notfallkontakt", label: "Notfallkontakt", pflicht: false, muster: /notfall|angeh(ö|oe)rig|emergency/i },
] as const;

export const ZIELFELDER = [...BASIS_FELDER, ...MITARBEITER_FELDER] as const;

/** Als was die Liste übernommen wird. */
export type Art = "BEWERBER" | "MITARBEITER";

/** Welche Zielfelder für diese Art angeboten werden. */
export function felderFuer(art: Art): readonly { key: Zielfeld; label: string; pflicht: boolean; muster: RegExp; bevorzugt?: RegExp }[] {
  return art === "MITARBEITER" ? ZIELFELDER : BASIS_FELDER;
}

export type Zielfeld = (typeof ZIELFELDER)[number]["key"];
/** Zuordnung Zielfeld → Spaltenindex (–1 = nicht zugeordnet) */
export type Zuordnung = Partial<Record<Zielfeld, number>>;

const txt = (v: ExcelJS.CellValue): string => {
  if (v == null) return "";
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("").trim();
    if ("result" in v) return txt(v.result as ExcelJS.CellValue);
    if (v instanceof Date) return `${String(v.getUTCDate()).padStart(2, "0")}.${String(v.getUTCMonth() + 1).padStart(2, "0")}.${v.getUTCFullYear()}`;
    if ("text" in v) return String(v.text).trim();
    return "";
  }
  return String(v).trim();
};

/** Eine CSV-Zeile zerlegen – kommt mit Semikolon, Komma und Anführungszeichen zurecht. */
function csvZeile(zeile: string, trenner: string): string[] {
  const felder: string[] = [];
  let feld = "", inAnfuehrung = false;
  for (let i = 0; i < zeile.length; i++) {
    const c = zeile[i];
    if (inAnfuehrung) {
      if (c === '"' && zeile[i + 1] === '"') { feld += '"'; i++; }
      else if (c === '"') inAnfuehrung = false;
      else feld += c;
    } else if (c === '"') inAnfuehrung = true;
    else if (c === trenner) { felder.push(feld.trim()); feld = ""; }
    else feld += c;
  }
  felder.push(feld.trim());
  return felder;
}

/** Datei einlesen – Excel oder CSV. Die erste nicht leere Zeile gilt als Überschrift. */
export async function leseTabelle(buffer: Buffer, dateiname: string): Promise<Tabelle> {
  const istCsv = /\.csv$/i.test(dateiname);
  let roh: string[][] = [];

  if (istCsv) {
    let inhalt = buffer.toString("utf8");
    if (inhalt.charCodeAt(0) === 0xfeff) inhalt = inhalt.slice(1); // BOM aus Excel
    const zeilen = inhalt.split(/\r?\n/).filter((z) => z.trim());
    if (!zeilen.length) throw new Error("Die Datei ist leer.");
    if (zeilen.length > MAX_ZEILEN + 50) throw new ZuGross(`mehr als ${MAX_ZEILEN} Zeilen`);
    // Trennzeichen erkennen: Excel schreibt im deutschen Raum Semikolon
    const trenner = (zeilen[0].match(/;/g)?.length ?? 0) >= (zeilen[0].match(/,/g)?.length ?? 0) ? ";" : ",";
    roh = zeilen.map((z) => csvZeile(z, trenner).slice(0, MAX_SPALTEN).map((f) => f.slice(0, MAX_ZELLE)));
  } else {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new Error("Die Datei enthält kein Tabellenblatt.");
    let abbruch: Error | null = null;
    ws.eachRow((row) => {
      if (abbruch || roh.length > MAX_ZEILEN + 50) { abbruch ??= new ZuGross(`mehr als ${MAX_ZEILEN} Zeilen`); return; }
      const werte: string[] = [];
      row.eachCell({ includeEmpty: true }, (c) => {
        if (werte.length >= MAX_SPALTEN) return;
        werte.push(txt(c.value).slice(0, MAX_ZELLE));
      });
      roh.push(werte);
    });
    if (abbruch) throw abbruch;
  }

  // Vorlaufende Leerzeilen und Titelzeilen überspringen: Überschrift ist die erste Zeile mit
  // mindestens zwei gefüllten Feldern.
  const kopfIndex = roh.findIndex((z) => z.filter((x) => x !== "").length >= 2);
  if (kopfIndex < 0) throw new Error("In der Datei war keine Tabelle mit Überschriften zu finden.");

  const spalten = roh[kopfIndex].slice(0, MAX_SPALTEN).map((s, i) => s || `Spalte ${i + 1}`);
  const zeilen = roh.slice(kopfIndex + 1)
    .map((z) => spalten.map((_, i) => z[i] ?? ""))
    .filter((z) => z.some((x) => x !== ""));
  if (zeilen.length > MAX_ZEILEN) throw new ZuGross(`${zeilen.length} Zeilen, erlaubt sind ${MAX_ZEILEN}`);
  if (zeilen.length * spalten.length > MAX_ZELLEN) throw new ZuGross(`${zeilen.length} Zeilen mal ${spalten.length} Spalten`);
  return { spalten, zeilen };
}

/** Spalten anhand der Überschriften vorschlagen – der Nutzer kann jede Zuordnung ändern. */
export function vorschlagZuordnung(spalten: string[], art: Art = "BEWERBER"): Zuordnung {
  const z: Zuordnung = {};
  const vergeben = new Set<number>();
  for (const feld of felderFuer(art)) {
    // Erst die eindeutigere Überschrift suchen: In einer Bewerberliste stehen oft „erl. Beruf" und
    // „bew. Beruf" nebeneinander – gemeint ist der, auf den sich die Person bewirbt.
    let treffer = feld.bevorzugt ? spalten.findIndex((s, i) => !vergeben.has(i) && feld.bevorzugt!.test(s)) : -1;
    if (treffer < 0) treffer = spalten.findIndex((s, i) => !vergeben.has(i) && feld.muster.test(s));
    if (treffer >= 0) { z[feld.key] = treffer; vergeben.add(treffer); }
  }
  // "Name" nur nutzen, wenn Vor- und Nachname nicht getrennt vorliegen
  if (z.nachname != null && z.vorname != null) delete z.name;
  return z;
}

const datum = (s: string): Date | null => {
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
  if (m) {
    const jahr = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return new Date(Date.UTC(jahr, Number(m[2]) - 1, Number(m[1])));
  }
  // Excel-Tageszahl: Manche Exporte schreiben Datumsangaben als bloße Zahl (46267 = 01.09.2026).
  // Tag 0 ist der 30.12.1899; der Bereich 20000–80000 deckt 1954 bis 2119 ab und kann nicht mit
  // einer Postleitzahl oder einer Telefonnummer verwechselt werden.
  if (/^\d{5}$/.test(s)) {
    const tage = Number(s);
    if (tage >= 20000 && tage <= 80000) return new Date(Date.UTC(1899, 11, 30) + tage * 86400000);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Geburtsdatum auf Plausibilität prüfen.
 *
 * In gewachsenen Beständen stehen Tippfehler wie „20.10.2986". Ein solcher Wert im Akt lässt später
 * jede Altersanzeige und jede Statistik unbrauchbar werden – lieber kein Geburtsdatum als ein falsches.
 */
const geburtsdatumPruefen = (d: Date | null): Date | null => {
  if (!d) return null;
  const jahr = d.getUTCFullYear();
  const heuer = new Date().getUTCFullYear();
  return jahr >= 1920 && jahr <= heuer - 14 ? d : null;
};

/**
 * Adresse aus einer einzigen Spalte zerlegen: „A-3386 Hafnerbach, Dunkelsteiner Str. 21".
 * Erkannt werden auch „3386 Hafnerbach, Straße 1", „Straße 1, 3386 Hafnerbach" und Zeilenumbrüche.
 * Was sich nicht sicher trennen lässt, bleibt als Straße stehen – Hauptsache, nichts geht verloren.
 */
export function adresseZerlegen(text: string): { strasse: string | null; plz: string | null; ort: string | null } {
  const roh = text.replace(/\s+/g, " ").trim();
  if (!roh) return { strasse: null, plz: null, ort: null };
  const teile = roh.split(",").map((t) => t.trim()).filter(Boolean);
  // Der Teil mit der Postleitzahl ist der Ortsteil, der Rest die Straße
  const plzTeil = teile.findIndex((t) => /(^|\s)([A-Z]{1,3}-)?\d{4,5}(\s|$)/.test(t));
  if (plzTeil < 0) return { strasse: roh || null, plz: null, ort: null };
  const ortsteil = teile[plzTeil];
  const strasse = teile.filter((_, i) => i !== plzTeil).join(", ") || null;
  const m = ortsteil.match(/(?:([A-Z]{1,3})-)?(\d{4,5})\s*(.*)$/);
  return { strasse, plz: m?.[2] ?? null, ort: (m?.[3] ?? "").trim() || null };
}
const jaNein = (s: string) => /^(ja|j|x|yes|true|wahr|1|1[.,]0+|vorhanden)$/i.test(s.trim());
/** Zahl aus einer Zelle – „12,50 €“, „12.50“, „1.234,56“ ergeben alle dasselbe. */
const zahl = (s: string): number | null => {
  const roh = s.replace(/[^\d,.\-]/g, "");
  if (!roh) return null;
  // Letztes Trennzeichen ist das Dezimaltrennzeichen, alles davor sind Tausenderpunkte
  const letzte = Math.max(roh.lastIndexOf(","), roh.lastIndexOf("."));
  const norm = letzte >= 0 ? roh.slice(0, letzte).replace(/[.,]/g, "") + "." + roh.slice(letzte + 1) : roh;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
};
/** m / w / d aus „männlich“, „Herr“, „M“ … */
const geschlechtAus = (s: string): string | null => {
  const t = s.trim().toLowerCase();
  if (!t) return null;
  if (/^(m|male|mann|m(ä|ae)nnlich|herr)/.test(t)) return "M";
  if (/^(w|f|female|frau|weiblich)/.test(t)) return "W";
  if (/^(d|divers|x)/.test(t)) return "D";
  return null;
};
const ziffern = (s: string) => s.replace(/[^\d]/g, "");

export interface Vorschau {
  zeile: number;
  vorname: string;
  nachname: string;
  telefon: string;
  email: string;
  rolle: string;
  ort: string;
  status: "NEU" | "DUBLETTE" | "FEHLT" | "ALT";
  hinweis?: string;
}

/** Was der Import tun würde – ohne etwas zu schreiben. */
export async function vorschau(t: Tabelle, z: Zuordnung, kostenstelleId: string, nurAb?: Date | null): Promise<Vorschau[]> {
  const erg: Vorschau[] = [];
  const gesehen = new Set<string>();
  const bestand = await ladeBestand(kostenstelleId);
  for (let i = 0; i < t.zeilen.length; i++) {
    const f = (k: Zielfeld) => (z[k] != null ? (t.zeilen[i][z[k]!] ?? "") : "");
    let vorname = f("vorname"), nachname = f("nachname");
    if (!nachname && f("name")) {
      const teile = f("name").trim().split(/\s+/);
      nachname = teile.length > 1 ? teile.slice(1).join(" ") : teile[0];
      vorname = teile.length > 1 ? teile[0] : "";
    }
    const telefon = f("telefon"), email = f("email");
    const adr = f("adresse") ? adresseZerlegen(f("adresse")) : { strasse: null, plz: null, ort: null };
    const ort = [f("plz") || adr.plz, f("ort") || adr.ort].filter(Boolean).join(" ");
    const zeile: Vorschau = { zeile: i + 1, vorname, nachname, telefon, email, ort, rolle: f("standardrolle"), status: "NEU" };
    if (!nachname) { zeile.status = "FEHLT"; zeile.hinweis = "kein Name"; erg.push(zeile); continue; }

    const beworben = datum(f("beworbenAm"));
    if (nurAb && (!beworben || beworben < nurAb)) {
      zeile.status = "ALT";
      zeile.hinweis = beworben ? `beworben ${beworben.toLocaleDateString("de-AT")}` : "kein Bewerbungsdatum";
      erg.push(zeile); continue;
    }

    // Dublette in der Datei selbst
    const schluessel = `${ziffern(telefon).slice(-7)}|${email.toLowerCase()}|${nachname.toLowerCase()}|${vorname.toLowerCase()}`;
    if (gesehen.has(schluessel)) { zeile.status = "DUBLETTE"; zeile.hinweis = "steht in der Datei doppelt"; erg.push(zeile); continue; }
    gesehen.add(schluessel);

    // Dublette im Bestand
    if (findeVorhandene(bestand, { vorname, nachname, telefon, email, geburtsdatum: geburtsdatumPruefen(datum(f("geburtsdatum"))) })) {
      zeile.status = "DUBLETTE"; zeile.hinweis = "gibt es schon im Pool";
    }
    erg.push(zeile);
  }
  return erg;
}

/**
 * Sichtbarer Bestand: die eigene Kostenstelle plus der gemeinsame Bewerber-Pool (Status SUCHT), der
 * bewusst für alle Kostenstellen offen ist. Ohne diese Einschränkung wäre die Dublettenprüfung ein
 * Auskunftsorakel: Man lädt eine Liste mit tausend Telefonnummern hoch und liest an „gibt es schon
 * im Pool" ab, wer in fremden Kostenstellen geführt wird.
 *
 * Geladen wird **einmal** in den Speicher, nicht je Zeile. Vorher waren es bis zu drei Abfragen pro
 * Zeile, darunter eine Telefonsuche mit `endsWith`, die keinen Index nutzen kann – bei einer Liste
 * mit ein paar tausend Zeilen legt das die Datenbank lahm.
 */
interface Bestand {
  telefon: Map<string, string>;
  email: Map<string, string>;
  name: Map<string, string>;
}

const nameSchluessel = (nachname: string, vorname: string, geb: Date | null) =>
  `${nachname.toLowerCase()}|${vorname.toLowerCase()}|${geb ? geb.toISOString().slice(0, 10) : ""}`;

async function ladeBestand(kostenstelleId: string): Promise<Bestand> {
  const personen = await db.person.findMany({
    where: { OR: [{ kostenstelleId }, { status: "SUCHT" as PersonStatus }] },
    select: { id: true, telefon: true, email: true, vorname: true, nachname: true, geburtsdatum: true },
  });
  const b: Bestand = { telefon: new Map(), email: new Map(), name: new Map() };
  for (const p of personen) merkeImBestand(b, p);
  return b;
}

function merkeImBestand(b: Bestand, p: { id: string; telefon: string | null; email: string | null; vorname: string; nachname: string; geburtsdatum: Date | null }) {
  const tel = ziffern(p.telefon ?? "").slice(-7);
  if (tel.length === 7 && !b.telefon.has(tel)) b.telefon.set(tel, p.id);
  if (p.email) b.email.set(p.email.toLowerCase(), p.id);
  b.name.set(nameSchluessel(p.nachname, p.vorname, p.geburtsdatum), p.id);
  if (p.geburtsdatum) b.name.set(nameSchluessel(p.nachname, p.vorname, null), p.id);
}

function findeVorhandene(b: Bestand, p: { vorname: string; nachname: string; telefon: string; email: string; geburtsdatum: Date | null }): string | null {
  const tel = ziffern(p.telefon).slice(-7);
  if (tel.length === 7 && b.telefon.has(tel)) return b.telefon.get(tel)!;
  if (p.email && b.email.has(p.email.toLowerCase())) return b.email.get(p.email.toLowerCase())!;
  return b.name.get(nameSchluessel(p.nachname, p.vorname, p.geburtsdatum)) ?? null;
}

export interface ImportBericht {
  neu: number;
  uebersprungen: number;
  /** wegen des Datumsfilters ausgelassen */
  gefiltert: number;
  fehler: string[];
}

/**
 * Import ausführen. Bestehende Personen werden **nicht** überschrieben – eine Liste von außen ist
 * selten aktueller als der eigene Akt. Sie werden gezählt und übersprungen.
 *
 * Mit `art: "MITARBEITER"` entstehen keine Bewerber, sondern Mitarbeiter: Status „vermittelt“ (bzw.
 * „ausgeschieden“, wenn ein Austrittsdatum in der Vergangenheit steht), Pipeline auf „eingestellt“,
 * und die Stammdaten aus den Zusatzspalten. Die Sozialversicherungsnummer wird wie überall sonst
 * verschlüsselt abgelegt; im Klartext steht nur die letzte Vierergruppe für die Anzeige.
 *
 * Geschrieben wird in Blöcken statt Zeile für Zeile. Bei einer Liste mit einigen tausend Bewerbern
 * sind das statt tausender Einzelbefehle ein paar Dutzend – das ist der Unterschied zwischen einer
 * halben Minute und einem Zeitablauf mitten im Import.
 */
const BLOCK = 200;

export async function importiereBewerber(
  t: Tabelle,
  z: Zuordnung,
  opts: { kostenstelleId: string; quelle: string; art?: Art; nurAb?: Date | null },
): Promise<ImportBericht> {
  const art = opts.art ?? "BEWERBER";
  const bericht: ImportBericht = { neu: 0, uebersprungen: 0, gefiltert: 0, fehler: [] };
  const gesehen = new Set<string>();
  const bestand = await ladeBestand(opts.kostenstelleId);
  const heute = new Date();

  type Fertig = { data: Record<string, unknown>; fuehrerschein: boolean; stapler: boolean; zeile: number };
  let block: Fertig[] = [];

  const blockSchreiben = async () => {
    if (!block.length) return;
    try {
      const angelegt = await db.person.createManyAndReturn({
        data: block.map((b) => b.data) as never,
        select: { id: true, vorname: true, nachname: true },
      });
      bericht.neu += angelegt.length;
      const quals = block.flatMap((b, i) => {
        // Die Rückgabe kommt in Einfügereihenfolge. Trotzdem wird gegengeprüft: Eine Qualifikation
        // beim falschen Menschen fiele erst auf, wenn jemand mit einem Staplerschein hinfährt,
        // den er nie hatte.
        const treffer = angelegt[i];
        const id = treffer && treffer.vorname === b.data.vorname && treffer.nachname === b.data.nachname ? treffer.id : null;
        if (!id) return [];
        const zeilen: { personId: string; typ: string; notiz: string }[] = [];
        if (b.fuehrerschein) zeilen.push({ personId: id, typ: "Führerschein B", notiz: `aus ${opts.quelle} – bitte Nachweis prüfen` });
        if (b.stapler) zeilen.push({ personId: id, typ: "Staplerschein", notiz: `aus ${opts.quelle} – bitte Nachweis prüfen` });
        return zeilen;
      });
      if (quals.length) await db.qualifikation.createMany({ data: quals });
    } catch {
      // Ein einziger fehlerhafter Datensatz darf nicht den ganzen Block kosten – dann eben einzeln.
      for (const b of block) {
        try {
          const p = await db.person.create({ data: b.data as never });
          if (b.fuehrerschein) await db.qualifikation.create({ data: { personId: p.id, typ: "Führerschein B", notiz: `aus ${opts.quelle} – bitte Nachweis prüfen` } });
          if (b.stapler) await db.qualifikation.create({ data: { personId: p.id, typ: "Staplerschein", notiz: `aus ${opts.quelle} – bitte Nachweis prüfen` } });
          bericht.neu++;
        } catch (e) {
          bericht.fehler.push(`Zeile ${b.zeile}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
    block = [];
  };

  for (let i = 0; i < t.zeilen.length; i++) {
    const f = (k: Zielfeld) => (z[k] != null ? (t.zeilen[i][z[k]!] ?? "").trim() : "");
    let vorname = f("vorname"), nachname = f("nachname");
    if (!nachname && f("name")) {
      const teile = f("name").trim().split(/\s+/);
      nachname = teile.length > 1 ? teile.slice(1).join(" ") : teile[0];
      vorname = teile.length > 1 ? teile[0] : "";
    }
    if (!nachname) { bericht.uebersprungen++; continue; }

    // Datumsfilter: alte Bewerbungen bleiben draußen, statt den Pool mit Karteileichen zu füllen
    const beworben = datum(f("beworbenAm"));
    if (opts.nurAb && (!beworben || beworben < opts.nurAb)) { bericht.gefiltert++; continue; }

    const telefon = f("telefon"), email = f("email");
    const schluessel = `${ziffern(telefon).slice(-7)}|${email.toLowerCase()}|${nachname.toLowerCase()}|${vorname.toLowerCase()}`;
    if (gesehen.has(schluessel)) { bericht.uebersprungen++; continue; }
    gesehen.add(schluessel);

    const geburtsdatum = geburtsdatumPruefen(datum(f("geburtsdatum")));
    if (findeVorhandene(bestand, { vorname, nachname, telefon, email, geburtsdatum })) {
      bericht.uebersprungen++;
      continue;
    }

    // Adresse: einzeln zugeordnete Spalten haben Vorrang vor der Sammelspalte
    const adr = f("adresse") ? adresseZerlegen(f("adresse")) : { strasse: null, plz: null, ort: null };
    const verf = f("verfuegbarAb");
    const sofort = /sofort|ab sofort|jederzeit/i.test(verf);
    const svnr = art === "MITARBEITER" ? ziffern(f("svnr")) : "";
    const austritt = art === "MITARBEITER" ? datum(f("austrittsdatum")) : null;
    const status: PersonStatus = art !== "MITARBEITER" ? "SUCHT" : austritt && austritt < heute ? "AUSGESCHIEDEN" : "VERMITTELT";

    block.push({
      zeile: i + 1,
      fuehrerschein: jaNein(f("fuehrerschein")),
      stapler: jaNein(f("stapler")),
      data: {
        kostenstelleId: opts.kostenstelleId,
        status,
        vorname, nachname, geburtsdatum,
        telefon: telefon || null,
        email: email || null,
        strasse: f("strasse") || adr.strasse,
        plz: f("plz") || adr.plz,
        ort: f("ort") || adr.ort,
        staatsangehoerigkeit: staatAusText(f("staatsangehoerigkeit")),
        geschlecht: geschlechtAus(f("geschlecht")),
        fuehrerschein: jaNein(f("fuehrerschein")),
        standardrolle: f("standardrolle") || null,
        verfuegbarSofort: art === "MITARBEITER" ? false : sofort,
        verfuegbarAb: art === "MITARBEITER" || sofort ? null : datum(verf),
        quelle: f("quelle") || opts.quelle,
        pipelineStufe: art === "MITARBEITER" ? "EINGESTELLT" : "NEU",
        pipelineAm: new Date(),
        erstkontaktAm: beworben,
        notizen: f("notizen") || null,
        aufnahmedatum: beworben ?? new Date(),
        importQuelle: opts.quelle,
        ...(art === "MITARBEITER" ? {
          svnrEnc: svnr ? encryptField(svnr) : null,
          svnrLast4: svnr ? svnr.slice(-4) : null,
          eintrittsdatum: datum(f("eintrittsdatum")),
          austrittsdatum: austritt,
          stundenlohn: zahl(f("stundenlohn")),
          wochenstunden: zahl(f("wochenstunden")),
          beschaeftigungsgruppe: f("beschaeftigungsgruppe") || null,
          notfallkontakt: f("notfallkontakt") || null,
        } : {}),
      },
    });
    // Gleich merken, damit spätere Zeilen derselben Datei nicht dieselbe Person nochmal anlegen
    merkeImBestand(bestand, { id: "neu", telefon: telefon || null, email: email || null, vorname, nachname, geburtsdatum });
    if (block.length >= BLOCK) await blockSchreiben();
  }
  await blockSchreiben();
  return bericht;
}
