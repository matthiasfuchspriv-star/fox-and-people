/**
 * Staatsangehörigkeiten für das Pflicht-Dropdown bei der Personenanlage und die Prüfung,
 * ob eine Arbeitsbewilligung (AuslBG) erforderlich ist.
 *
 * Freizügigkeit (keine Bewilligung): EU, EWR (Island, Liechtenstein, Norwegen), Schweiz.
 * Drittstaaten: Beschäftigung nur mit Beschäftigungsbewilligung, Rot-Weiß-Rot-Karte, „Rot-Weiß-Rot-Karte plus“,
 * Aufenthaltsberechtigung plus/Asylberechtigung, Vertriebenen-Ausweis (Ukraine) o. Ä. – Nachweis mit Ablaufdatum pflegen.
 * Referenzliste, keine Rechtsberatung – Sonderfälle (Asylwerber, Studierende, Saisoniers) mit dem AMS klären.
 */
export const EU_EWR_CH = [
  "Österreich", "Belgien", "Bulgarien", "Dänemark", "Deutschland", "Estland", "Finnland", "Frankreich", "Griechenland", "Irland", "Italien",
  "Kroatien", "Lettland", "Litauen", "Luxemburg", "Malta", "Niederlande", "Polen", "Portugal", "Rumänien", "Schweden", "Slowakei", "Slowenien",
  "Spanien", "Tschechien", "Ungarn", "Zypern", "Island", "Liechtenstein", "Norwegen", "Schweiz",
];

export const DRITTSTAATEN = [
  "Afghanistan", "Ägypten", "Albanien", "Algerien", "Argentinien", "Armenien", "Aserbaidschan", "Äthiopien", "Australien", "Bangladesch", "Belarus",
  "Bosnien und Herzegowina", "Brasilien", "Chile", "China", "Eritrea", "Georgien", "Ghana", "Indien", "Indonesien", "Irak", "Iran", "Israel", "Japan",
  "Jordanien", "Kamerun", "Kanada", "Kasachstan", "Kenia", "Kirgisistan", "Kolumbien", "Kosovo", "Kuba", "Libanon", "Libyen", "Marokko", "Mexiko",
  "Moldau", "Mongolei", "Montenegro", "Nepal", "Nigeria", "Nordmazedonien", "Pakistan", "Peru", "Philippinen", "Russland", "Saudi-Arabien", "Senegal",
  "Serbien", "Somalia", "Sri Lanka", "Südafrika", "Südkorea", "Sudan", "Syrien", "Tadschikistan", "Thailand", "Tunesien", "Türkei", "Turkmenistan",
  "Ukraine", "USA", "Usbekistan", "Venezuela", "Vereinigtes Königreich", "Vietnam", "Sonstiger Drittstaat",
];

export const STAATEN = [...EU_EWR_CH, ...DRITTSTAATEN.slice(0, -1).sort((a, b) => a.localeCompare(b, "de")), "Staatenlos", "Sonstiger Drittstaat"];

/** true = Arbeitsbewilligung / Aufenthaltstitel mit Arbeitsmarktzugang erforderlich. */
export function brauchtArbeitsbewilligung(staat: string | null | undefined): boolean {
  if (!staat) return false;
  return !EU_EWR_CH.some((s) => s.toLowerCase() === staat.trim().toLowerCase());
}

/** Hinweistext je Staatsgruppe. */
export function bewilligungHinweis(staat: string | null | undefined): string | null {
  if (!brauchtArbeitsbewilligung(staat)) return null;
  if (staat === "Ukraine") return "Vertriebene aus der Ukraine: Vertriebenen-Ausweis (blaue Karte) genügt für freien Arbeitsmarktzugang – Ablauf überwachen.";
  if (staat === "Vereinigtes Königreich") return "Brexit: nur mit „Artikel 50 EUV“-Aufenthaltstitel frei; sonst Rot-Weiß-Rot-Karte oder Beschäftigungsbewilligung.";
  return "Drittstaat: Beschäftigungsbewilligung (AMS), Rot-Weiß-Rot-Karte (plus), Aufenthaltsberechtigung plus/Asylberechtigung oder Daueraufenthalt-EU erforderlich – Nachweis mit Ablaufdatum hinterlegen.";
}

/** Erkennt Qualifikations-Typen, die als Arbeitsbewilligung/Aufenthaltstitel gelten. */
export const IST_BEWILLIGUNG = /arbeitsbewilligung|arbeitserlaubnis|beschäftigungsbewilligung|aufenthalt|rot-wei|rwr|vertriebenen|asyl|daueraufenthalt|niederlassung/i;

/**
 * Länderkürzel aus fremden Systemen in Klartext übersetzen.
 *
 * Branchensoftware exportiert die Staatsangehörigkeit meist als ISO-3166-Kürzel („AUT", „SYR").
 * In unserem Akt steht ein Klartextname – schon deshalb, weil `brauchtArbeitsbewilligung()` daran
 * erkennt, ob ein Nachweis nötig ist. Enthalten sind neben den ISO-Kürzeln auch die beiden in
 * Österreich üblichen Sonderfälle XKS (Kosovo) und STL (staatenlos) sowie das historische SCG.
 */
const CODES: Record<string, string> = {
  AUT: "Österreich", BEL: "Belgien", BGR: "Bulgarien", DNK: "Dänemark", DEU: "Deutschland", EST: "Estland",
  FIN: "Finnland", FRA: "Frankreich", GRC: "Griechenland", IRL: "Irland", ITA: "Italien", HRV: "Kroatien",
  LVA: "Lettland", LTU: "Litauen", LUX: "Luxemburg", MLT: "Malta", NLD: "Niederlande", POL: "Polen",
  PRT: "Portugal", ROU: "Rumänien", SWE: "Schweden", SVK: "Slowakei", SVN: "Slowenien", ESP: "Spanien",
  CZE: "Tschechien", HUN: "Ungarn", CYP: "Zypern", ISL: "Island", LIE: "Liechtenstein", NOR: "Norwegen",
  CHE: "Schweiz",
  AFG: "Afghanistan", EGY: "Ägypten", ALB: "Albanien", DZA: "Algerien", ARG: "Argentinien", ARM: "Armenien",
  AZE: "Aserbaidschan", ETH: "Äthiopien", AUS: "Australien", BGD: "Bangladesch", BLR: "Belarus",
  BIH: "Bosnien und Herzegowina", BRA: "Brasilien", CHL: "Chile", CHN: "China", ERI: "Eritrea",
  GEO: "Georgien", GHA: "Ghana", IND: "Indien", IDN: "Indonesien", IRQ: "Irak", IRN: "Iran", ISR: "Israel",
  JPN: "Japan", JOR: "Jordanien", CMR: "Kamerun", CAN: "Kanada", KAZ: "Kasachstan", KEN: "Kenia",
  KGZ: "Kirgisistan", COL: "Kolumbien", XKS: "Kosovo", XKX: "Kosovo", KOS: "Kosovo", CUB: "Kuba",
  LBN: "Libanon", LBY: "Libyen", MAR: "Marokko", MEX: "Mexiko", MDA: "Moldau", MNG: "Mongolei",
  MNE: "Montenegro", NPL: "Nepal", NGA: "Nigeria", MKD: "Nordmazedonien", PAK: "Pakistan", PER: "Peru",
  PHL: "Philippinen", RUS: "Russland", SAU: "Saudi-Arabien", SEN: "Senegal", SRB: "Serbien",
  SCG: "Serbien", SOM: "Somalia", LKA: "Sri Lanka", ZAF: "Südafrika", KOR: "Südkorea", SDN: "Sudan",
  SYR: "Syrien", TJK: "Tadschikistan", THA: "Thailand", TUN: "Tunesien", TUR: "Türkei",
  TKM: "Turkmenistan", UKR: "Ukraine", USA: "USA", UZB: "Usbekistan", VEN: "Venezuela",
  GBR: "Vereinigtes Königreich", VNM: "Vietnam", STL: "Staatenlos", XXX: "Staatenlos",
  // Staaten außerhalb unserer Auswahlliste – der Klartext ist trotzdem besser als das Kürzel,
  // und für die Bewilligungsprüfung zählt ohnehin nur „nicht EU/EWR/Schweiz“.
  BEN: "Benin", BWA: "Botswana", BDI: "Burundi", DOM: "Dominikanische Republik", ECU: "Ecuador",
  CIV: "Elfenbeinküste", GMB: "Gambia", GIN: "Guinea", HND: "Honduras", COD: "Kongo (Dem. Rep.)",
  COG: "Kongo (Rep.)", MRT: "Mauretanien", NIC: "Nicaragua", PSE: "Palästina", SLE: "Sierra Leone",
  TGO: "Togo", TZA: "Tansania", UGA: "Uganda", ZWE: "Simbabwe",
};

/** Zweibuchstabige Kürzel, soweit sie eindeutig sind. */
const CODES2: Record<string, string> = {
  AT: "Österreich", DE: "Deutschland", CH: "Schweiz", HU: "Ungarn", SK: "Slowakei", CZ: "Tschechien",
  PL: "Polen", RO: "Rumänien", BG: "Bulgarien", HR: "Kroatien", SI: "Slowenien", IT: "Italien",
  RS: "Serbien", BA: "Bosnien und Herzegowina", MK: "Nordmazedonien", XK: "Kosovo", TR: "Türkei",
  SY: "Syrien", AF: "Afghanistan", RU: "Russland", UA: "Ukraine", NG: "Nigeria", SO: "Somalia", IQ: "Irak",
};

/**
 * Staatsangehörigkeit aus einer beliebigen Zelle bestimmen: Kürzel oder Klartext.
 * Unbekannte Werte kommen unverändert zurück – lieber „Ruritanien“ im Akt als gar nichts.
 */
export function staatAusText(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  if (!t || t === "-") return null;
  const gross = t.toUpperCase();
  if (/^[A-Z]{3}$/.test(gross) && CODES[gross]) return CODES[gross];
  if (/^[A-Z]{2}$/.test(gross) && CODES2[gross]) return CODES2[gross];
  const treffer = STAATEN.find((s) => s.toLowerCase() === t.toLowerCase());
  return treffer ?? t;
}
