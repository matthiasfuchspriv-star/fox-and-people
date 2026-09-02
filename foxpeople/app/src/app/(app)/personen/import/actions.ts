"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession, zielKostenstelle, darfKostenstelle, darfSensibel } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { str, strOrNull, parseDate } from "@/lib/format";
import { speichereDokument, leseDokument } from "@/lib/storage";
import { leseTabelle, importiereBewerber, felderFuer, type Zuordnung, type Zielfeld, type Art } from "@/lib/import-bewerber";

/** „Bewerber“ oder „Mitarbeiter“ – alles andere wird auf Bewerber zurückgesetzt. */
const leseArt = (v: FormDataEntryValue | null): Art => (str(v) === "MITARBEITER" ? "MITARBEITER" : "BEWERBER");

/** Schritt 1: Datei hochladen. Sie wird abgelegt, damit die Zuordnung im nächsten Schritt darauf zugreift. */
export async function dateiHochladen(fd: FormData) {
  const s = await requireSession();
  if (!darfSensibel(s)) redirect("/personen?fehler=berechtigung");
  const kostenstelleId = zielKostenstelle(s, strOrNull(fd.get("kostenstelleId")));
  const datei = fd.get("datei");
  if (!(datei instanceof File) || !datei.size) redirect("/personen/import?fehler=datei");
  if (!/\.(xlsx|csv)$/i.test(datei.name)) redirect("/personen/import?fehler=format");
  const art = leseArt(fd.get("art"));

  const doc = await speichereDokument({
    kostenstelleId,
    dateiname: datei.name,
    mime: /\.csv$/i.test(datei.name) ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    inhalt: Buffer.from(await datei.arrayBuffer()),
    kategorie: "Import",
    hochgeladenVon: s.name,
    fehlerZiel: "/personen/import",
  });
  redirect(`/personen/import?datei=${doc.id}&art=${art}`);
}

/** Schritt 3: mit der bestätigten Zuordnung wirklich importieren. */
export async function importAusfuehren(fd: FormData) {
  const s = await requireSession();
  if (!darfSensibel(s)) redirect("/personen?fehler=berechtigung");
  const docId = str(fd.get("datei"));
  const doc = await db.dokument.findUnique({ where: { id: docId } });
  // Nur eigene Import-Dateien – und importiert wird immer in die eigene Kostenstelle, nie in die der Datei
  if (!doc || doc.kategorie !== "Import" || !darfKostenstelle(s, doc.kostenstelleId)) redirect("/personen/import?fehler=datei");

  const art = leseArt(fd.get("art"));
  const t = await leseTabelle(Buffer.from(await leseDokument(doc.speicherpfad)), doc.dateiname);
  const z: Zuordnung = {};
  // Nur Felder, die es für diese Art überhaupt gibt – sonst käme über ein nachgebautes Formular
  // ein Stundenlohn in eine Bewerberliste.
  for (const feld of felderFuer(art)) {
    const v = Number(fd.get(`z_${feld.key}`));
    if (Number.isInteger(v) && v >= 0 && v < t.spalten.length) z[feld.key as Zielfeld] = v;
  }
  if (z.nachname == null && z.name == null) redirect(`/personen/import?datei=${docId}&art=${art}&fehler=name`);

  const quelle = str(fd.get("quelle")) || `Import ${doc.dateiname}`;
  const nurAb = parseDate(fd.get("nurAb"));
  const bericht = await importiereBewerber(t, z, { kostenstelleId: zielKostenstelle(s, doc.kostenstelleId), quelle, art, nurAb });

  await audit(s, "IMPORT", "Person", docId, `${art === "MITARBEITER" ? "Mitarbeiter" : "Bewerber"}-Import ${doc.dateiname}: ${bericht.neu} neu, ${bericht.uebersprungen} übersprungen${bericht.gefiltert ? `, ${bericht.gefiltert} wegen Datumsfilter ausgelassen` : ""}`, undefined, doc.kostenstelleId);
  revalidatePath("/personen");
  redirect(`/personen/import?datei=${docId}&art=${art}&neu=${bericht.neu}&uebersprungen=${bericht.uebersprungen}${bericht.gefiltert ? `&gefiltert=${bericht.gefiltert}` : ""}${bericht.fehler.length ? `&fehlerzahl=${bericht.fehler.length}` : ""}`);
}
