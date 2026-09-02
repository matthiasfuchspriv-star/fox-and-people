/**
 * Was die WKO zu den verwendeten Kollektivverträgen sagt – Stand der Lohnordnung und Termin der
 * jährlichen Erhöhung.
 *
 * Warum das im Programm steht und nicht nur im Kopf: Ein Kollektivvertrag ist keine Konstante. Läuft
 * der Stichtag durch, ohne dass die Lohntafel nachgezogen wird, rechnet die Software am nächsten Tag
 * mit einem Lohn, den es nicht mehr gibt – und beim Referenzlohn nach § 10 AÜG heißt das Unterzahlung
 * mit Strafdrohung nach dem LSD-BG, nicht bloß eine veraltete Zahl.
 *
 * `stand` ist die Lohn- bzw. Gehaltsordnung, die zum Zeitpunkt der Recherche bei der WKO als gültig
 * ausgewiesen war. `turnus` ist der Monatstag, an dem dieser KV üblicherweise erhöht wird – daraus
 * rechnet die Übersicht den nächsten fälligen Termin.
 *
 * `bestaetigt: false` heißt: Der Termin ließ sich bei der Recherche nicht eindeutig belegen. Er wird
 * dann als offen angezeigt, nicht als Tatsache. Geraten wird hier nichts.
 *
 * Recherchiert am 01.09.2026 in der Kollektivvertragsdatenbank der WKO (wko.at/kollektivvertrag).
 * Beim Nachziehen einer Lohntafel gehört `stand` mit angepasst.
 */
export interface KvWkoInfo {
  /** gültig ab, wie bei der WKO ausgewiesen (ISO) */
  stand?: string;
  /** Monat und Tag der üblichen jährlichen Erhöhung */
  turnus?: { monat: number; tag: number };
  /** Ist der Termin belegt? false = bei der WKO nachsehen, wird als offen angezeigt */
  bestaetigt: boolean;
  url: string;
  titel: string;
}

export const KV_WKO: Record<string, KvWkoInfo> = {
  "AKÜ": {
    stand: "2026-01-01", turnus: { monat: 1, tag: 1 }, bestaetigt: true,
    titel: "Kollektivvertrag Arbeitskräfteüberlassung, Arbeiter/innen, gültig ab 1.1.2026",
    url: "https://www.wko.at/kollektivvertrag/kollektivvertrag-arbeitskraefteueberlassung-2026",
  },
  MTI: {
    stand: "2025-11-01", turnus: { monat: 11, tag: 1 }, bestaetigt: true,
    titel: "Lohnordnung metalltechnische Industrie, Arbeiter/innen, gültig ab 1.11.2025 und 1.11.2026",
    url: "https://www.wko.at/kollektivvertrag/lohnordnung-metalltechnische-industrie-arbeiter-2025-2026",
  },
  METALLGEWERBE: {
    stand: "2026-01-01", turnus: { monat: 1, tag: 1 }, bestaetigt: true,
    titel: "Lohnordnung Metallgewerbe, Arbeiter/innen, gültig ab 1.1.2026",
    url: "https://www.wko.at/kollektivvertrag/lohnordnung-metallgewerbe-arbeiter-2026",
  },
  "NE-METALL": {
    stand: "2025-11-01", turnus: { monat: 11, tag: 1 }, bestaetigt: false,
    titel: "Kollektivvertrag NE-Metallindustrie – Übersicht der WKO",
    url: "https://www.wko.at/industrie/ne-metallindustrie/kollektivvertrag-nicht-eisen-metallindustrie",
  },
  EEI: {
    stand: "2026-05-01", turnus: { monat: 5, tag: 1 }, bestaetigt: true,
    titel: "Kollektivvertrag Elektro- und Elektronikindustrie, gültig ab 1.5.2026",
    url: "https://www.wko.at/kollektivvertrag/kollektivvertrag-elektro-elektronikindustrie-2026",
  },
  FAHRZEUG: {
    stand: "2025-11-01", turnus: { monat: 11, tag: 1 }, bestaetigt: true,
    titel: "Kollektivvertrag Fahrzeugindustrie, Arbeiter/innen, gültig ab 1.11.2025",
    url: "https://www.wko.at/kollektivvertrag/kollektivvertrag-fahrzeugindustrie-arbeiter",
  },
  GIESSEREI: {
    bestaetigt: false,
    titel: "Gießereiindustrie – Kollektivverträge der WKO",
    url: "https://www.wko.at/oe/kollektivvertraege",
  },
  CHEMIE: {
    stand: "2026-05-01", turnus: { monat: 5, tag: 1 }, bestaetigt: true,
    titel: "Lohnordnung Chemische Industrie, Arbeiter/innen, gültig ab 1.5.2026",
    url: "https://www.wko.at/kollektivvertrag/lohnordnung-chemische-industrie-2026",
  },
  KUNSTSTOFF: {
    stand: "2026-05-01", turnus: { monat: 5, tag: 1 }, bestaetigt: true,
    titel: "Lohnordnung Kunststoffverarbeiter, Arbeiter/innen, gültig ab 1.5.2026",
    url: "https://www.wko.at/kollektivvertrag/lohnordnung-kunststoffverarbeiter-2026",
  },
  HOLZ: {
    stand: "2026-05-01", turnus: { monat: 5, tag: 1 }, bestaetigt: true,
    titel: "Lohnabschluss holzverarbeitende Industrie, Arbeiter/innen, gültig ab 1.5.2026",
    url: "https://www.wko.at/kollektivvertrag/kollektivvertrag-lohnabschluss-holzverarbeitende-industrie-2026",
  },
  PAPIER: {
    stand: "2025-05-01", turnus: { monat: 5, tag: 1 }, bestaetigt: true,
    titel: "Lohnordnung Papierindustrie, Arbeiter/innen, gültig ab 1.5.2025",
    url: "https://www.wko.at/kollektivvertrag/lohnordnung-papierindustrie-arbeiter-2025",
  },
  TEXTIL: {
    bestaetigt: false,
    titel: "Textilindustrie – Kollektivverträge der WKO",
    url: "https://www.wko.at/oe/kollektivvertraege",
  },
  NAGE: {
    bestaetigt: false,
    titel: "Nahrungs- und Genussmittelindustrie – Kollektivverträge der WKO",
    url: "https://www.wko.at/oe/kollektivvertraege/nahrungsmittelindustrie-lebensmittelindustrie-genussmitteli",
  },
  HANDEL: {
    stand: "2026-01-01", turnus: { monat: 1, tag: 1 }, bestaetigt: true,
    titel: "Kollektivvertrag Handel, Arbeiter/innen, gültig ab 1.1.2026",
    url: "https://www.wko.at/kollektivvertrag/kollektivvertrag-handel-arbeiter-2026",
  },
  SPEDITION: {
    stand: "2026-04-01", turnus: { monat: 4, tag: 1 }, bestaetigt: true,
    titel: "Lohnordnung Speditionen und Lagereibetriebe, Arbeiter/innen, gültig ab 1.4.2026",
    url: "https://www.wko.at/kollektivvertrag/lohnordnung-speditionen-lagereibetriebe-arbeiter-2026",
  },
  TRANSPORT: {
    stand: "2026-01-01", turnus: { monat: 1, tag: 1 }, bestaetigt: true,
    titel: "Kollektivvertrag Güterbeförderungsgewerbe, Arbeiter/innen, gültig ab 1.1.2026",
    url: "https://www.wko.at/kollektivvertrag/kollektivvertrag-gueterbefoerderungsgewerbe-2026",
  },
  GASTRO: {
    bestaetigt: false,
    titel: "Gastronomie und Hotellerie – Kollektivvertrag der WKO",
    url: "https://www.wko.at/tourismus-freizeitwirtschaft/serviceplattform-gastronomie-hotellerie/kollektivvertrag",
  },
  REINIGUNG: {
    stand: "2026-01-01", turnus: { monat: 1, tag: 1 }, bestaetigt: true,
    titel: "Lohnordnung Denkmal-, Fassaden- und Gebäudereinigung, Arbeiter/innen, gültig ab 1.1.2026",
    url: "https://www.wko.at/kollektivvertrag/lohnordnung-denkmal-fassaden-gebaeudereinigung-2026",
  },
  "ANG-GEWERBE": {
    stand: "2026-01-01", turnus: { monat: 1, tag: 1 }, bestaetigt: true,
    titel: "Kollektivvertrag Gewerbe, Handwerk und Dienstleistung, Angestellte, gültig ab 1.1.2026",
    url: "https://www.wko.at/kollektivvertrag/kollektivvertrag-gewerbe-handwerk-und-dienstleistung-2026",
  },
};

/** Nächster fälliger Erhöhungstermin dieses KV nach dem Stichtag. */
export function naechsterTermin(info: KvWkoInfo | undefined, ab = new Date()): Date | null {
  if (!info?.turnus) return null;
  const { monat, tag } = info.turnus;
  const heuer = new Date(Date.UTC(ab.getUTCFullYear(), monat - 1, tag));
  return heuer > ab ? heuer : new Date(Date.UTC(ab.getUTCFullYear() + 1, monat - 1, tag));
}

/** Tage bis zum nächsten Termin – darunter wird in der Übersicht vorgewarnt. */
export const VORWARNUNG_KV_TAGE = 60;
