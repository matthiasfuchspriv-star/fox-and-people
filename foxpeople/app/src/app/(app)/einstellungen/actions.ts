"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRolle, hashPassword, verifyPassword, totpGenerateSecret, totpGenerateURI, totpVerify, requireSession, createSession } from "@/lib/auth";
import { encryptField, decryptField } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { setEinstellung, firma as ladeFirma } from "@/lib/einstellungen";
import { importiereExcel } from "@/lib/import-excel";
import { parseNum, parseDate, str, strOrNull } from "@/lib/format";
import { ZULAGEN_DEFAULT } from "@/lib/zulagen";
import { referenzKvSynchronisieren } from "@/lib/referenzlohn";
import { keinZuschlagLoeschen } from "@/lib/referenz-entscheidung";
import { FRISTEN_DEFAULT, type Fristenstufe, type Fristentabelle, type Termin } from "@/lib/fristen";
import type { ZulageArt } from "@/generated/prisma/enums";
import { SAETZE_2023, type AbgabenSaetze } from "@/engine/kalkulation";
import type { Rolle, VertragTyp } from "@/generated/prisma/enums";
import QRCode from "qrcode";
import { BEREICHE, bereichLeeren } from "@/lib/loeschen";

const admin = () => requireRolle("SYSTEMADMIN");

export async function firmaSpeichern(fd: FormData) {
  const s = await admin();
  const f = await ladeFirma();
  const neu = { ...f, name: str(fd.get("name")), rechtstraeger: str(fd.get("rechtstraeger")), strasse: str(fd.get("strasse")), plz: str(fd.get("plz")), ort: str(fd.get("ort")), uid: str(fd.get("uid")), firmenbuch: str(fd.get("firmenbuch")), telefon: str(fd.get("telefon")), email: str(fd.get("email")), iban: str(fd.get("iban")), bic: str(fd.get("bic")), bank: str(fd.get("bank")), ustProzent: parseNum(fd.get("ustProzent")) ?? 20, zahlungszielTage: parseNum(fd.get("zahlungszielTage")) ?? 0, angebotGueltigTage: parseNum(fd.get("angebotGueltigTage")) ?? 30, mvk: str(fd.get("mvk")), app: str(fd.get("app")) || f.app, mahnstufenTage: [parseNum(fd.get("m1")) ?? 4, parseNum(fd.get("m2")) ?? 12, parseNum(fd.get("m3")) ?? 19] };
  await setEinstellung("firma", neu);
  await audit(s, "UPDATE", "Einstellung", "firma", "Firmendaten geändert");
  revalidatePath("/einstellungen"); redirect("/einstellungen?tab=firma&ok=1");
}

export async function kostenstelleSpeichern(fd: FormData) {
  const s = await admin();
  const id = strOrNull(fd.get("id"));
  const data = { name: str(fd.get("name")), kuerzel: str(fd.get("kuerzel")).toUpperCase(), strasse: strOrNull(fd.get("strasse")), plz: strOrNull(fd.get("plz")), ort: strOrNull(fd.get("ort")), bundesland: str(fd.get("bundesland")) || "Niederösterreich", telefon: strOrNull(fd.get("telefon")), email: strOrNull(fd.get("email")), aktiv: fd.get("aktiv") !== "off", provisionUeberlassung: parseNum(fd.get("provisionUeberlassung")) ?? 20, provisionVermittlung: parseNum(fd.get("provisionVermittlung")) ?? 50 };
  if (!data.name || !data.kuerzel) redirect("/einstellungen?tab=kostenstellen&fehler=pflicht");
  const k = id ? await db.kostenstelle.update({ where: { id }, data }) : await db.kostenstelle.create({ data });
  await audit(s, id ? "UPDATE" : "CREATE", "Kostenstelle", k.id, k.name);
  revalidatePath("/einstellungen"); redirect("/einstellungen?tab=kostenstellen&ok=1");
}

export async function nutzerSpeichern(fd: FormData) {
  const s = await admin();
  const id = strOrNull(fd.get("id"));
  const rolle = str(fd.get("rolle")) as Rolle;
  const kostenstelleId = rolle === "SYSTEMADMIN" || rolle === "ZENTRALE" ? null : strOrNull(fd.get("kostenstelleId"));
  if ((rolle === "KOSTENSTELLEN_LEITUNG" || rolle === "SACHBEARBEITUNG") && !kostenstelleId) redirect("/einstellungen?tab=nutzer&fehler=kostenstelle");
  const pw = str(fd.get("passwort"));
  const data = { email: str(fd.get("email")).toLowerCase(), name: str(fd.get("name")), rolle, kostenstelleId, aktiv: fd.get("aktiv") !== "off", ...(pw ? { passwortHash: await hashPassword(pw), fehlversuche: 0, gesperrtBis: null } : {}) };
  if (!data.email || !data.name) redirect("/einstellungen?tab=nutzer&fehler=pflicht");
  if (!id && !pw) redirect("/einstellungen?tab=nutzer&fehler=passwort");
  if (fd.get("totpReset") === "on" && id) Object.assign(data, { totpSecret: null });
  // Rolle, Kostenstelle, Deaktivierung, neues Passwort oder 2FA-Rücksetzung: bestehende Anmeldungen beenden
  if (id) Object.assign(data, { sitzungenGueltigAb: new Date() });
  const n = id ? await db.nutzer.update({ where: { id }, data }) : await db.nutzer.create({ data: data as typeof data & { passwortHash: string } });
  await audit(s, id ? "UPDATE" : "CREATE", "Nutzer", n.id, `${n.email} (${n.rolle})`);
  revalidatePath("/einstellungen"); redirect("/einstellungen?tab=nutzer&ok=1");
}

export async function saetzeSpeichern(fd: FormData) {
  const s = await admin();
  const saetze: AbgabenSaetze = { ...SAETZE_2023 };
  for (const k of Object.keys(SAETZE_2023) as (keyof AbgabenSaetze)[]) { const v = parseNum(fd.get(k)); if (v != null) saetze[k] = v / 100; }
  await db.abgabenSatzSet.create({ data: { name: str(fd.get("name")) || `Sätze ab ${str(fd.get("gultigAb"))}`, gultigAb: parseDate(fd.get("gultigAb")) ?? new Date(), saetze: { ...saetze } } });
  await audit(s, "CREATE", "AbgabenSatzSet", null, "Neues Satz-Set", saetze);
  revalidatePath("/einstellungen"); redirect("/einstellungen?tab=saetze&ok=1");
}

export async function dzSpeichern(fd: FormData) {
  const s = await admin();
  const gultigAb = parseDate(fd.get("gultigAb")) ?? new Date();
  for (const k of fd.keys()) { if (k.startsWith("dz_")) { const bl = k.slice(3); const v = parseNum(fd.get(k)); if (v != null) await db.dzSatz.upsert({ where: { bundesland_gultigAb: { bundesland: bl, gultigAb } }, create: { bundesland: bl, gultigAb, satz: v / 100 }, update: { satz: v / 100 } }); } }
  await audit(s, "UPDATE", "DzSatz", null, "DZ-Sätze aktualisiert");
  revalidatePath("/einstellungen"); redirect("/einstellungen?tab=saetze&ok=1");
}

export async function kvSpeichern(fd: FormData) {
  const s = await admin();
  const kvId = strOrNull(fd.get("kvId"));
  const gruppe = ["ARBEITER", "ANGESTELLTE", "BEIDE"].includes(str(fd.get("gruppe"))) ? str(fd.get("gruppe")) : "ARBEITER";
  const kv = kvId
    ? await db.kollektivvertrag.update({ where: { id: kvId }, data: { name: str(fd.get("name")) || undefined, gultigAb: parseDate(fd.get("gultigAb")) ?? new Date(), gruppe } })
    : await db.kollektivvertrag.create({ data: { name: str(fd.get("name")), kuerzel: str(fd.get("kuerzel")) || str(fd.get("name")).slice(0, 8), gultigAb: parseDate(fd.get("gultigAb")) ?? new Date(), gruppe } });
  const bg = str(fd.get("bg"));
  if (bg) await db.kvLohnstufe.create({ data: {
    kvId: kv.id, beschaeftigungsgruppe: bg, bezeichnung: strOrNull(fd.get("bezeichnung")),
    mindestStundenlohn: parseNum(fd.get("mindestStundenlohn")), mindestMonatsbrutto: parseNum(fd.get("mindestMonatsbrutto")),
    referenzzuschlagProzent: parseNum(fd.get("referenzzuschlagProzent")),
    gultigAb: parseDate(fd.get("gultigAb")),
  } });
  await audit(s, "UPDATE", "Kollektivvertrag", kv.id, kv.name);
  revalidatePath("/einstellungen"); redirect("/einstellungen?tab=kv&ok=1");
}
/** Legt die Beschäftiger-KV (Referenzlöhne) an bzw. aktualisiert sie – metalltechnische Industrie exakt, übrige als Prüfhinweis. */
export async function referenzKvAktualisieren() {
  const s = await admin();
  const erg = await referenzKvSynchronisieren();
  await audit(s, "UPDATE", "Kollektivvertrag", "referenz", `Referenz-KV synchronisiert: ${erg.angelegt} neu, ${erg.aktualisiert} aktualisiert, ${erg.stufen} Lohnstufen`);
  revalidatePath("/einstellungen"); redirect("/einstellungen?tab=kv&ok=1");
}

/** Hebt die Feststellung „für diesen Kollektivvertrag gibt es keinen Referenzzuschlag" wieder auf. */
export async function keinZuschlagAufheben(schluessel: string) {
  const s = await admin();
  await keinZuschlagLoeschen(schluessel);
  await audit(s, "UPDATE", "Kollektivvertrag", "referenz", `Feststellung „kein Referenzzuschlag" aufgehoben: ${schluessel}`);
  revalidatePath("/einstellungen"); redirect("/einstellungen?tab=kv&ok=1");
}

export async function kvStufeLoeschen(id: string) { await admin(); await db.kvLohnstufe.delete({ where: { id } }); revalidatePath("/einstellungen"); }

export async function vorlageSpeichern(fd: FormData) {
  const s = await admin();
  const id = strOrNull(fd.get("id"));
  const data = { name: str(fd.get("name")), typ: str(fd.get("typ")) as VertragTyp, inhalt: str(fd.get("inhalt")), aktiv: fd.get("aktiv") !== "off" };
  const v = id ? await db.vertragsvorlage.update({ where: { id }, data: { ...data, version: { increment: 1 } } }) : await db.vertragsvorlage.create({ data });
  await audit(s, id ? "UPDATE" : "CREATE", "Vertragsvorlage", v.id, v.name);
  revalidatePath("/einstellungen"); redirect("/einstellungen?tab=vorlagen&ok=1");
}

export async function excelImport(fd: FormData) {
  const s = await admin();
  const file = fd.get("datei");
  const kostenstelleId = str(fd.get("kostenstelleId"));
  if (!(file instanceof File) || !file.size || !kostenstelleId) redirect("/einstellungen?tab=import&fehler=datei");
  const erg = await importiereExcel(Buffer.from(await file.arrayBuffer()), kostenstelleId, `Excel-Import ${new Date().toLocaleDateString("de-AT")}`);
  await audit(s, "IMPORT", "Excel", null, `Import ${file.name}`, erg, kostenstelleId);
  await setEinstellung("letzterImport", { datei: file.name, zeitpunkt: new Date().toISOString(), erg });
  revalidatePath("/einstellungen"); redirect("/einstellungen?tab=import&ok=1");
}

export async function demoDatenLoeschen() {
  const s = await admin();
  const kunden = await db.kunde.findMany({ where: { notizen: "Demo-Datensatz" }, select: { id: true } });
  const personen = await db.person.findMany({ where: { notizen: "Demo-Datensatz" }, select: { id: true } });
  const kIds = kunden.map((k) => k.id); const pIds = personen.map((p) => p.id);
  await db.$transaction([
    db.rechnungsposition.deleteMany({ where: { rechnung: { kundeId: { in: kIds } } } }),
    db.monatsabrechnung.deleteMany({ where: { OR: [{ kundeId: { in: kIds } }, { personId: { in: pIds } }] } }),
    db.rechnung.deleteMany({ where: { kundeId: { in: kIds } } }),
    db.angebotsposition.deleteMany({ where: { angebot: { kundeId: { in: kIds } } } }),
    db.vertrag.deleteMany({ where: { OR: [{ kundeId: { in: kIds } }, { personId: { in: pIds } }] } }),
    db.einsatz.deleteMany({ where: { OR: [{ kundeId: { in: kIds } }, { personId: { in: pIds } }] } }),
    db.angebot.deleteMany({ where: { kundeId: { in: kIds } } }),
    db.aufgabe.deleteMany({ where: { OR: [{ kundeId: { in: kIds } }, { personId: { in: pIds } }] } }),
    db.person.updateMany({ where: { hinterlegterKundeId: { in: kIds } }, data: { hinterlegterKundeId: null } }),
    db.person.deleteMany({ where: { id: { in: pIds } } }),
    db.kunde.deleteMany({ where: { id: { in: kIds } } }),
  ]);
  await audit(s, "DELETE", "Demo", null, `${kIds.length} Kunden, ${pIds.length} Personen (Demo) gelöscht`);
  revalidatePath("/"); redirect("/einstellungen?tab=import&ok=1");
}

/**
 * Bereiche endgültig leeren (nur Systemadmin).
 *
 * Sicherheitsabfrage: Es muss das Wort LÖSCHEN getippt werden. Firma, Kostenstellen, Nutzer,
 * KV-Tabellen, Zulagen und Vorlagen bleiben immer erhalten – gelöscht wird nur der laufende Bestand.
 */
export async function bestandLeeren(fd: FormData) {
  const s = await admin();
  if (str(fd.get("bestaetigung")).trim().toUpperCase().replace("OE", "Ö") !== "LÖSCHEN") redirect("/einstellungen?tab=loeschen&fehler=bestaetigung");
  const gewaehlt = BEREICHE.map((b) => b.key).filter((k) => fd.get(`b_${k}`) === "ja");
  if (!gewaehlt.length) redirect("/einstellungen?tab=loeschen&fehler=auswahl");
  const kostenstelleId = strOrNull(fd.get("kostenstelleId")) ?? undefined;

  const teile: string[] = [];
  for (const b of gewaehlt) {
    const n = await bereichLeeren(b, kostenstelleId);
    teile.push(`${BEREICHE.find((x) => x.key === b)!.label}: ${n}`);
  }
  await audit(s, "DELETE", "Bestand", null, `Bestand geleert${kostenstelleId ? " (eine Kostenstelle)" : ""} – ${teile.join(", ")}`);
  revalidatePath("/");
  redirect(`/einstellungen?tab=loeschen&geleert=${encodeURIComponent(teile.join(" · "))}`);
}

// ---- 2FA für den eigenen Account
export async function totpEinrichten(): Promise<{ secret: string; qr: string }> {
  const s = await requireSession();
  const secret = await totpGenerateSecret();
  await setEinstellung(`totp_pending_${s.nutzerId}`, { secret: encryptField(secret) });
  const uri = totpGenerateURI({ secret, issuer: "Fox & People", label: s.email });
  return { secret, qr: await QRCode.toDataURL(uri) };
}
export async function totpAktivieren(fd: FormData) {
  const s = await requireSession();
  const e = await db.einstellung.findUnique({ where: { key: `totp_pending_${s.nutzerId}` } });
  const sec = decryptField((e?.value as { secret?: string } | null)?.secret);
  if (!sec) redirect("/einstellungen?tab=konto&fehler=2fa");
  const { darfZugreifen } = await import("@/lib/bremse");
  if (!(await darfZugreifen(`totp:${s.nutzerId}`, { anzahl: 10, fensterMinuten: 15 }))) redirect("/einstellungen?tab=konto&fehler=2fa");
  const r = await totpVerify({ token: str(fd.get("code")).replace(/\s/g, ""), secret: sec });
  if (!r.valid) redirect("/einstellungen?tab=konto&fehler=2fa");
  await db.nutzer.update({ where: { id: s.nutzerId }, data: { totpSecret: encryptField(sec) } });
  await db.einstellung.delete({ where: { key: `totp_pending_${s.nutzerId}` } });
  await audit(s, "UPDATE", "Nutzer", s.nutzerId, "2FA aktiviert");
  redirect("/einstellungen?tab=konto&ok=1");
}
export async function totpDeaktivieren(fd: FormData) {
  const s = await requireSession();
  // Auch hier das Passwort verlangen – 2FA abschalten ist der erste Schritt jeder Kontoübernahme
  const n = await db.nutzer.findUniqueOrThrow({ where: { id: s.nutzerId } });
  if (!(await verifyPassword(n.passwortHash, str(fd.get("passwort"))))) redirect("/einstellungen?tab=konto&fehler=altespasswort");
  await db.nutzer.update({ where: { id: s.nutzerId }, data: { totpSecret: null } });
  await audit(s, "UPDATE", "Nutzer", s.nutzerId, "2FA deaktiviert");
  redirect("/einstellungen?tab=konto&ok=1");
}
export async function passwortAendern(fd: FormData) {
  const s = await requireSession();
  const pw = str(fd.get("passwort"));
  if (pw.length < 10) redirect("/einstellungen?tab=konto&fehler=passwort");
  // Altes Passwort verlangen: sonst reicht ein unbeaufsichtigter Bildschirm, um das Konto dauerhaft
  // zu übernehmen – neues Passwort setzen, 2FA abschalten, den echten Nutzer aussperren.
  const n = await db.nutzer.findUniqueOrThrow({ where: { id: s.nutzerId } });
  if (!(await verifyPassword(n.passwortHash, str(fd.get("altesPasswort"))))) redirect("/einstellungen?tab=konto&fehler=altespasswort");
  await db.nutzer.update({ where: { id: s.nutzerId }, data: { passwortHash: await hashPassword(pw), sitzungenGueltigAb: new Date() } });
  // Alle bisherigen Anmeldungen werden ungültig (auch auf anderen Geräten); die eigene wird neu ausgestellt
  await new Promise((r) => setTimeout(r, 1100)); // Sekundengenauigkeit des Zeitstempels im Zugang
  await createSession({ ...s, totpPending: false });
  await audit(s, "UPDATE", "Nutzer", s.nutzerId, "Passwort geändert – alle anderen Anmeldungen beendet");
  redirect("/einstellungen?tab=konto&ok=1");
}

/** Zulagen-Stammdaten */
export async function zulageSpeichern(fd: FormData) {
  const s = await admin();
  const id = strOrNull(fd.get("id"));
  const data = { name: str(fd.get("name")), kuerzel: str(fd.get("kuerzel")).toUpperCase().replace(/\s+/g, "_"), art: str(fd.get("art")) as ZulageArt, wert: parseNum(fd.get("wert")) ?? 0, weiterverrechnen: fd.get("weiterverrechnen") === "on", steuerfrei: fd.get("steuerfrei") === "on", beschreibung: strOrNull(fd.get("beschreibung")), aktiv: fd.get("aktiv") !== "off", reihenfolge: parseNum(fd.get("reihenfolge")) ?? 0, kvId: strOrNull(fd.get("kvId")), schichtmodelle: fd.getAll("schichtmodelle").map(String) };
  if (!data.name || !data.kuerzel) redirect("/einstellungen?tab=zulagen&fehler=pflicht");
  const z = id ? await db.zulage.update({ where: { id }, data }) : await db.zulage.create({ data });
  await audit(s, id ? "UPDATE" : "CREATE", "Zulage", z.id, `${z.name} (${z.kuerzel})`);
  revalidatePath("/einstellungen"); redirect("/einstellungen?tab=zulagen&ok=1");
}
export async function zulageLoeschen(id: string) {
  const s = await admin();
  const z = await db.zulage.delete({ where: { id } });
  await audit(s, "DELETE", "Zulage", id, z.name);
  revalidatePath("/einstellungen"); redirect("/einstellungen?tab=zulagen&ok=1");
}
export async function zulagenStandardAnlegen() {
  const s = await admin();
  for (const [i, z] of ZULAGEN_DEFAULT.entries()) await db.zulage.upsert({ where: { kuerzel: z.kuerzel }, update: {}, create: { ...z, reihenfolge: i, beschreibung: "Referenzwert – bitte mit KV/Lohnverrechnung abgleichen" } });
  await audit(s, "CREATE", "Zulage", "standard", "Standard-Zulagen angelegt");
  revalidatePath("/einstellungen"); redirect("/einstellungen?tab=zulagen&ok=1");
}

/** Fristentabelle (Kündigungsfristen, Probezeit, Behaltefrist) */
export async function fristenSpeichern(fd: FormData) {
  const s = await admin();
  const lese = (prefix: string): Fristenstufe[] => {
    const out: Fristenstufe[] = [];
    for (let i = 0; i < 6; i++) {
      const ab = parseNum(fd.get(`${prefix}_ab_${i}`)); const n = parseNum(fd.get(`${prefix}_n_${i}`)); const einheit = str(fd.get(`${prefix}_e_${i}`)); const termin = str(fd.get(`${prefix}_t_${i}`)) as Termin;
      if (ab == null || !n) continue;
      out.push({ abJahren: ab, frist: einheit === "monate" ? { monate: n } : einheit === "wochen" ? { wochen: n } : { tage: n }, termin: termin || "TAG" });
    }
    return out.length ? out : FRISTEN_DEFAULT[prefix as keyof Pick<Fristentabelle, "arbeiterDienstgeber" | "arbeiterDienstnehmer" | "angestellteDienstgeber" | "angestellteDienstnehmer">];
  };
  const t: Fristentabelle = { arbeiterDienstgeber: lese("arbeiterDienstgeber"), arbeiterDienstnehmer: lese("arbeiterDienstnehmer"), angestellteDienstgeber: lese("angestellteDienstgeber"), angestellteDienstnehmer: lese("angestellteDienstnehmer"), probezeitTage: parseNum(fd.get("probezeitTage")) ?? 30, behaltefristMonate: parseNum(fd.get("behaltefristMonate")) ?? 3, hinweis: str(fd.get("hinweis")) || FRISTEN_DEFAULT.hinweis };
  await setEinstellung("fristen", t);
  await audit(s, "UPDATE", "Einstellung", "fristen", "Fristentabelle geändert");
  revalidatePath("/einstellungen"); redirect("/einstellungen?tab=fristen&ok=1");
}

/** Testmail an den angemeldeten Admin – prüft SMTP-Konfiguration */
export async function testmailSenden() {
  const s = await admin();
  const { sendeMail } = await import("@/lib/mail");
  const r = await sendeMail({ an: s.email, betreff: "Testmail – Fox & People Software", text: `Hallo ${s.name},\n\nwenn du diese Mail liest, ist der Versand eingerichtet.\nModus: ${process.env.MAIL_MODE ?? "test"} · Server: ${process.env.SMTP_HOST ?? "–"}`, referenzTyp: "Test" });
  await audit(s, "SEND", "Einstellung", "testmail", `Testmail ${r.status}${r.fehler ? `: ${r.fehler}` : ""}`);
  revalidatePath("/einstellungen");
  redirect(`/einstellungen?tab=import&testmail=${r.status}${r.fehler ? `&fehler=${encodeURIComponent(r.fehler)}` : ""}`);
}


/** Nummernkreis anpassen (Format / zuletzt vergebene Nummer) – z. B. nach gelöschten Testrechnungen wieder bei 2026008 starten. */
export async function nummernkreisSpeichern(id: string, fd: FormData) {
  const s = await admin();
  const nk = await db.nummernkreis.findUnique({ where: { id } });
  if (!nk) redirect("/einstellungen?tab=firma");
  const letzteNummer = Math.max(0, Math.floor(parseNum(fd.get("letzteNummer")) ?? nk.letzteNummer));
  const format = str(fd.get("format")) || nk.format;
  await db.nummernkreis.update({ where: { id }, data: { letzteNummer, format } });
  await audit(s, "UPDATE", "Nummernkreis", id, `${nk.typ} ${nk.jahr}: ${nk.letzteNummer} → ${letzteNummer}, Format ${format}`, undefined, nk.kostenstelleId);
  revalidatePath("/einstellungen"); redirect("/einstellungen?tab=firma&ok=1");
}
