import { Field, Card } from "@/components/ui";
import { isoDate } from "@/lib/format";
import { STAATEN, EU_EWR_CH, brauchtArbeitsbewilligung, bewilligungHinweis } from "@/lib/staaten";
import { PlzOrt } from "@/components/plz-ort";

export interface PersonFormDaten {
  id?: string;
  status?: string;
  nachname?: string; vorname?: string; geburtsdatum?: Date | null; telefon?: string | null; email?: string | null;
  strasse?: string | null; plz?: string | null; ort?: string | null; staatsangehoerigkeit?: string | null;
  svnrLast4?: string | null; standardrolle?: string | null; verfuegbarSofort?: boolean; verfuegbarAb?: Date | null;
  hinterlegterKundeId?: string | null; notizen?: string | null; aufnahmedatum?: Date | null; kostenstelleId?: string; autoVorhanden?: boolean;
  kvId?: string | null; beschaeftigungsgruppe?: string | null; wochenstunden?: number | null; eintrittsdatum?: Date | null; austrittsdatum?: Date | null; urlaubsanspruchTage?: number; stundenlohn?: number | null; fuehrerschein?: boolean; maxPendelKm?: number | null;
  geschlecht?: string | null; angestellt?: boolean; lehreEndeAm?: Date | null; durchrechnungStart?: Date | null; durchrechnungMonate?: number;
  ausweisArt?: string | null; ausweisNummer?: string | null; ausweisGultigBis?: Date | null; ausweisDokumentId?: string | null;
  quelle?: string | null; pipelineStufe?: string | null; erstkontaktAm?: Date | null; absagegrund?: string | null; absageAm?: Date | null; talentpool?: boolean; wiedervorlageAm?: Date | null;
  amsGefoerdert?: boolean; amsFoerderungArt?: string | null; amsFoerderungBetrag?: number | null; amsFoerderungVon?: Date | null; amsFoerderungBis?: Date | null; amsFoerderungNotiz?: string | null;
}

export const AUSWEIS_ARTEN = ["Reisepass", "Personalausweis", "Aufenthaltstitel", "Konventionsreisepass", "Führerschein (nur ergänzend)"];
export const BEWERBER_QUELLEN = ["AMS", "Empfehlung Mitarbeiter", "Empfehlung Kunde", "Website", "Initiativbewerbung", "Facebook / Instagram", "willhaben", "karriere.at", "Aushang / Flyer", "Messe", "Sonstige"];
export const PIPELINE_STUFEN: [string, string][] = [["NEU", "Neu eingegangen"], ["KONTAKTIERT", "Kontaktiert"], ["GESPRAECH", "Gespräch vereinbart"], ["GEPRUEFT", "Geprüft / Unterlagen vollständig"], ["VORGESTELLT", "Beim Kunden vorgestellt"], ["EINGESTELLT", "Eingestellt"], ["ABGESAGT", "Abgesagt"]];
export const ABSAGEGRUENDE = ["Qualifikation passt nicht", "Gehaltsvorstellung zu hoch", "Kein Führerschein / nicht mobil", "Deutschkenntnisse zu gering", "Nicht erschienen", "Hat abgesagt", "Anderes Angebot angenommen", "Arbeitsbewilligung fehlt", "Kunde hat abgesagt", "Sonstiges"];

const AMS_ARTEN = ["Eingliederungsbeihilfe", "Kombilohn", "Lehrstellenförderung", "Qualifizierungsförderung (QBN)", "Arbeitsplatznahe Qualifizierung (AQUA)", "Zuschuss BEinstG / Integrationsbeihilfe", "Sonstige"];

export interface Werdegang { zeitraum: string; firma: string; taetigkeit: string; notiz: string | null }

const heuteIso = () => new Date().toISOString().slice(0, 10);

export function PersonForm({ p, kunden, kvs, kostenstellen, sensibel, action, svnrKlartext, werdegang = [], werber = null, stapler = false }: {
  p: PersonFormDaten;
  werdegang?: Werdegang[];
  kunden: { id: string; firmenname: string }[];
  kvs: { id: string; name: string; lohntabelle: { beschaeftigungsgruppe: string; bezeichnung: string | null }[] }[];
  kostenstellen: { id: string; name: string }[] | null;
  sensibel: boolean;
  action: (fd: FormData) => Promise<void>;
  svnrKlartext?: string | null;
  /** Name des Mitarbeiters, der diese Person geworben hat („Freunde werben Freunde“) */
  werber?: string | null;
  /** hat einen gültigen Staplerschein als Qualifikation hinterlegt */
  stapler?: boolean;
}) {
  // Alter aus dem Geburtsdatum – beim Telefonat mit dem Kunden zählt die Zahl, nicht das Datum.
  const alter = p.geburtsdatum
    ? Math.floor((Date.now() - new Date(p.geburtsdatum).getTime()) / (365.2425 * 86400000))
    : null;
  const neu = !p.id;
  void kvs;
  return (
    <form action={action} className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Card title="Stammdaten" className="reveal">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Nachname" required><input name="nachname" defaultValue={p.nachname ?? ""} required className="input" /></Field>
            <Field label="Vorname" required><input name="vorname" defaultValue={p.vorname ?? ""} required className="input" /></Field>
            <Field label="Geburtsdatum" required help={alter != null ? `${alter} Jahre` : undefined}><input type="date" name="geburtsdatum" defaultValue={isoDate(p.geburtsdatum)} className="input" /></Field>
            <Field label="Geschlecht" help="Pflichtangabe für die AÜG-Überlassungsstatistik."><select name="geschlecht" defaultValue={p.geschlecht ?? ""} className="select"><option value="">–</option><option value="M">männlich</option><option value="W">weiblich</option><option value="D">divers</option></select></Field>
            <Field label="Staatsangehörigkeit" required help={brauchtArbeitsbewilligung(p.staatsangehoerigkeit) ? bewilligungHinweis(p.staatsangehoerigkeit) ?? undefined : "EU/EWR/Schweiz: keine Arbeitsbewilligung nötig. Bei Drittstaaten verlangt das System einen gültigen Aufenthaltstitel/Arbeitsbewilligung (Qualifikation mit Ablaufdatum), bevor ein Einsatz geplant werden kann."}>
              <select name="staatsangehoerigkeit" required defaultValue={p.staatsangehoerigkeit ?? ""} className="select">
                <option value="">– bitte wählen –</option>
                <optgroup label="EU / EWR / Schweiz (keine Arbeitsbewilligung)">{EU_EWR_CH.map((x) => <option key={x} value={x}>{x}</option>)}</optgroup>
                <optgroup label="Drittstaaten (Arbeitsbewilligung erforderlich)">{STAATEN.filter((x) => !EU_EWR_CH.includes(x)).map((x) => <option key={x} value={x}>{x}</option>)}</optgroup>
              </select>
            </Field>
            <Field label="Telefon" required><input name="telefon" defaultValue={p.telefon ?? ""} className="input" placeholder="0664 …" /></Field>
            <Field label="E-Mail" required><input type="email" name="email" defaultValue={p.email ?? ""} className="input" /></Field>
            <Field label="Straße / Nr." className="sm:col-span-2"><input name="strasse" defaultValue={p.strasse ?? ""} className="input" /></Field>
            <PlzOrt plzWert={p.plz} ortWert={p.ort} />
            <Field label="Ausweisart" help="Ausweiskopie ist im Onboarding Pflicht – erst damit ist die Identität dokumentiert."><select name="ausweisArt" defaultValue={p.ausweisArt ?? ""} className="select"><option value="">– keiner hinterlegt –</option>{AUSWEIS_ARTEN.map((x) => <option key={x} value={x}>{x}</option>)}</select></Field>
            <Field label="Ausweisnummer"><input name="ausweisNummer" defaultValue={p.ausweisNummer ?? ""} className="input" /></Field>
            <Field label="Ausweis gültig bis" help="8 Wochen vor Ablauf erscheint eine Wiedervorlage."><input type="date" name="ausweisGultigBis" defaultValue={isoDate(p.ausweisGultigBis)} className="input" /></Field>
            {sensibel && (
              <Field label="SVNR" required help={p.svnrLast4 ? `Gespeichert (verschlüsselt): ····${p.svnrLast4}. Nur ausfüllen, um zu ändern.` : "Wird verschlüsselt gespeichert, Zugriffe werden protokolliert."}>
                <input name="svnr" defaultValue={svnrKlartext ?? ""} className="input num" placeholder="1234 010190" inputMode="numeric" />
              </Field>
            )}
          </div>
        </Card>
        <Card title="Einsatz & Verfügbarkeit" className="reveal reveal-2">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Standardrolle / Position" required><input name="standardrolle" defaultValue={p.standardrolle ?? ""} className="input" placeholder="z. B. Staplerfahrer, Bürokraft" list="rollen" /></Field>
            <datalist id="rollen">{["Lagerlogistik", "Staplerfahrer", "Produktionshelfer", "Schweißer", "Elektriker", "Tischler", "Bürokraft", "Kaufmännischer Angestellter", "Buchhaltung", "Techniker", "Fachkraft", "Führungskraft"].map((r) => <option key={r} value={r} />)}</datalist>
            <Field label="Hinterlegter Kunde">
              <select name="hinterlegterKundeId" defaultValue={p.hinterlegterKundeId ?? ""} className="select"><option value="">–</option>{kunden.map((k) => <option key={k.id} value={k.id}>{k.firmenname}</option>)}</select>
            </Field>
            <Field label="Verfügbarkeit">
              <div className="flex gap-2">
                <select name="verfuegbar" defaultValue={p.verfuegbarSofort ? "sofort" : p.verfuegbarAb ? "datum" : ""} className="select !w-40"><option value="">unbekannt</option><option value="sofort">sofort</option><option value="datum">ab Datum</option></select>
                <input type="date" name="verfuegbarAb" defaultValue={isoDate(p.verfuegbarAb)} className="input" />
              </div>
            </Field>
            <Field label="Bewerbungsquelle" help={werber ? `Geworben von ${werber} – „Freunde werben Freunde“.` : "Zeigt im Controlling, welcher Kanal die besten Mitarbeiter bringt."}><input name="quelle" defaultValue={p.quelle ?? ""} className="input" list="quellen" /><datalist id="quellen">{BEWERBER_QUELLEN.map((x) => <option key={x} value={x} />)}</datalist></Field>
            <Field label="Stufe im Recruiting"><select name="pipelineStufe" defaultValue={p.pipelineStufe ?? "NEU"} className="select">{PIPELINE_STUFEN.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Beworben am" help="Bestimmt die Reihung in der Bewerberliste. Meldet sich jemand nach längerer Zeit wieder und sucht Arbeit, hier auf heute setzen – dann steht er wieder oben."><input type="date" name="aufnahmedatum" defaultValue={isoDate(p.aufnahmedatum) || heuteIso()} className="input" /></Field>
            <Field label="Mobilität" help="Fließt ins Matching (Entfernung Wohnsitz → Kunde)."><div className="flex flex-wrap items-center gap-4">
              {/* Farbe statt bloßem Haken: Ob jemand Auto, Führerschein und Staplerschein hat,
                  entscheidet beim Telefonat mit dem Kunden in Sekunden, ob er passt. Grün = da. */}
              <label className={`flex items-center gap-2 text-[14px] px-2 py-1 rounded-lg ${p.fuehrerschein ? "bg-teal-soft text-teal font-semibold" : "text-muted"}`}><input type="checkbox" name="fuehrerschein" defaultChecked={p.fuehrerschein} /> Führerschein B</label>
              <label className={`flex items-center gap-2 text-[14px] px-2 py-1 rounded-lg ${p.autoVorhanden ? "bg-teal-soft text-teal font-semibold" : "text-muted"}`}><input type="checkbox" name="autoVorhanden" defaultChecked={p.autoVorhanden} /> Auto vorhanden</label>
              <div className={`flex items-center gap-2 text-[14px] px-2 py-1 rounded-lg ${stapler ? "bg-teal-soft text-teal font-semibold" : "text-muted"}`}>{stapler ? "✓" : "–"} Staplerschein {stapler ? "" : <span className="text-[12.5px]">(unter Qualifikationen eintragen)</span>}</div>
              <input name="maxPendelKm" defaultValue={p.maxPendelKm ?? ""} className="input !w-28 num" placeholder="max. km" />
            </div></Field>
          </div>
        </Card>
        <div className="alert alert-brand reveal reveal-3"><span>Dienstvertrag, Kollektivvertrag, Lohn und Wochenstunden werden erst beim <b>Einsatz</b> erfasst (Kunde → Einsatz planen → Mitarbeiter verknüpfen).</span></div>
        <div className="alert alert-brand reveal reveal-3"><span>Der <b>Werdegang</b> für das Kundenprofil steht im Akt unter dem Reiter <b>Kundenprofil</b> – dort wird er auch an Beschäftiger versendet und der Versand mitprotokolliert.</span></div>
        {sensibel && (
          <Card title="AMS-Förderung" className="reveal reveal-3">
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" name="amsGefoerdert" defaultChecked={p.amsGefoerdert} /> Mitarbeiter wird vom AMS gefördert</label>
              <div className="grid sm:grid-cols-3 gap-4">
                <Field label="Förderart">
                  <input name="amsFoerderungArt" defaultValue={p.amsFoerderungArt ?? ""} className="input" list="ams-arten" placeholder="z. B. Eingliederungsbeihilfe" />
                  <datalist id="ams-arten">{AMS_ARTEN.map((a) => <option key={a} value={a} />)}</datalist>
                </Field>
                <Field label="Förderhöhe € / Monat" help="Zuschuss lt. AMS-Bescheid; fließt ins Controlling."><input name="amsFoerderungBetrag" defaultValue={p.amsFoerderungBetrag ?? ""} className="input num" inputMode="decimal" /></Field>
                <div />
                <Field label="Förderung von"><input type="date" name="amsFoerderungVon" defaultValue={isoDate(p.amsFoerderungVon)} className="input" /></Field>
                <Field label="Förderung bis" help="Wiedervorlage 30 Tage vor Ende."><input type="date" name="amsFoerderungBis" defaultValue={isoDate(p.amsFoerderungBis)} className="input" /></Field>
                <Field label="Notiz / Bescheid-Nr."><input name="amsFoerderungNotiz" defaultValue={p.amsFoerderungNotiz ?? ""} className="input" /></Field>
              </div>
            </div>
          </Card>
        )}
      </div>
      <div className="space-y-4">
        <Card title="Status & Zuordnung" className="reveal reveal-2">
          <div className="space-y-4">
            {neu && (
              <Field label="Status">
                <select name="status" defaultValue="SUCHT" className="select"><option value="SUCHT">Bewerber (sucht)</option><option value="VERMITTELT">Vermittelt / aktiv</option></select>
              </Field>
            )}
            {kostenstellen && neu && (
              <Field label="Kostenstelle" required>
                <select name="kostenstelleId" defaultValue={p.kostenstelleId ?? kostenstellen[0]?.id} className="select">{kostenstellen.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select>
              </Field>
            )}
            <Field label="Notizen"><textarea name="notizen" defaultValue={p.notizen ?? ""} rows={6} className="textarea" placeholder="Gesprächsnotizen, Wünsche, Einschränkungen …" /></Field>
          </div>
        </Card>
      </div>
      <div className="action-bar lg:col-span-3 justify-end">
        <a href={neu ? "/personen" : `/personen/${p.id}`} className="btn btn-secondary">Abbrechen</a>
        <button className="btn btn-primary min-w-40">{neu ? "Person aufnehmen" : "Änderungen speichern"}</button>
      </div>
    </form>
  );
}
