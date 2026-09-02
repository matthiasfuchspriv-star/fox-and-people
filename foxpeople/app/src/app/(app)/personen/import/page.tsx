import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession, istZentrale, darfKostenstelle, darfSensibel } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, Card, Field, Badge } from "@/components/ui";
import { leseDokument } from "@/lib/storage";
import { leseTabelle, vorschlagZuordnung, vorschau, felderFuer, type Art } from "@/lib/import-bewerber";
import { dateiHochladen, importAusfuehren } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Bewerber aus einer beliebigen Excel- oder CSV-Liste übernehmen – AMS-Liste, Jobmesse, andere Software.
 * Drei Schritte auf einer Seite: Datei wählen, Spalten zuordnen (mit Vorschlag), Vorschau und Import.
 */
export default async function BewerberImport({ searchParams }: { searchParams: Promise<{ datei?: string; art?: string; fehler?: string; neu?: string; uebersprungen?: string; gefiltert?: string; fehlerzahl?: string; nurAb?: string }> }) {
  const s = await requireSession();
  if (!darfSensibel(s)) redirect("/personen?fehler=berechtigung");
  const sp = await searchParams;
  const art: Art = sp.art === "MITARBEITER" ? "MITARBEITER" : "BEWERBER";
  // Datumsfilter kommt über die Adresszeile, damit die Vorschau ihn sofort mitrechnet
  const nurAb = sp.nurAb && /^\d{4}-\d{2}-\d{2}$/.test(sp.nurAb) ? new Date(`${sp.nurAb}T00:00:00Z`) : null;
  const mitarbeiter = art === "MITARBEITER";
  const kostenstellen = istZentrale(s) ? await db.kostenstelle.findMany({ where: { aktiv: true }, orderBy: { isZentrale: "desc" } }) : null;

  // Nur eigene Import-Dateien: ohne diese Prüfung könnte man über ?datei=<fremde-id> jede beliebige
  // Datei im System einlesen und ihren Inhalt in der Vorschau mitlesen.
  const doc = sp.datei
    ? await db.dokument.findUnique({ where: { id: sp.datei } }).then((d) =>
        d && d.kategorie === "Import" && darfKostenstelle(s, d.kostenstelleId) ? d : null)
    : null;
  let tabelle = null, zuordnung = null, zeigen = null, fehlerText: string | null = null;
  if (doc) {
    try {
      tabelle = await leseTabelle(Buffer.from(await leseDokument(doc.speicherpfad)), doc.dateiname);
      zuordnung = vorschlagZuordnung(tabelle.spalten, art);
      zeigen = await vorschau(tabelle, zuordnung, doc.kostenstelleId, nurAb);
    } catch (e) {
      fehlerText = e instanceof Error ? e.message : "Die Datei konnte nicht gelesen werden.";
    }
  }

  const neu = Number(sp.neu ?? 0);
  const zahl = (a: number, ein: string, mehr: string) => `${a} ${a === 1 ? ein : mehr}`;

  return (
    <>
      <PageHeader
        title={mitarbeiter ? "Mitarbeiter aus einer Liste übernehmen" : "Bewerber aus einer Liste übernehmen"}
        sub="Excel oder CSV – egal welche Spalten. Du ordnest sie einmal zu, den Rest macht das Programm."
        crumbs={[{ href: "/personen", label: "Bewerber & Mitarbeiter" }, { label: "Importieren" }]}
      />

      {sp.neu != null && (
        <div className={`alert ${neu > 0 ? "alert-teal" : "alert-amber"} mb-4`}>
          <span>
            {neu} {mitarbeiter ? "Mitarbeiter" : "Bewerber"} übernommen
            {Number(sp.uebersprungen ?? 0) > 0 && `, ${sp.uebersprungen} übersprungen (Dubletten oder ohne Namen)`}
            {Number(sp.gefiltert ?? 0) > 0 && `, ${sp.gefiltert} wegen des Datumsfilters ausgelassen`}
            {sp.fehlerzahl && ` – ${sp.fehlerzahl} Zeilen mit Fehlern`}.
            {neu > 0 && <> <Link href={mitarbeiter ? "/personen?bereich=mitarbeiter" : "/personen?bereich=bewerber"} className="font-semibold underline">{mitarbeiter ? "Zu den Mitarbeitern" : "Zum Bewerber-Pool"}</Link></>}
          </span>
        </div>
      )}
      {sp.fehler === "datei" && <div className="alert alert-red mb-4">Die Datei ist nicht (mehr) verfügbar. Bitte neu hochladen.</div>}
      {sp.fehler === "format" && <div className="alert alert-red mb-4">Es gehen nur Excel-Dateien (.xlsx) und CSV-Dateien (.csv).</div>}
      {sp.fehler === "dateityp" && <div className="alert alert-red mb-4">Dieser Dateityp ist nicht erlaubt. Speichere die Liste in Excel als .xlsx oder .csv.</div>}
      {sp.fehler === "name" && <div className="alert alert-red mb-4">Ordne mindestens eine Spalte dem Nachnamen zu – ohne Namen geht es nicht.</div>}
      {fehlerText && <div className="alert alert-red mb-4">{fehlerText}</div>}

      {/* Schritt 1 */}
      <Card title="1. Datei auswählen" className="mb-4">
        <form action={dateiHochladen} className="flex flex-wrap items-end gap-3">
          <Field label="Die Liste enthält" help="Bestimmt, welche Spalten zugeordnet werden können." className="min-w-[220px]">
            <select name="art" defaultValue={art} className="select">
              <option value="BEWERBER">Bewerber (Pool, Status „sucht“)</option>
              <option value="MITARBEITER">Mitarbeiter (Stammdaten, Status „vermittelt“)</option>
            </select>
          </Field>
          <Field label="Excel- oder CSV-Datei" help="Die erste Zeile mit Überschriften wird automatisch erkannt – Titelzeilen darüber stören nicht." className="flex-1 min-w-[260px]">
            <input type="file" name="datei" accept=".xlsx,.csv" required className="input" />
          </Field>
          {kostenstellen && (
            <Field label="Kostenstelle">
              <select name="kostenstelleId" defaultValue={s.aktiveKostenstelleId ?? ""} className="select">
                {kostenstellen.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            </Field>
          )}
          <button className="btn btn-primary">Datei einlesen</button>
        </form>
        {mitarbeiter && <p className="help mt-3">Als Mitarbeiter kommen zusätzlich SVNR, Staatsangehörigkeit, Geschlecht, Ein- und Austritt, Stundenlohn, Wochenstunden, Beschäftigungsgruppe und Notfallkontakt dazu. Die SVNR wird verschlüsselt abgelegt, sichtbar bleibt nur die letzte Vierergruppe. Steht ein Austrittsdatum in der Vergangenheit, wird die Person gleich als „ausgeschieden“ angelegt.</p>}
        <p className="help mt-3">
          Die Liste bleibt unverändert – es wird nichts zurückgeschrieben. Übernommen werden nur Personen, die es noch nicht gibt;
          erkannt wird das an Telefonnummer, E-Mail oder Name und Geburtsdatum.
        </p>
      </Card>

      {/* Schritt 2 und 3 */}
      {tabelle && zuordnung && zeigen && doc && (
        <Card title="3. Nur neuere Bewerbungen übernehmen (freiwillig)" className="mb-4">
          <p className="text-[14px] text-muted mb-3">
            Bei gewachsenen Listen steckt die halbe Datei in alten Karteileichen. Trag ein Datum ein, dann kommen nur
            Zeilen mit einem Bewerbungsdatum ab diesem Tag in den Pool. Voraussetzung: Die Spalte „Beworben am" ist oben
            zugeordnet. Ohne Datum wird alles übernommen.
          </p>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="datei" value={doc.id} />
            <input type="hidden" name="art" value={art} />
            <Field label="Nur Bewerbungen ab" className="max-w-[190px]">
              <input type="date" name="nurAb" defaultValue={sp.nurAb ?? ""} className="input" />
            </Field>
            <button className="btn btn-secondary mb-[2px]">Vorschau aktualisieren</button>
            {nurAb && <Link href={`/personen/import?datei=${doc.id}&art=${art}`} className="btn btn-ghost mb-[2px]">Filter entfernen</Link>}
          </form>
        </Card>
      )}

      {tabelle && zuordnung && zeigen && doc && (
        <form action={importAusfuehren}>
          <input type="hidden" name="datei" value={doc.id} />
          <input type="hidden" name="art" value={art} />

          <Card title={`2. Spalten zuordnen – ${doc.dateiname}, ${zahl(tabelle.zeilen.length, "Zeile", "Zeilen")}`} className="mb-4">
            <p className="text-[14px] text-muted mb-3">
              Der Vorschlag kommt aus den Überschriften deiner Datei. Prüf ihn kurz und ändere, was nicht passt. Alles, was du auf
              „– nicht übernehmen –" stellst, bleibt draußen.
            </p>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {felderFuer(art).map((f) => (
                <Field key={f.key} label={f.label} required={f.pflicht}>
                  <select name={`z_${f.key}`} defaultValue={zuordnung[f.key] ?? -1} className="select">
                    <option value={-1}>– nicht übernehmen –</option>
                    {tabelle.spalten.map((sp2, i) => <option key={i} value={i}>{sp2}</option>)}
                  </select>
                </Field>
              ))}
            </div>
            <div className="mt-4 max-w-md">
              <Field label="Quelle" help="Steht danach bei jedem Bewerber im Akt und im Controlling unter „Recruiting & Bindung“.">
                <input name="quelle" defaultValue={`Import ${doc.dateiname.replace(/\.(xlsx|csv)$/i, "")}`} className="input" />
              </Field>
            </div>
          </Card>

          <input type="hidden" name="nurAb" value={sp.nurAb ?? ""} />

          <Card title="4. Vorschau" className="mb-4" pad={false}>
            <div className="px-5 pt-4 text-[14px]">
              <b>{zeigen.filter((v) => v.status === "NEU").length}</b> werden übernommen,{" "}
              <b>{zeigen.filter((v) => v.status === "DUBLETTE").length}</b> gibt es schon oder stehen doppelt in der Datei,{" "}
              <b>{zeigen.filter((v) => v.status === "FEHLT").length}</b> haben keinen Namen{nurAb ? <>, <b>{zeigen.filter((v) => v.status === "ALT").length}</b> fallen unter den Datumsfilter</> : null}.
              <span className="text-muted"> Die Vorschau zeigt die ersten 25 Zeilen{nurAb ? ", die der Filter durchlässt" : ""}.</span>
            </div>
            <div className="overflow-x-auto mt-2">
              <table className="table">
                <thead><tr><th>Zeile</th><th>Nachname</th><th>Vorname</th><th>Telefon</th><th>E-Mail</th><th>Ort</th><th>Beruf</th><th>Status</th></tr></thead>
                <tbody>
                  {zeigen.filter((v) => !nurAb || v.status !== "ALT").slice(0, 25).map((v) => (
                    <tr key={v.zeile}>
                      <td className="text-muted">{v.zeile}</td>
                      <td className="font-semibold">{v.nachname || <span className="text-red">–</span>}</td>
                      <td>{v.vorname}</td><td>{v.telefon}</td><td>{v.email}</td><td>{v.ort}</td><td>{v.rolle}</td>
                      <td>{v.status === "NEU" ? <Badge tone="teal">wird übernommen</Badge> : v.status === "DUBLETTE" ? <Badge tone="grey">{v.hinweis}</Badge> : v.status === "ALT" ? <Badge tone="amber">{v.hinweis}</Badge> : <Badge tone="red">{v.hinweis}</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-4 border-t border-line flex items-center gap-3">
              <button className="btn btn-primary">{mitarbeiter ? "Als Mitarbeiter übernehmen" : "Jetzt übernehmen"}</button>
              <Link href="/personen/import" className="btn btn-secondary">Andere Datei</Link>
              <span className="help">Bestehende Personen werden nie überschrieben – deine Akten bleiben, wie sie sind.</span>
            </div>
          </Card>
        </form>
      )}
    </>
  );
}
