import { Card, Field } from "@/components/ui";
import { isoDate } from "@/lib/format";
import { PlzOrt } from "@/components/plz-ort";

type K = Partial<{ id: string; firmenname: string; kundennummer: string | null; kurzname: string | null; strasse: string | null; plz: string | null; ort: string | null; land: string; bundesland: string | null; uid: string | null; telefon: string | null; email: string | null; rechnungsemail: string | null; rechnungCcEmail: string | null; website: string | null; zahlungszielTage: number; skontoProzent: number | null; anredeDu: boolean; stundennachweisVomKunden: boolean; notizen: string | null; rahmenvertragBeginn: Date | null; rahmenvertragEnde: Date | null; kuendigungsfrist: string | null; erinnerungTageVorher: number; status: string; kostenstelleId: string; arbeitszeitmodell: string | null; kollektivvertrag: string | null; referenzKvId: string | null; referenzKvAngestellteId: string | null; kvGueltigBis: Date | null; rahmenvertragPflicht: boolean; agbVersion: string | null; agbAkzeptiertAm: Date | null; agbAkzeptiertVon: string | null; uebernahmeProzent: number; uebernahmeMindest: number; vermittlungProzent: number; uidGeprueftAm: Date | null; uidGeprueftStufe: string | null; uidGueltig: boolean | null; anforderungen: string | null; erforderlicheQualifikationen: unknown }>;

export function KundeForm({ k, kostenstellen, referenzKvs = [], action }: { k: K; kostenstellen: { id: string; name: string }[] | null; referenzKvs?: { id: string; name: string; kuerzel: string; referenzzuschlagPruefen: boolean; gruppe: string }[]; action: (fd: FormData) => Promise<void> }) {
  const neu = !k.id;
  return (
    <form action={action} className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Card title="Firma" className="reveal">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Firmenname" required className="sm:col-span-2"><input name="firmenname" defaultValue={k.firmenname ?? ""} required className="input" /></Field>
            <Field label="Kurzname"><input name="kurzname" defaultValue={k.kurzname ?? ""} className="input" /></Field>
            {!neu && <Field label="Kundennummer" help="Wird automatisch vergeben und steht auf jeder Rechnung."><input value={k.kundennummer ?? "– wird vergeben –"} readOnly className="input num bg-surface-2" /></Field>}
            <Field label="UID" required><input name="uid" required pattern="[A-Za-z]{2}[A-Za-z0-9 ]{2,14}" title="z. B. ATU12345678" defaultValue={k.uid ?? ""} className="input" placeholder="ATU12345678" /></Field>
            <Field label="Straße / Nr." required className="sm:col-span-2"><input name="strasse" required defaultValue={k.strasse ?? ""} className="input" /></Field>
            <PlzOrt plzWert={k.plz} ortWert={k.ort} />
            <Field label="Land"><input name="land" defaultValue={k.land ?? "Österreich"} className="input" /></Field>
            <Field label="Bundesland des Beschäftigers" help="Für die AÜG-Überlassungsstatistik; leer = aus PLZ geschätzt."><select name="bundesland" defaultValue={k.bundesland ?? ""} className="select"><option value="">– (aus PLZ)</option>{["Wien", "Niederösterreich", "Oberösterreich", "Salzburg", "Tirol", "Vorarlberg", "Steiermark", "Kärnten", "Burgenland"].map((b) => <option key={b}>{b}</option>)}</select></Field>
            <Field label="Website"><input name="website" defaultValue={k.website ?? ""} className="input" /></Field>
            <Field label="Telefon"><input name="telefon" defaultValue={k.telefon ?? ""} className="input" /></Field>
            <Field label="E-Mail"><input type="email" name="email" defaultValue={k.email ?? ""} className="input" /></Field>
            <Field label="Rechnungs-E-Mail" required help="Dorthin gehen Rechnungen & Zahlungserinnerungen."><input type="email" name="rechnungsemail" required defaultValue={k.rechnungsemail ?? ""} className="input" /></Field>
            <Field label="Rechnungen in Kopf (CC)" help="Zweite Adresse, die jede Rechnung und Zahlungserinnerung mitbekommt – Buchhaltung des Kunden, Steuerberater oder die eigene Ablage. Mehrere Adressen mit Komma trennen."><input type="text" name="rechnungCcEmail" defaultValue={k.rechnungCcEmail ?? ""} className="input" placeholder="buchhaltung@kunde.at, ablage@foxandpeople.at" /></Field>
          </div>
        </Card>
        {neu && (
          <Card title="Hauptansprechpartner" className="reveal reveal-2">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Name" required><input name="ap_name" required className="input" /></Field>
              <Field label="Funktion" required><input name="ap_funktion" required className="input" placeholder="z. B. Produktionsleitung" /></Field>
              <Field label="Telefon" required><input name="ap_telefon" required className="input" /></Field>
              <Field label="E-Mail" required><input type="email" name="ap_email" required className="input" /></Field>
            </div>
          </Card>
        )}
        <Card title="Einsatzbedingungen (Pflicht)" className="reveal reveal-3">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Arbeitszeitmodell" required help="Normalarbeitszeit & Schichtform beim Beschäftiger – Basis für Sollstunden und Überlassungsmitteilung."><input name="arbeitszeitmodell" required defaultValue={k.arbeitszeitmodell ?? ""} className="input" list="azm" placeholder="z. B. 38,5 h Mo–Fr Tagschicht" /><datalist id="azm">{["38,5 h Mo–Fr Tagschicht", "40 h Mo–Fr Tagschicht", "38,5 h 2-Schicht (Früh/Spät)", "38,5 h 3-Schicht (Früh/Spät/Nacht)", "Teilzeit 20 h", "Gleitzeit 38,5 h", "4-Tage-Woche 38 h"].map((x) => <option key={x} value={x} />)}</datalist></Field>
            <Field label="WKO-Kollektivvertrag (Beschäftiger)" required help="Bestimmt den Referenzlohn (§ 10 AÜG) und die Zuschläge."><input name="kollektivvertrag" required defaultValue={k.kollektivvertrag ?? ""} className="input" list="kvs" placeholder="z. B. KV Metallgewerbe" /><datalist id="kvs">{["KV Metallgewerbe", "KV Metallindustrie", "KV Handel", "KV Güterbeförderung / Transport", "KV Speditionsgewerbe", "KV Chemische Industrie", "KV Holz verarbeitendes Gewerbe", "KV Elektro- und Elektronikindustrie", "KV Gastgewerbe", "KV Baugewerbe", "KV Nahrungs- und Genussmittelindustrie", "KV Reinigung", "KV Angestellte Gewerbe & Handwerk"].map((x) => <option key={x} value={x} />)}</datalist></Field>
            <Field label="Referenzlohn-Tafel Arbeiter" help="Verknüpft den Beschäftiger-KV mit der hinterlegten Lohntafel. Ohne exakte Tafel meldet das Programm beim Einsatz „Referenzzuschlag prüfen“."><select name="referenzKvId" defaultValue={k.referenzKvId ?? ""} className="select"><option value="">– nicht verknüpft –</option>{referenzKvs.filter((r) => r.gruppe !== "ANGESTELLTE").map((r) => <option key={r.id} value={r.id}>{r.name}{r.referenzzuschlagPruefen ? " · Lohntafel nicht hinterlegt" : " · Lohntafel exakt"}</option>)}</select></Field>
            <Field label="Referenzlohn-Tafel Angestellte" help="Beschäftiger führen für Arbeiter und Angestellte getrennte Kollektivverträge. Bleibt das Feld leer, gilt für alle die Tafel der Arbeiter."><select name="referenzKvAngestellteId" defaultValue={k.referenzKvAngestellteId ?? ""} className="select"><option value="">– wie Arbeiter –</option>{referenzKvs.filter((r) => r.gruppe !== "ARBEITER").map((r) => <option key={r.id} value={r.id}>{r.name}{r.referenzzuschlagPruefen ? " · Lohntafel nicht hinterlegt" : " · Lohntafel exakt"}</option>)}</select></Field>
            <Field label="KV-Abschluss gültig bis" required help="2 Monate vorher: Wiedervorlage „Angebot anpassen“."><input type="date" name="kvGueltigBis" required defaultValue={isoDate(k.kvGueltigBis)} className="input" /></Field>
            <Field label="Erforderliche Qualifikationen" help="Kommagetrennt – fließt ins Matching und in die Konfliktprüfung."><input name="erforderlicheQualifikationen" defaultValue={Array.isArray(k.erforderlicheQualifikationen) ? (k.erforderlicheQualifikationen as string[]).join(", ") : ""} className="input" placeholder="Staplerschein, Sicherheitsunterweisung" /></Field>
            <Field label="Anforderungen / Profil" className="sm:col-span-2"><textarea name="anforderungen" defaultValue={k.anforderungen ?? ""} rows={2} className="textarea" placeholder="Was der Kunde typischerweise braucht: Rollen, Deutschkenntnisse, körperliche Anforderungen, Schichtbereitschaft …" /></Field>
          </div>
        </Card>
        <Card title="Rahmenvertrag & Zahlungskonditionen" className="reveal reveal-3">
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Rahmenvertrag von"><input type="date" name="rahmenvertragBeginn" defaultValue={isoDate(k.rahmenvertragBeginn)} className="input" /></Field>
            <Field label="Rahmenvertrag bis"><input type="date" name="rahmenvertragEnde" defaultValue={isoDate(k.rahmenvertragEnde)} className="input" /></Field>
            <Field label="Kündigungsfrist"><input name="kuendigungsfrist" defaultValue={k.kuendigungsfrist ?? ""} className="input" placeholder="z. B. 4 Wochen" /></Field>
            <Field label="Erinnerung vor Ablauf (Tage)"><input name="erinnerungTageVorher" defaultValue={k.erinnerungTageVorher ?? 60} className="input num" /></Field>
            <Field label="Zahlungsziel (Tage)" help="0 = sofort fällig (Standard)"><input name="zahlungszielTage" defaultValue={k.zahlungszielTage ?? 0} className="input num" /></Field>
            <Field label="Anrede in E-Mails" help="Voreinstellung; je Ansprechpartner überschreibbar."><select name="anredeDu" defaultValue={k.anredeDu ? "DU" : "SIE"} className="select"><option value="SIE">Sie</option><option value="DU">Du</option></select></Field>
            <Field label="Stundennachweis" help="„Vom Beschäftiger“ heißt: Es geht kein Freigabe-Link hinaus."><select name="stundennachweisVomKunden" defaultValue={k.stundennachweisVomKunden ? "KUNDE" : "WIR"} className="select"><option value="WIR">Wir schicken ihn zur Freigabe</option><option value="KUNDE">Wir bekommen die Stundenzettel</option></select></Field>
            <Field label="Skonto %"><input name="skontoProzent" defaultValue={k.skontoProzent ?? ""} className="input num" /></Field>
          </div>
          <div className="grid sm:grid-cols-3 gap-4 mt-4 pt-4 border-t border-line">
            <Field label="Rahmenvertrag Pflicht" help="Ohne unterschriebenen Rahmenvertrag kein erster Einsatz."><select name="rahmenvertragPflicht" defaultValue={k.rahmenvertragPflicht === false ? "0" : "1"} className="select"><option value="1">ja – vor dem ersten Einsatz</option><option value="0">nein (Ausnahme)</option></select></Field>
            <Field label="AGB-Version"><input name="agbVersion" defaultValue={k.agbVersion ?? ""} className="input" placeholder="z. B. 2026-08" /></Field>
            <Field label="AGB akzeptiert am"><input type="date" name="agbAkzeptiertAm" defaultValue={isoDate(k.agbAkzeptiertAm)} className="input" /></Field>
            <Field label="AGB akzeptiert von" className="sm:col-span-3"><input name="agbAkzeptiertVon" defaultValue={k.agbAkzeptiertVon ?? ""} className="input" placeholder="Name des Zeichnungsberechtigten" /></Field>
          </div>
        </Card>
        <Card title="Honorare bei Vermittlung & Übernahme" className="reveal reveal-3">
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Vermittlungshonorar %" help="AGB Arbeitskräftevermittlung Punkt 4.3 – Standard 30 % des Bruttojahresentgelts."><input name="vermittlungProzent" defaultValue={((k.vermittlungProzent ?? 0.3) * 100).toString()} className="input num" /></Field>
            <Field label="Übernahmegebühr %" help="AGB Überlassung Punkt 6.1 – 30 %, je vollem Überlassungsmonat −1/12, nach 12 Monaten frei."><input name="uebernahmeProzent" defaultValue={((k.uebernahmeProzent ?? 0.3) * 100).toString()} className="input num" /></Field>
            <Field label="Mindesthonorar €"><input name="uebernahmeMindest" defaultValue={(k.uebernahmeMindest ?? 2500).toString()} className="input num" /></Field>
            <Field label="UID zuletzt geprüft am"><input type="date" name="uidGeprueftAm" defaultValue={isoDate(k.uidGeprueftAm)} className="input" /></Field>
            <Field label="Prüfstufe"><select name="uidGeprueftStufe" defaultValue={k.uidGeprueftStufe ?? ""} className="select"><option value="">– nicht geprüft –</option><option value="1">Stufe 1 (Gültigkeit)</option><option value="2">Stufe 2 (qualifiziert, mit Name/Adresse)</option></select></Field>
            <Field label="Ergebnis"><select name="uidGueltig" defaultValue={k.uidGueltig == null ? "" : k.uidGueltig ? "1" : "0"} className="select"><option value="">– offen –</option><option value="1">gültig</option><option value="0">ungültig</option></select></Field>
          </div>
        </Card>
      </div>
      <div className="space-y-4">
        <Card title="Zuordnung" className="reveal reveal-2">
          <div className="space-y-4">
            {kostenstellen && neu && <Field label="Kostenstelle" required><select name="kostenstelleId" defaultValue={k.kostenstelleId ?? kostenstellen[0]?.id} className="select">{kostenstellen.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>}
            <Field label="Status"><select name="status" defaultValue={k.status ?? "AKTIV"} className="select"><option value="AKTIV">Aktiv</option><option value="INAKTIV">Inaktiv</option></select></Field>
            <Field label="Notizen"><textarea name="notizen" defaultValue={k.notizen ?? ""} rows={7} className="textarea" /></Field>
          </div>
        </Card>
        <div className="flex gap-2 reveal reveal-3"><button className="btn btn-primary flex-1 justify-center">{neu ? "Kunde anlegen" : "Speichern"}</button><a href={neu ? "/kunden" : `/kunden/${k.id}`} className="btn btn-secondary">Abbrechen</a></div>
      </div>
    </form>
  );
}
