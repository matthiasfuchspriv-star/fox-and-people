/**
 * Import des bestehenden Excel-Tools "FoxandPeople_Verrechnungstool" in die Datenbank.
 * Blätter: "Bewerber & Mitarbeiter", "Stammdaten", "Aktive Mitarbeiter", "Monatsabrechnung", "Kalkulation".
 * Idempotent: bestehende Personen (Nachname+Vorname+Geburtsdatum) und Kunden (Firmenname) werden
 * wiederverwendet, Monatswerte werden per upsert aktualisiert.
 */
import ExcelJS from "exceljs";
import { db } from "./db";
import { encryptField } from "./crypto";
import type { PersonStatus } from "@/generated/prisma/enums";

export interface ImportErgebnis {
  personen: { neu: number; aktualisiert: number; uebersprungen: number };
  kunden: { neu: number };
  einsaetze: { neu: number };
  monatswerte: { gesetzt: number };
  qualifikationen: { neu: number };
  saetze: boolean;
  hinweise: string[];
}

type CellVal = ExcelJS.CellValue;

const text = (v: CellVal): string => {
  if (v == null) return "";
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("").trim();
    if ("result" in v) return text(v.result as CellVal);
    if (v instanceof Date) return v.toISOString();
    if ("text" in v) return String(v.text).trim();
    return "";
  }
  return String(v).trim();
};
const dateVal = (v: CellVal): Date | null => {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object" && "result" in v) return dateVal(v.result as CellVal);
  const s = text(v);
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};
const numVal = (v: CellVal): number | null => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  if (typeof v === "object" && "result" in v) return numVal(v.result as CellVal);
  const n = Number(text(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const ja = (v: CellVal) => /^(ja|j|x|yes|true|1)$/i.test(text(v));

const statusMap: Record<string, PersonStatus> = {
  vermittelt: "VERMITTELT",
  aktiv: "VERMITTELT",
  sucht: "SUCHT",
  bewerber: "SUCHT",
  gesperrt: "GESPERRT",
};

export async function importiereExcel(buffer: Buffer, kostenstelleId: string, importQuelle = "Excel-Import"): Promise<ImportErgebnis> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const erg: ImportErgebnis = {
    personen: { neu: 0, aktualisiert: 0, uebersprungen: 0 },
    kunden: { neu: 0 },
    einsaetze: { neu: 0 },
    monatswerte: { gesetzt: 0 },
    qualifikationen: { neu: 0 },
    saetze: false,
    hinweise: [],
  };

  // ---- Kunden-Cache
  const kundenCache = new Map<string, string>();
  const kundeId = async (name: string): Promise<string | null> => {
    const n = name.trim();
    if (!n) return null;
    const key = n.toLowerCase();
    if (kundenCache.has(key)) return kundenCache.get(key)!;
    let k = await db.kunde.findFirst({ where: { kostenstelleId, firmenname: { equals: n, mode: "insensitive" } } });
    if (!k) {
      k = await db.kunde.create({ data: { kostenstelleId, firmenname: n, notizen: `Angelegt durch ${importQuelle}` } });
      erg.kunden.neu++;
    }
    kundenCache.set(key, k.id);
    return k.id;
  };

  // ---- Personen
  const personenByName = new Map<string, string>();
  const ws = wb.getWorksheet("Bewerber & Mitarbeiter");
  if (ws) {
    for (let r = 5; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const nachname = text(row.getCell(3).value);
      const vorname = text(row.getCell(4).value);
      if (!nachname && !vorname) continue;
      const notizen = text(row.getCell(20).value);
      if (/Beispielzeile/i.test(notizen)) {
        erg.personen.uebersprungen++;
        continue;
      }
      const status = statusMap[text(row.getCell(2).value).toLowerCase()] ?? "SUCHT";
      const geburtsdatum = dateVal(row.getCell(6).value);
      const svnr = text(row.getCell(12).value).replace(/\s/g, "");
      const verfRaw = row.getCell(16).value;
      const verfText = text(verfRaw).toLowerCase();
      const hinterlegterKundeId = await kundeId(text(row.getCell(17).value));
      const data = {
        kostenstelleId,
        status,
        nachname,
        vorname,
        geburtsdatum,
        telefon: text(row.getCell(7).value) || null,
        email: text(row.getCell(8).value) || null,
        strasse: text(row.getCell(9).value) || null,
        plz: text(row.getCell(10).value) || null,
        ort: text(row.getCell(11).value) || null,
        svnrEnc: svnr ? encryptField(svnr) : null,
        svnrLast4: svnr ? svnr.slice(-4) : null,
        standardrolle: text(row.getCell(13).value) || null,
        verfuegbarSofort: verfText === "sofort",
        verfuegbarAb: verfText === "sofort" ? null : dateVal(verfRaw),
        hinterlegterKundeId,
        gesperrtSeit: dateVal(row.getCell(18).value),
        gesperrtGrund: text(row.getCell(19).value) || null,
        notizen: notizen || null,
        aufnahmedatum: dateVal(row.getCell(21).value) ?? new Date(),
        importQuelle,
      };
      const existing = await db.person.findFirst({
        where: { kostenstelleId, nachname: { equals: nachname, mode: "insensitive" }, vorname: { equals: vorname, mode: "insensitive" }, geburtsdatum: geburtsdatum ?? undefined },
      });
      let id: string;
      if (existing) {
        await db.person.update({ where: { id: existing.id }, data });
        id = existing.id;
        erg.personen.aktualisiert++;
      } else {
        id = (await db.person.create({ data })).id;
        erg.personen.neu++;
      }
      personenByName.set(`${vorname} ${nachname}`.toLowerCase().replace(/\s+/g, " "), id);
      personenByName.set(`${nachname} ${vorname}`.toLowerCase().replace(/\s+/g, " "), id);
      // Qualifikationen
      const quals: string[] = [];
      if (ja(row.getCell(14).value)) quals.push("Führerschein B");
      if (ja(row.getCell(15).value)) quals.push("Staplerschein");
      for (const typ of quals) {
        const q = await db.qualifikation.findFirst({ where: { personId: id, typ } });
        if (!q) {
          await db.qualifikation.create({ data: { personId: id, typ, notiz: `aus ${importQuelle}` } });
          erg.qualifikationen.neu++;
        }
      }
    }
  } else erg.hinweise.push("Blatt 'Bewerber & Mitarbeiter' nicht gefunden.");

  const findePerson = async (name: string): Promise<string | null> => {
    const key = name.toLowerCase().trim().replace(/\s+/g, " ");
    if (!key) return null;
    if (personenByName.has(key)) return personenByName.get(key)!;
    const [a, ...rest] = key.split(" ");
    const b = rest.join(" ");
    const p = await db.person.findFirst({
      where: {
        kostenstelleId,
        OR: [
          { nachname: { equals: a, mode: "insensitive" }, vorname: { equals: b, mode: "insensitive" } },
          { nachname: { equals: b, mode: "insensitive" }, vorname: { equals: a, mode: "insensitive" } },
        ],
      },
    });
    if (p) return p.id;
    // Stammdaten enthält Namen, die nicht in der Datenbank stehen → als aktiven Mitarbeiter anlegen
    const nachname = a.charAt(0).toUpperCase() + a.slice(1);
    const vorname = b ? b.charAt(0).toUpperCase() + b.slice(1) : "";
    const np = await db.person.create({ data: { kostenstelleId, status: "VERMITTELT", nachname, vorname, importQuelle, notizen: "Aus Blatt 'Stammdaten' angelegt – bitte Stammdaten ergänzen" } });
    erg.personen.neu++;
    erg.hinweise.push(`Person „${name}“ nur in Stammdaten gefunden – als aktiver Mitarbeiter angelegt.`);
    personenByName.set(key, np.id);
    return np.id;
  };

  // ---- Stammdaten (Kunde × Mitarbeiter × Rolle) → Einsatz + Monatsabrechnung
  const sd = wb.getWorksheet("Stammdaten");
  const ma = wb.getWorksheet("Monatsabrechnung");
  const jahr = new Date().getFullYear();
  if (sd) {
    for (let r = 9; r <= sd.rowCount; r++) {
      const row = sd.getRow(r);
      const kundeName = text(row.getCell(2).value);
      const maName = text(row.getCell(3).value);
      if (!kundeName || !maName) continue;
      const kId = await kundeId(kundeName);
      const pId = await findePerson(maName);
      if (!kId || !pId) continue;
      const rolle = text(row.getCell(4).value) || "Mitarbeiter";
      let einsatz = await db.einsatz.findFirst({ where: { personId: pId, kundeId: kId, status: { in: ["GEPLANT", "AKTIV"] } } });
      if (!einsatz) {
        einsatz = await db.einsatz.create({
          data: { kostenstelleId, personId: pId, kundeId: kId, rolleImEinsatz: rolle, von: new Date(Date.UTC(jahr, 0, 1)), status: "AKTIV", notizen: `aus ${importQuelle}` },
        });
        erg.einsaetze.neu++;
        await db.person.update({ where: { id: pId }, data: { status: "VERMITTELT", hinterlegterKundeId: kId } });
      }
      // Monatsabrechnung: Zeilenblock je Stammdaten-Zeile (3 Zeilen: Verrechnung, Bruttolohn, DB1) ab Zeile 9
      if (ma) {
        const idx = r - 9;
        const vRow = ma.getRow(9 + idx * 3);
        const lRow = ma.getRow(10 + idx * 3);
        for (let m = 0; m < 12; m++) {
          const verrechnung = numVal(vRow.getCell(5 + m).value);
          const bruttolohn = numVal(lRow.getCell(5 + m).value);
          if (verrechnung == null && bruttolohn == null) continue;
          await db.monatsabrechnung.upsert({
            where: { personId_kundeId_jahr_monat: { personId: pId, kundeId: kId, jahr, monat: m + 1 } },
            create: { kostenstelleId, personId: pId, kundeId: kId, einsatzId: einsatz.id, jahr, monat: m + 1, verrechnung, bruttolohn },
            update: { verrechnung, bruttolohn },
          });
          erg.monatswerte.gesetzt++;
        }
      }
    }
  }

  // ---- Aktive Mitarbeiter (Einsatz-Zuordnung mit Rolle im Einsatz)
  const am = wb.getWorksheet("Aktive Mitarbeiter");
  if (am) {
    for (let r = 5; r <= am.rowCount; r++) {
      const row = am.getRow(r);
      const name = text(row.getCell(2).value);
      if (!name) continue;
      const pId = await findePerson(name);
      if (!pId) continue;
      const p = await db.person.findUnique({ where: { id: pId } });
      if (!p?.hinterlegterKundeId) continue;
      const rolle = text(row.getCell(4).value) || p.standardrolle || "Mitarbeiter";
      const vorhanden = await db.einsatz.findFirst({ where: { personId: pId, kundeId: p.hinterlegterKundeId, status: { in: ["GEPLANT", "AKTIV"] } } });
      if (!vorhanden) {
        await db.einsatz.create({
          data: { kostenstelleId, personId: pId, kundeId: p.hinterlegterKundeId, rolleImEinsatz: rolle, standardrolleReferenz: p.standardrolle, von: new Date(), status: "AKTIV", notizen: `aus ${importQuelle}` },
        });
        erg.einsaetze.neu++;
      }
    }
  }

  // ---- Kalkulation → Satz-Set (nur falls noch keines existiert)
  const ka = wb.getWorksheet("Kalkulation");
  if (ka && (await db.abgabenSatzSet.count()) === 0) {
    const c = (r: number) => numVal(ka.getCell(`C${r}`).value) ?? 0;
    await db.abgabenSatzSet.create({
      data: {
        name: "WIFI NÖ 2023 (aus Excel importiert)",
        gultigAb: new Date(Date.UTC(2023, 0, 1)),
        saetze: {
          pensionsversicherung: c(7), krankenversicherung: c(8), unfallversicherung: c(9), arbeitslosenversicherung: c(10), iesg: c(11), wohnbaufoerderung: c(12),
          swf: c(14), mitarbeitervorsorge: c(15), dienstgeberbeitrag: c(16), dz: c(17), kommunalsteuer: c(18),
          urlaubszuschussPayroll: c(23), weihnachtsremunerationPayroll: c(24), invalidenausgleichstaxePayroll: c(26),
          abwUrlaub: c(39), abwFeiertage: c(40), abwKrankheit: c(41), abwSonstige: c(42), abwStehzeiten: c(43), abwKvFeiertage: c(44),
          urlaubszuschussUeberlassung: c(46), weihnachtsremunerationUeberlassung: c(47), invalidenausgleichstaxeUeberlassung: c(49),
          rueckstellungUrlaubsgeld: numVal(wb.getWorksheet("Stammdaten")?.getCell("C5").value ?? null) ?? 1 / 12,
          rueckstellungWeihnachtsgeld: numVal(wb.getWorksheet("Stammdaten")?.getCell("C6").value ?? null) ?? 1 / 12,
        },
      },
    });
    erg.saetze = true;
  }

  return erg;
}
