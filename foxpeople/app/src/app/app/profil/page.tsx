import { requireApp } from "@/lib/app-auth";
import { db } from "@/lib/db";
import { datum } from "@/lib/format";
import { AppShell, appMetadata, appViewport } from "../shell";
import { AppKopf } from "../kopf";
import { profilSpeichern, dokumentHochladenApp, datenschutzBestaetigen } from "../actions";
import { PushKnopf } from "../push/knopf";
import { DATENSCHUTZ_VERSION, DATENSCHUTZ_TEXT } from "@/lib/datenschutz";
import { SPRACHEN } from "@/lib/i18n";

export const metadata = appMetadata; export const viewport = appViewport; export const dynamic = "force-dynamic";
const KATEGORIEN = ["Foto", "Ausweis", "e-card", "Meldezettel", "Führerschein", "Staplerschein", "Kranschein", "Aufenthaltstitel / Arbeitserlaubnis", "Sicherheitsunterweisung", "Gesundheitszeugnis", "Qualifikationsnachweis", "Sonstiges"];

/** Profil: Kontaktdaten prüfen/ändern, Foto und Nachweise hochladen. Stammdaten wie SVNR/Bank ändert nur das Büro. */
export default async function AppProfil({ searchParams }: { searchParams: Promise<{ ok?: string; fehler?: string }> }) {
  const s = await requireApp();
  const sp = await searchParams;
  const p = await db.person.findUnique({ where: { id: s.personId }, include: { kostenstelle: { select: { name: true } }, kv: { select: { name: true } } } });
  if (!p) return null;
  const felder = [p.telefon, p.email, p.strasse, p.plz, p.ort, p.geburtsdatum, p.notfallkontakt, p.fotoDokumentId];
  const vollst = Math.round((felder.filter(Boolean).length / felder.length) * 100);
  return (
    <AppShell>
      <AppKopf titel="Mein Profil" zurueck="/app" rechts={<a href="/app/logout" className="text-[14px] font-medium text-fox-ink px-2 py-2">Abmelden</a>} />
      <div className="px-4 pt-4 space-y-4">
        {sp.ok === "1" && <div className="alert alert-teal"><span>Danke – deine Daten sind aktualisiert.</span></div>}
        {sp.ok === "upload" && <div className="alert alert-teal"><span>Hochgeladen – die Dispo prüft das Dokument.</span></div>}
        {sp.fehler === "gross" && <div className="alert alert-red"><span>Datei zu groß (max. 15 MB).</span></div>}
        {sp.fehler === "datei" && <div className="alert alert-red"><span>Bitte eine Datei auswählen.</span></div>}
        <section className="card card-pad flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-surface-2 overflow-hidden flex items-center justify-center font-display font-bold text-[20px] shrink-0">{p.fotoDokumentId ? <img src={`/dokumente/${p.fotoDokumentId}`} alt="" className="w-full h-full object-cover" /> : `${p.vorname[0]}${p.nachname[0]}`}</div>
          <div className="flex-1 min-w-0">
            <div className="font-display font-bold text-[17px]">{p.vorname} {p.nachname}</div>
            <div className="text-[12.5px] text-muted">{p.standardrolle ?? ""} · {p.kostenstelle.name}</div>
            <div className="mt-1.5 h-1.5 bg-surface-2 rounded"><div className="h-1.5 bg-teal rounded" style={{ width: `${vollst}%` }} /></div>
            <div className="text-[11.5px] text-muted mt-0.5">Profil zu {vollst} % vollständig</div>
          </div>
        </section>

        <section className="card card-pad space-y-3">
          <div className="section-title">Benachrichtigungen</div>
          <p className="text-[13px] text-muted">Wir sagen dir Bescheid, wenn deine Stunden bestätigt sind, eine Nachricht da ist, dein Urlaub genehmigt wurde oder ein neuer Lohnzettel bereitliegt. Kein Werbe-Spam.</p>
          <PushKnopf />
        </section>

        {!p.datenschutzAkzeptiertAm && (
          <form action={datenschutzBestaetigen} className="card card-pad space-y-3 border-2 border-fox">
            <div className="section-title">Datenschutz – bitte einmal lesen</div>
            <div className="text-[13px] whitespace-pre-line max-h-56 overflow-y-auto rounded-md bg-surface-2 p-3">{DATENSCHUTZ_TEXT}</div>
            <label className="flex items-start gap-2 text-[13.5px]"><input type="checkbox" name="ok" required className="mt-0.5" /> Ich habe die Datenschutzinformation gelesen und bin einverstanden.</label>
            <label className="flex items-start gap-2 text-[13.5px]"><input type="checkbox" name="foto" className="mt-0.5" /> Mein Foto darf im Profil verwendet werden, das Fox &amp; People an Kunden schickt (freiwillig, jederzeit widerrufbar).</label>
            <button className="btn btn-primary w-full justify-center">Bestätigen</button>
            <p className="help">Fassung {DATENSCHUTZ_VERSION}</p>
          </form>
        )}

        <form action={profilSpeichern} className="card card-pad space-y-3">
          <div className="section-title">Kontaktdaten</div>
          <div className="field"><label className="label">Telefon</label><input name="telefon" defaultValue={p.telefon ?? ""} inputMode="tel" className="input" /></div>
          <div className="field"><label className="label">E-Mail</label><input name="email" type="email" defaultValue={p.email ?? ""} className="input" /></div>
          <div className="field"><label className="label">Straße / Nr.</label><input name="strasse" defaultValue={p.strasse ?? ""} className="input" /></div>
          <div className="grid grid-cols-3 gap-2"><div className="field"><label className="label">PLZ</label><input name="plz" defaultValue={p.plz ?? ""} inputMode="numeric" className="input" /></div><div className="field col-span-2"><label className="label">Ort</label><input name="ort" defaultValue={p.ort ?? ""} className="input" /></div></div>
          <div className="field"><label className="label">Notfallkontakt (Name, Telefon)</label><input name="notfallkontakt" defaultValue={p.notfallkontakt ?? ""} className="input" placeholder="z. B. Maria Muster, 0664 …" /></div>
          <label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" name="fuehrerschein" defaultChecked={p.fuehrerschein} /> Führerschein & Auto vorhanden</label>
          <div className="field"><label className="label">Wie weit würdest du maximal pendeln? (km)</label><input name="maxPendelKm" defaultValue={p.maxPendelKm ?? ""} inputMode="numeric" className="input" /></div>
          <button className="btn btn-primary w-full justify-center">{p.profilBestaetigtAm ? "Änderungen speichern" : "Daten bestätigen"}</button>
          <div className="field"><label className="label">Sprache / Language</label><select name="appSprache" defaultValue={p.appSprache} className="select">{SPRACHEN.map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}</select><span className="help">Die App wechselt sofort in die gewählte Sprache.</span></div>
          <p className="help">Zuletzt bestätigt: {p.profilBestaetigtAm ? datum(p.profilBestaetigtAm) : "noch nie"}. Änderungen an Name, Geburtsdatum, SVNR oder Bankverbindung bitte im Chat oder telefonisch – die brauchen einen Nachweis.</p>
        </form>

        <form action={dokumentHochladenApp} className="card card-pad space-y-3">
          <div className="section-title">Dokument hochladen</div>
          <div className="field"><label className="label">Was lädst du hoch?</label><select name="kategorie" className="select">{KATEGORIEN.map((k) => <option key={k}>{k}</option>)}</select></div>
          <div className="field"><label className="label">Gültig bis (bei Führerschein, Aufenthaltstitel …)</label><input type="date" name="gultigBis" className="input" /></div>
          <div className="field"><label className="label">Datei oder Foto</label><input type="file" name="datei" required accept="image/*,application/pdf" className="input" /></div>
          <button className="btn btn-secondary w-full justify-center">Hochladen</button>
          <p className="help">Fotos bitte gut lesbar, alle vier Ecken sichtbar. Die Dispo prüft jedes Dokument, danach erscheint es unter „Meine Unterlagen“.</p>
        </form>

        <section className="card card-pad text-[13px] space-y-1">
          <div className="section-title mb-1">Deine Stammdaten (nur lesen)</div>
          <div className="flex justify-between"><span className="text-muted">Geburtsdatum</span><span>{p.geburtsdatum ? datum(p.geburtsdatum) : "–"}</span></div>
          <div className="flex justify-between"><span className="text-muted">Eintritt</span><span>{p.eintrittsdatum ? datum(p.eintrittsdatum) : "–"}</span></div>
          <div className="flex justify-between"><span className="text-muted">Kollektivvertrag</span><span>{p.kv?.name ?? "KV Arbeitskräfteüberlassung"}</span></div>
          <div className="flex justify-between"><span className="text-muted">Wochenstunden</span><span>{p.wochenstunden ?? "–"}</span></div>
          <div className="flex justify-between"><span className="text-muted">Urlaubsanspruch</span><span>{p.urlaubsanspruchTage} Werktage / Jahr ({(p.urlaubsanspruchTage / 12).toLocaleString("de-AT", { maximumFractionDigits: 4 })} je Arbeitsmonat)</span></div>
          <div className="flex justify-between"><span className="text-muted">SVNR</span><span>····{p.svnrLast4 ?? ""}</span></div>
        </section>
        <p className="text-[11.5px] text-muted pb-4">Datenschutz: Deine Daten werden ausschließlich für das Dienstverhältnis verwendet (Datenschutzinformation für Mitarbeiter). Löschung oder Auskunft: office@foxandpeople.at</p>
      </div>
    </AppShell>
  );
}
