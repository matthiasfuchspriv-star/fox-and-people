import { db } from "./db";
import { SAETZE_2023, DZ_BUNDESLAND, type AbgabenSaetze } from "@/engine/kalkulation";

/** Aktuell gültiges Satz-Set (zum Stichtag), DZ optional nach Bundesland überschrieben */
export async function aktuelleSaetze(bundesland?: string | null, stichtag = new Date()): Promise<{ saetze: AbgabenSaetze; setId: string | null; setName: string }> {
  const set = await db.abgabenSatzSet.findFirst({ where: { gultigAb: { lte: stichtag } }, orderBy: { gultigAb: "desc" } });
  const saetze: AbgabenSaetze = { ...SAETZE_2023, ...((set?.saetze as Partial<AbgabenSaetze>) ?? {}) };
  if (bundesland) {
    const dz = await db.dzSatz.findFirst({ where: { bundesland, gultigAb: { lte: stichtag } }, orderBy: { gultigAb: "desc" } });
    saetze.dz = dz?.satz ?? DZ_BUNDESLAND[bundesland] ?? saetze.dz;
  }
  return { saetze, setId: set?.id ?? null, setName: set?.name ?? "WIFI NÖ 2023 (Standard)" };
}

export async function einstellung<T>(key: string, fallback: T): Promise<T> {
  const e = await db.einstellung.findUnique({ where: { key } });
  return (e?.value as T) ?? fallback;
}

export async function setEinstellung(key: string, value: unknown) {
  await db.einstellung.upsert({ where: { key }, create: { key, value: value as object }, update: { value: value as object } });
}

export const FIRMA_DEFAULT = {
  name: "Fox & People",
  rechtstraeger: "Blackburn Beteiligungs GmbH",
  strasse: "Kettenreith 52",
  plz: "3233",
  ort: "Kilb",
  uid: "ATU 81895246",
  firmenbuch: "FN 647703 f, LG St. Pölten",
  telefon: "+43 676 4574096",
  email: "office@foxandpeople.at",
  iban: "AT53 1500 0040 7108 4307",
  bic: "OBKLAT2L",
  bank: "Oberbank AG",
  ustProzent: 20,
  zahlungszielTage: 0,
  mahnstufenTage: [4, 12, 19],
  angebotGueltigTage: 30,
  /// Mitarbeitervorsorgekasse (BMSVG) – steht im Arbeitsvertrag, Abschnitt X (Angabe von Matthias, 01.09.2026)
  mvk: "VBV Vorsorgekassa, Obere Donaustraße 49-53, 1020 Wien",
  /// Name der Mitarbeiter-App, wie er im Arbeitsvertrag genannt wird
  app: "Fox & People App",
};
export type Firma = typeof FIRMA_DEFAULT;
export const firma = () => einstellung<Firma>("firma", FIRMA_DEFAULT).then((f) => ({ ...FIRMA_DEFAULT, ...f }));
