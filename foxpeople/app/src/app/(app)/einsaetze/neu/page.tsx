import Link from "next/link";
import { requireSession, tenantWhere, darfSensibel, istZentrale } from "@/lib/auth";
import { db } from "@/lib/db";
import { zulageText } from "@/lib/zulagen";
import { PageHeader, Card, Field } from "@/components/ui";
import { einsatzAnlegen } from "../actions";
import type { Konflikt } from "@/lib/einsatz";
import { AlertTriangle } from "lucide-react";
import { DienstvertragFelder } from "../dienstvertrag";
import { massgeblicherMindestlohn } from "@/lib/mindestlohn";
import { Rollenwahl } from "../rollenwahl";
import { UrlWahl } from "../urlwahl";
import { zulageProStunde, zulageVorbelegt } from "@/lib/zulagen";
import { referenzKvFuer, referenzlohnErmitteln } from "@/lib/referenzlohn";

export default async function NeuerEinsatz({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const zulagen = await db.zulage.findMany({ where: { aktiv: true }, orderBy: [{ reihenfolge: "asc" }, { name: "asc" }] });
  const kvs = await db.kollektivvertrag.findMany({ orderBy: { name: "asc" }, include: { lohntabelle: { orderBy: { beschaeftigungsgruppe: "asc" } } } }).then((liste) => Promise.resolve(import("@/lib/referenzlohn")).then(({ aktuelleLohnstufen }) => liste.map((kv) => ({ ...kv, lohntabelle: aktuelleLohnstufen(kv.lohntabelle) }))));
  const angebote = await db.angebot.findMany({ where: { ...tenantWhere(s), status: "ANGENOMMEN" }, orderBy: { erstelltAm: "desc" }, include: { positionen: true, kunde: { select: { firmenname: true } } } });
  const [personen, kunden, kostenstellen] = await Promise.all([
    db.person.findMany({ where: { ...tenantWhere(s), status: { in: ["SUCHT", "VERMITTELT"] } }, orderBy: [{ status: "asc" }, { nachname: "asc" }], select: { id: true, vorname: true, nachname: true, status: true, standardrolle: true, stundenlohn: true, verfuegbarSofort: true, verfuegbarAb: true, wochenstunden: true, kvId: true, beschaeftigungsgruppe: true, angestellt: true, eintrittsdatum: true, urlaubsanspruchTage: true, lehreEndeAm: true, durchrechnungStart: true, durchrechnungMonate: true } }),
    db.kunde.findMany({ where: { ...tenantWhere(s), status: "AKTIV" }, orderBy: { firmenname: "asc" }, include: { konditionen: true } }),
    istZentrale(s) ? db.kostenstelle.findMany({ where: { aktiv: true }, orderBy: [{ isZentrale: "desc" }, { name: "asc" }], select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  // Angebotsposition des Kunden: füllt Rolle, Verrechnungssatz, Lohn, KV-Einstufung und Wochenstunden
  // Nur die Positionen des gewählten Kunden. Ohne Kunde keine Liste: Eine Auswahl über alle
  // angenommenen Angebote hinweg lädt dazu ein, eine fremde Position zu erwischen – und die zieht
  // Verrechnungssatz, Lohn und KV-Einstufung des falschen Kunden nach sich.
  const positionen = !sp.kundeId ? [] : angebote
    .filter((a) => a.kundeId === sp.kundeId)
    .flatMap((a) => a.positionen.map((pos) => ({ ...pos, angebot: a })));
  const gewaehlt = positionen.find((x) => x.id === sp.positionId) ?? null;
  // Im Angebot ausgewiesene Zulagen – die sind mit dem Kunden vereinbart und werden im Einsatz
  // vorbelegt. Wurde noch keine Position gewählt, gibt es nichts zu übernehmen.
  const ausAngebot: string[] = gewaehlt?.zulagenIds ?? [];
  const konflikte: Konflikt[] = sp.konflikte ? JSON.parse(sp.konflikte) : [];
  const hart = konflikte.some((k) => k.hart);
  const sensibel = darfSensibel(s);
  const person = personen.find((p) => p.id === sp.personId);
  const kunde = kunden.find((k) => k.id === sp.kundeId);
  const heute = new Date().toISOString().slice(0, 10);
  // Beschäftigungsgruppe des Beschäftiger-KV kommt aus der Angebotsposition, nicht aus dem
  // Dienstvertrag: Der KV AKÜ und der KV des Beschäftigers haben eigene Gruppen (AKÜ A–I,
  // Metalltechnische Industrie A–K). Die eine für die andere zu halten ergibt einen Referenzlohn
  // aus der falschen Zeile – und das ist bei § 10 AÜG kein Schönheitsfehler.
  // Beschäftigungsgruppe beim Beschäftiger: aus dem Angebot vorbelegt, im Einsatz überschreibbar.
  // Sie im Angebot nachbessern zu müssen, wenn dort nichts gewählt wurde, wäre ein Umweg über zwei
  // Bildschirme – und die Zahl, an der der Referenzlohn hängt, gehört dorthin, wo sie gebraucht wird.
  const beschaeftigerKvText = referenzKvFuer(kunde, person?.angestellt);
  const beschaeftigerKv = beschaeftigerKvText ? await referenzlohnErmitteln({ kv: beschaeftigerKvText }) : null;
  const bGruppen = beschaeftigerKv?.kvId
    ? await db.kvLohnstufe.findMany({ where: { kvId: beschaeftigerKv.kvId }, orderBy: [{ beschaeftigungsgruppe: "asc" }, { gultigAb: "desc" }], distinct: ["beschaeftigungsgruppe"], select: { beschaeftigungsgruppe: true, bezeichnung: true, referenzzuschlagProzent: true } })
    : [];
  const bGruppe = sp.beschaeftigerBg ?? gewaehlt?.beschaeftigungsgruppe ?? "";
  const mlBerechnet = person ? await massgeblicherMindestlohn({ kvId: person.kvId, beschaeftigungsgruppe: person.beschaeftigungsgruppe, beschaeftigerKv: beschaeftigerKvText, beschaeftigerBg: bGruppe || null, eintritt: person.eintrittsdatum, am: sp.von ? new Date(sp.von) : new Date() }) : null;
  const ml = mlBerechnet;

  // Bruttostundenlohn vorbelegen. Reihenfolge: was im Angebot mit dem Kunden vereinbart wurde,
  // sonst der Satz aus dem Personalstamm, sonst der Mindestlohn. Nie unter dem maßgeblichen
  // Mindestlohn – ein vorgeschlagener Lohn, der gegen den KV verstößt, wäre eine Falle.
  const lohnAusAngebot = gewaehlt?.stundenlohn ?? null;
  const lohnBasis = lohnAusAngebot ?? person?.stundenlohn ?? null;
  const lohnVorschlag = lohnBasis != null
    ? (ml ? Math.max(lohnBasis, ml.mindest) : lohnBasis).toFixed(2)
    : ml?.mindest.toFixed(2) ?? "";
  const lohnAngehoben = lohnAusAngebot != null && ml != null && lohnAusAngebot < ml.mindest;
  const lohnHilfe = !ml
    ? "Vorbelegt aus dem Angebot des Kunden, sonst aus dem Personalstamm; wird gegen den maßgeblichen Mindestlohn geprüft."
    : [
        lohnAusAngebot != null
          ? `Aus Angebot ${gewaehlt?.angebot.nummer}: ${lohnAusAngebot.toFixed(2).replace(".", ",")} €.`
          : person?.stundenlohn != null ? "Vorbelegt aus dem Personalstamm." : "",
        lohnAngehoben ? `Auf den Mindestlohn angehoben – das Angebot liegt darunter, bitte mit dem Kunden klären.` : "",
        `Maßgeblicher Mindestlohn ${ml.mindest.toFixed(2)} € (${ml.quellen.join(" · ")}) – der bessere KV gilt, darunter kein Einsatz.`,
        ml.referenzzuschlag > 0
          ? `Referenzzuschlag ${ml.referenzzuschlag.toFixed(2)} €/Std gesondert ausweisen.`
          : ml.referenzPruefen ? "Referenzlohn des Beschäftigers nicht hinterlegt – Referenzzuschlag prüfen." : "",
      ].filter(Boolean).join(" ");

  return (
    <>
      <PageHeader title="Einsatz planen" sub="Mitarbeiter einem Kundeneinsatz zuordnen – das System prüft Doppelbuchungen, Nachweise, Verfügbarkeit und KV-Mindestlohn." crumbs={[{ href: "/einsaetze", label: "Einsatzplanung" }, { label: "Neu" }]} />
      {sp.fehler === "pflicht" && <div className="alert alert-red mb-4">Bitte Mitarbeiter, Kunde, Rolle und Beginn angeben.</div>}
      {konflikte.length > 0 && (
        <div className={`alert ${hart ? "alert-red" : "alert-amber"} mb-4 flex-col !items-stretch`}>
          <div className="flex items-center gap-2 font-semibold"><AlertTriangle size={16} /> {hart ? "Einsatz kann so nicht angelegt werden" : "Bitte prüfen – Konflikte erkannt"}</div>
          <ul className="list-disc ml-6 mt-1 space-y-0.5">{konflikte.map((k, i) => <li key={i}>{k.text}{k.hart && <b> (blockierend)</b>}</li>)}</ul>
        </div>
      )}
      {kunde && <div className="alert alert-brand mb-4"><span>Noch keinen Mitarbeiter im Kopf? <Link href={`/kunden/${kunde.id}?tab=matching${sp.rolle ? `&rolle=${encodeURIComponent(sp.rolle)}` : ""}`} className="font-semibold underline">Passende Mitarbeiter für {kunde.firmenname} vorschlagen lassen</Link> (Entfernung, Nachweise, Bewertung, Verfügbarkeit).</span></div>}
      <form action={einsatzAnlegen} className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card title="Zuordnung" className="reveal">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Mitarbeiter" required>
                <UrlWahl name="personId" wert={sp.personId ?? ""} optionen={personen.map((p) => ({ id: p.id, label: `${p.nachname} ${p.vorname} · ${p.standardrolle ?? "–"} · ${p.status === "SUCHT" ? "Pool" : "aktiv"}` }))} zuruecksetzen={["konflikte"]} />
              </Field>
              <Field label="Kunde" required>
                <UrlWahl name="kundeId" wert={sp.kundeId ?? ""} optionen={kunden.map((k) => ({ id: k.id, label: k.firmenname }))} zuruecksetzen={["rolle", "rolleFrei", "verrechnungssatz", "stundenlohn", "wochenstunden", "zulage", "konflikte", "positionId", "angebotId", "einsatzort"]} />
              </Field>
              <Field label="Rolle / Position im Einsatz" required help={positionen.length ? "Aus dem angenommenen Angebot dieses Kunden – füllt Verrechnungssatz, Lohn, Wochenstunden und KV-Einstufung." : kunde ? "Für diesen Kunden ist kein angenommenes Angebot mit Positionen hinterlegt – Rolle und Sätze von Hand." : "Zuerst den Kunden wählen."}>
                <Rollenwahl
                  positionen={positionen.map((x) => ({ id: x.id, angebotId: x.angebot.id, rolle: x.rolle, satz: `${x.verrechnungssatz?.toFixed(2).replace(".", ",") ?? "–"} €/Std · ${x.angebot.nummer}` }))}
                  aktuelleRolle={sp.rolle ?? gewaehlt?.rolle ?? person?.standardrolle ?? ""}
                  freiText={sp.rolleFrei === "1" || (!gewaehlt && Boolean(sp.rolle))}
                />
              </Field>
              <Field label="Art" help="Direktvermittlung: einmaliges Honorar statt Stundenverrechnung."><select name="art" defaultValue={sp.art ?? "UEBERLASSUNG"} className="select"><option value="UEBERLASSUNG">Arbeitskräfteüberlassung</option><option value="DIREKTVERMITTLUNG">Direktvermittlung</option></select></Field>
              {kostenstellen.length > 0 && (
                <Field label="Umsatz zählt zu Kostenstelle" help="Bestimmt, welcher Kostenstelle Umsatz und Provision zugeordnet werden. Standard: die des Kunden. Die Monatsabrechnung erbt diese Wahl.">
                  <select name="kostenstelleId" defaultValue={sp.kostenstelleId ?? ""} className="select"><option value="">– wie beim Kunden –</option>{kostenstellen.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select>
                </Field>
              )}
              <Field label="Stundenerfassung in der Mitarbeiter-App" help="Standardmäßig aus. Erst wenn das angehakt ist, kann der Mitarbeiter für diesen Einsatz seine Stunden selbst eintragen."><label className="flex items-center gap-2 text-[14px] mt-2"><input type="checkbox" name="stundenerfassungApp" defaultChecked={sp.stundenerfassungApp === "on"} /> Mitarbeiter darf Stunden in der App erfassen</label></Field>
              {/* key: Der unkontrollierte Input behält beim Soft-Navigieren (Kundenwahl über UrlWahl)
                  seinen alten DOM-Wert – erst der Remount je Kunde übernimmt dessen Ort als Vorschlag. */}
              <Field label="Einsatzort" help="Vorbelegt mit dem Ort des Kunden – bei abweichender Arbeitsstätte überschreiben. Steht in der Überlassungsmitteilung (§ 12 AÜG).">
                <input key={`ort-${kunde?.id ?? "ohne"}`} name="einsatzort" defaultValue={sp.einsatzort ?? kunde?.ort ?? ""} className="input" placeholder="z. B. 4600 Wels, Werk 2" />
              </Field>
              {/* Die Angebotsposition steckt jetzt in der Rollenauswahl oben – zwei Felder für dieselbe
                  Entscheidung waren die Ursache dafür, dass eine anders geschriebene Rolle die Position
                  nicht mehr fand und der Einsatz ohne Verrechnungssatz und KV-Einstufung entstand. */}
              <input type="hidden" name="angebotId" value={gewaehlt?.angebot.id ?? sp.angebotId ?? ""} />
              <input type="hidden" name="positionId" value={gewaehlt?.id ?? ""} />
              <Field label="Kostenstelle beim Kunden" help="Optional – wird je Mitarbeiter auf der Rechnung ausgewiesen (z. B. Abteilung, Werk, Kostenstellennummer)."><input name="kundenKostenstelle" defaultValue={sp.kundenKostenstelle ?? ""} className="input" placeholder="z. B. KST 4711 Produktion" /></Field>
              <Field label="Beginn" required><input type="date" name="von" required defaultValue={sp.von ?? heute} className="input" /></Field>
              <Field label="Ende" help="Leer = unbefristet"><input type="date" name="bis" defaultValue={sp.bis ?? ""} className="input" /></Field>
              <Field label="Schichtmodell"><select name="schichtmodell" defaultValue={sp.schichtmodell ?? "TAG"} className="select"><option value="TAG">Tagschicht</option><option value="ZWEI_SCHICHT">2-Schicht</option><option value="DREI_SCHICHT">3-Schicht</option><option value="FREI">Frei / nach Bedarf</option></select></Field>
              <Field label="Schwerarbeit" help="Steht in der Überlassungsmitteilung (Punkte 9/10) und als Kennzeichen am Einsatz."><div className="space-y-1 mt-1"><label className="flex items-center gap-2 text-[14px]"><input type="checkbox" name="nachtschwerarbeit" defaultChecked={sp.nachtschwerarbeit === "on"} /> Nachtschwerarbeitsgesetz (NSchG) kommt zur Anwendung</label><label className="flex items-center gap-2 text-[14px]"><input type="checkbox" name="schwerarbeit" defaultChecked={sp.schwerarbeit === "on"} /> Schwerarbeitsverordnung kommt zur Anwendung</label></div></Field>
              <div className="grid grid-cols-2 gap-3"><Field label="Wochenstunden"><input name="wochenstunden" defaultValue={sp.wochenstunden ?? gewaehlt?.wochenstunden ?? person?.wochenstunden ?? 38.5} className="input num" /></Field><Field label="Auslastung %"><input name="auslastung" defaultValue={sp.auslastung ?? 100} className="input num" /></Field></div>
            </div>
          </Card>
          <Card title="Dienstvertrag (Arbeitsrecht)" className="reveal reveal-2">
            <p className="help mb-3">Wird beim Verknüpfen des Mitarbeiters erfasst und in den Personalstamm übernommen – Grundlage für Kündigungsfristen, Zeitkonto und Urlaub.</p>
            <div className="grid sm:grid-cols-3 gap-4">
              <DienstvertragFelder kvs={kvs} w={person ?? {}} eintrittVorschlag={sp.von ?? heute} />
            </div>
          </Card>
          {sensibel && (
            <Card title="Konditionen" className="reveal reveal-2">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Verrechnungssatz an Kunde €/Std" help={kunde?.konditionen.length ? `Hinterlegt: ${kunde.konditionen.map((k) => `${k.rolle} ${k.stundensatz.toFixed(2)}`).join(", ")}` : "Keine Kondition beim Kunden hinterlegt."}><input name="verrechnungssatz" defaultValue={sp.verrechnungssatz ?? gewaehlt?.verrechnungssatz ?? kunde?.konditionen.find((k) => k.rolle === (sp.rolle ?? gewaehlt?.rolle ?? person?.standardrolle))?.stundensatz ?? ""} className="input num" inputMode="decimal" /></Field>
                <Field label="Vermittlungshonorar € (netto, einmalig)" help="Nur bei Direktvermittlung – wird im Startmonat verrechnet."><input name="vermittlungshonorar" defaultValue={sp.vermittlungshonorar ?? ""} className="input num" inputMode="decimal" /></Field>
                <Field label="Bruttostundenlohn €/Std" help={lohnHilfe}><input name="stundenlohn" defaultValue={sp.stundenlohn ?? lohnVorschlag} className="input num" inputMode="decimal" /></Field>
                {bGruppen.length > 0 && (
                  <Field
                    label={`Beschäftigungsgruppe beim Beschäftiger (${beschaeftigerKv?.name ?? beschaeftigerKvText})`}
                    help="Bestimmt die Zeile der Lohntafel des Beschäftigers und damit den Referenzlohn nach § 10 AÜG. Aus dem Angebot vorbelegt; hier änderbar, ohne ins Angebot zurückzugehen."
                  >
                    <UrlWahl
                      name="beschaeftigerBg"
                      wert={bGruppe}
                      pflicht={false}
                      zuruecksetzen={["konflikte"]}
                      optionen={bGruppen.map((g) => ({ id: g.beschaeftigungsgruppe, label: `${g.beschaeftigungsgruppe}${g.bezeichnung ? ` · ${g.bezeichnung}` : ""}${g.referenzzuschlagProzent != null ? ` · +${g.referenzzuschlagProzent.toString().replace(".", ",")} % Ref.` : ""}` }))}
                    />
                  </Field>
                )}
              </div>
            </Card>
          )}
          {sensibel && (
            <Card title="Lohnbestandteile je Stunde" className="reveal reveal-3">
              <p className="help mb-3">
                Woraus sich der Bruttostundenlohn zusammensetzt. Die Normalstunde kommt aus dem stärkeren Kollektivvertrag –
                mehr zahlen ist jederzeit möglich, weniger nicht. Alle Werte fließen in die Monatsabrechnung.
              </p>
              <table className="table">
                <thead><tr><th>Bestandteil</th><th>Grundlage</th><th className="r">Lohn €/Std</th><th className="r">Verrechnung €/Std</th></tr></thead>
                <tbody>
                  <tr>
                    <td className="font-semibold">Normalstunde</td>
                    <td className="text-[12.5px] text-muted">{ml ? ml.quellen.join(" · ") : "Mitarbeiter und Kunde wählen"}</td>
                    <td className="r num">{ml ? ml.mindest.toFixed(2).replace(".", ",") : "–"}</td>
                    <td className="r num">{gewaehlt?.verrechnungssatz != null ? gewaehlt.verrechnungssatz.toFixed(2).replace(".", ",") : "lt. Konditionen"}</td>
                  </tr>
                  {ml && ml.referenzzuschlag > 0 && (
                    <tr>
                      <td className="font-semibold">Referenzaufschlag</td>
                      <td className="text-[12.5px] text-muted">Beschäftiger-KV liegt über dem KV AKÜ (§ 10 AÜG) – gesondert auf der Lohnabrechnung</td>
                      <td className="r num">{ml.referenzzuschlag.toFixed(2).replace(".", ",")}</td>
                      <td className="r num text-muted">im Satz enthalten</td>
                    </tr>
                  )}
                  {ml && ml.referenzzuschlag === 0 && ml.referenzPruefen && (
                    <tr>
                      <td className="font-semibold text-red">Referenzlohn fehlt</td>
                      <td colSpan={2}>
                        <div className="text-[12.5px]">
                          Für <b>{kunde?.kollektivvertrag ?? "diesen Kunden"}</b> ist keine Lohntafel verknüpft. Ohne sie wird nur gegen den KV AKÜ
                          und die Hausregel geprüft – <b>der Einsatz lässt sich so nicht anlegen</b>.
                        </div>
                        <div className="text-[12.5px] text-muted mt-1">
                          Entweder im Kundenstamm unter „Referenzlohn-Tafel“ verknüpfen, oder den beim Beschäftiger erfragten Referenzlohn hier eintragen – oder bestätigen, dass du nachgefragt hast und kein Zuschlag anfällt. Die Bestätigung wird mit Name und Zeitpunkt am Einsatz festgehalten.
                        </div>
                      </td>
                      <td className="r">
                        <input name="referenzlohn" defaultValue={sp.referenzlohn ?? ""} placeholder="€/Std" className="input num !w-28 !py-1" inputMode="decimal" />
                        <label className="flex items-center gap-1.5 justify-end text-[12.5px] mt-1.5 whitespace-nowrap"><input type="checkbox" name="referenzGeprueft" defaultChecked={sp.referenzGeprueft === "on"} /> erfragt, kein Zuschlag</label>
                        {kunde?.kollektivvertrag && <label className="flex items-start gap-1.5 justify-end text-[12.5px] mt-1.5 text-right"><input type="checkbox" name="keinZuschlagKv" className="mt-0.5" /> <span>für <b>{kunde.kollektivvertrag}</b> gibt es generell keinen Referenzzuschlag – einmal festhalten, gilt dann für alle Kunden dieses KV</span></label>}
                      </td>
                    </tr>
                  )}
                  </tbody>
              </table>
            </Card>
          )}
          {zulagen.length > 0 && (
            <Card title="Zulagen & Zuschläge" className="reveal reveal-3">
              <p className="help mb-3">
                Angehakt wird, was gebührt; daneben steht, was wir dem Beschäftiger dafür verrechnen. Leer gelassen heißt:
                Verrechnung wie der Lohnanteil. Zulagen, die zum Kollektivvertrag des Kunden oder zum Schichtmodell passen,
                sind vorgeschlagen.
              </p>
              <table className="table">
                <thead><tr><th>Zulage</th><th>lt. Stammdaten</th><th className="r">Lohn €/Std</th><th className="r">Verrechnung €/Std</th></tr></thead>
                <tbody>
                  {zulagen.map((z) => {
                    const passtKv = z.kvId && kunde?.referenzKvId === z.kvId;
                    const passtSchicht = z.schichtmodelle.includes(sp.schichtmodell ?? "TAG");
                    // Steht die Zulage im angenommenen Angebot, ist sie mit dem Kunden vereinbart –
                    // sie gehört angehakt, ohne dass jemand sie ein zweites Mal zusammensucht. Ein
                    // eigener Vorschlag aus KV oder Schichtmodell kommt zusätzlich dazu.
                    const imAngebot = ausAngebot.includes(z.id);
                    const angehakt = zulageVorbelegt({ kuerzel: z.kuerzel, ausUrl: sp.zulage, imAngebot, passtKv: Boolean(passtKv), passtSchicht });
                    const lohnAnteil = zulageProStunde(z, Number(sp.stundenlohn) || person?.stundenlohn || ml?.mindest || 0);
                    return (
                      <tr key={z.id}>
                        <td><label className="flex items-center gap-2 text-[14px]"><input type="checkbox" name="zulage" value={z.kuerzel} defaultChecked={angehakt} /> {z.name}</label>
                          {(imAngebot || passtKv || passtSchicht) && <div className="text-[12.5px] text-teal ml-6">{imAngebot ? `im Angebot ${gewaehlt?.angebot.nummer} ausgewiesen` : passtKv ? "gilt für den KV des Beschäftigers" : `gilt bei ${sp.schichtmodell === "DREI_SCHICHT" ? "3-Schicht" : "2-Schicht"}`}</div>}
                        </td>
                        <td className="text-[12.5px] text-muted">{zulageText(z)}{z.steuerfrei ? " · steuerfrei" : ""}{z.weiterverrechnen ? "" : " · nicht weiterverrechnet"}</td>
                        <td className="r num">{lohnAnteil ? lohnAnteil.toFixed(2).replace(".", ",") : "–"}</td>
                        <td className="r"><input name={`zulageSatz_${z.kuerzel}`} defaultValue={sp[`zulageSatz_${z.kuerzel}`] ?? ""} placeholder={lohnAnteil ? lohnAnteil.toFixed(2).replace(".", ",") : ""} className="input num !w-24 !py-1" inputMode="decimal" disabled={!z.weiterverrechnen} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </div>
        <div className="space-y-4">
          <Card title="Notizen" className="reveal reveal-2"><textarea name="notizen" defaultValue={sp.notizen ?? ""} rows={6} className="textarea" placeholder="Ansprechpartner vor Ort, Arbeitsbeginn, Schutzausrüstung …" /></Card>
          {konflikte.length > 0 && !hart && <label className="flex items-start gap-2 text-[14px] card p-4 reveal"><input type="checkbox" name="konflikteAkzeptiert" className="mt-1" /> <span>Konflikte geprüft – Einsatz trotzdem anlegen.</span></label>}
          <div className="flex gap-2 reveal reveal-3"><button className="btn btn-primary flex-1 justify-center">{konflikte.length ? "Erneut prüfen & anlegen" : "Prüfen & anlegen"}</button><Link href="/einsaetze" className="btn btn-secondary">Abbrechen</Link></div>
        </div>
      </form>
    </>
  );
}
