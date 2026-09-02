import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Phone, Mail, MapPin, ShieldAlert, FileDown, Lock } from "lucide-react";
import { Fuechse } from "@/components/fuechse";
import { brauchtArbeitsbewilligung, IST_BEWILLIGUNG } from "@/lib/staaten";
import { requireSession, darfKostenstelle, darfSensibel, istAdmin, tenantWhere } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { decryptField } from "@/lib/crypto";
import { controlling } from "@/lib/controlling";
import { eur, pct, datum, datumLang } from "@/lib/format";
import { urlaubsstand, tage as tg } from "@/lib/urlaub";
import { BewertungFelder, MerkmalChips } from "@/components/bewertung-felder";
import { PageHeader, Card, Field, Stat, Badge, personStatusBadge, einsatzStatusBadge, Empty } from "@/components/ui";
import { KATEGORIEN } from "@/lib/dokumente";
import { werdegangNurSpeichern, profilSenden, profilRueckmeldung } from "../actions";
import { personStatus, qualifikationAnlegen, qualifikationLoeschen, abwesenheitAnlegen, bewertungAnlegen, notizAnlegen, anrufFesthalten, dokumentHochladen, personAnonymisieren, fotoHochladen, poolUebernehmen, personLoeschen, bewertungLoeschen, dokumentLoeschen } from "../actions";
import { kranktage365, alter } from "@/lib/person-stats";
import { ergebnisSicht } from "@/lib/provision";
import { zeitkonto } from "@/lib/zeitkonto";
import { fristenUebersicht, fristText, terminText, letzterKuendigungstag, FRISTEN_DEFAULT, type Fristentabelle } from "@/lib/fristen";
import { einstellung } from "@/lib/einstellungen";
import { zeitbuchungAnlegen, abwesenheitEntscheiden, dokumentGeprueft } from "../actions";
import { ONBOARDING } from "@/lib/onboarding";
import { onboardingSpeichern, sperreAnlegen, sperreAufheben, appZugangSchalten, appEinladungSenden } from "../actions";
import { Camera, FileUser, Plus } from "lucide-react";
import { WerdegangTabelle } from "../werdegang";
import { titel as vertragTitel } from "../../vertraege/titel";
import { QUALIFIKATIONSTYPEN } from "@/lib/dokumente";

export const dynamic = "force-dynamic";

const TABS_MITARBEITER = [["profil", "Profil"], ["einsaetze", "Einsätze"], ["kundenprofil", "Kundenprofil"], ["qualifikationen", "Qualifikationen"], ["dokumente", "Dokumente"], ["lohnzettel", "Lohnzettel"], ["bewertungen", "Bewertungen"], ["onboarding", "Onboarding"], ["abwesenheiten", "Fehlzeiten (Urlaub / KS / ZA)"], ["zeitkonto", "Zeitkonto"], ["fristen", "Fristen"], ["historie", "Historie"], ["sperren", "Sperre"]] as const;
const TABS_BEWERBER = [["profil", "Profil"], ["einsaetze", "Frühere Einsätze"], ["kundenprofil", "Kundenprofil"], ["qualifikationen", "Qualifikationen"], ["dokumente", "Dokumente"], ["bewertungen", "Bewertungen"], ["onboarding", "Onboarding"], ["historie", "Historie"], ["sperren", "Sperre"]] as const;

function tageBis(d: Date) { return Math.ceil((d.getTime() - new Date().getTime()) / 86400000); }

export default async function PersonDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; fehler?: string; mail?: string; verlauf?: string; gesendet?: string; ok?: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  const { tab = "profil", fehler } = sp;
  const alleKunden = await db.kunde.findMany({ where: { ...tenantWhere(s), status: "AKTIV" }, orderBy: { firmenname: "asc" }, select: { id: true, firmenname: true } });
  const p = await db.person.findUnique({
    where: { id },
    include: {
      hinterlegterKunde: true, kv: { include: { lohntabelle: true } },
      qualifikationen: { orderBy: { typ: "asc" } },
      abwesenheiten: { orderBy: { von: "desc" } },
      zeitbuchungen: { orderBy: { datum: "desc" } },
      bewertungen: { orderBy: { datum: "desc" }, include: { kunde: true } },
      kundenBewertungen: { orderBy: { datum: "desc" }, include: { kunde: true } },
      einsaetze: { orderBy: { von: "desc" }, include: { kunde: true } },
      dokumente: { orderBy: { hochgeladenAm: "desc" } },
      aktivitaeten: { orderBy: { zeitpunkt: "desc" }, take: 500 },
      vertraege: { orderBy: { erstelltAm: "desc" } },
      berufserfahrung: { orderBy: { reihenfolge: "asc" } },
      profilVersand: { orderBy: { gesendetAm: "desc" }, include: { kunde: { select: { firmenname: true } } } },
      empfohlenDurch: { include: { werber: { select: { id: true, vorname: true, nachname: true } } } },
      kostenstelle: true,
    },
  });
  if (!p) notFound();
  /** Wer diesen Bewerber über seinen Empfehlungs-Link gebracht hat – steht in den Stammdaten. */
  const werber = p.empfohlenDurch.find((e) => e.werber)?.werber ?? null;
  const fremd = !darfKostenstelle(s, p.kostenstelleId); // Bewerber-Pool ist für alle sichtbar (lesend)
  if (fremd && p.status !== "SUCHT") notFound();
  const sensibel = darfSensibel(s) && !fremd;
  const prov = ergebnisSicht(s) === "PROVISION";
  const krank365 = kranktage365(p.abwesenheiten);
  const zk = tab === "zeitkonto" ? await zeitkonto(id) : null;
  const sperrgruende = tab === "sperren" ? await db.sperrgrund.findMany({ where: { aktiv: true }, orderBy: { reihenfolge: "asc" } }) : [];
  const sperren = tab === "sperren" ? await db.sperre.findMany({ where: { personId: id }, include: { grund: true, kunde: { select: { id: true, firmenname: true } } }, orderBy: { ab: "desc" } }) : [];
  const fristenTab = tab === "fristen" || tab === "profil" ? { ...FRISTEN_DEFAULT, ...(await einstellung<Partial<Fristentabelle>>("fristen", {})) } : null;
  const fr = fristenTab ? fristenUebersicht(fristenTab, { eintrittsdatum: p.eintrittsdatum, angestellt: p.angestellt, lehreEndeAm: p.lehreEndeAm }) : null;
  const amsEndeTage = p.amsGefoerdert && p.amsFoerderungBis ? tageBis(p.amsFoerderungBis) : null;
  const svnr = sensibel && tab === "profil" ? decryptField(p.svnrEnc) : null;
  if (sensibel && tab === "profil" && (p.svnrEnc || p.gesperrtGrund)) await audit(s, "VIEW_SENSITIVE", "Person", id, "Profil mit sensiblen Feldern angezeigt", undefined, p.kostenstelleId);
  const kunden = await db.kunde.findMany({ where: { kostenstelleId: p.kostenstelleId, status: "AKTIV" }, orderBy: { firmenname: "asc" }, select: { id: true, firmenname: true } });
  const jahr = new Date().getFullYear();
  const c = await controlling(jahr, p.kostenstelleId);
  const meine = c.mitarbeiter.filter((m) => m.personId === id);
  const heute = new Date();
  const urlaubGenommen = p.abwesenheiten.filter((a) => a.typ === "URLAUB" && a.status !== "ABGELEHNT" && a.von.getFullYear() === jahr).reduce((x, a) => x + a.tage, 0);
  const ul = urlaubsstand(p, urlaubGenommen, jahr);
  const krank = p.abwesenheiten.filter((a) => a.typ === "KRANKENSTAND" && a.von.getFullYear() === jahr).reduce((x, a) => x + a.tage, 0);
  const abgelaufen = p.qualifikationen.filter((q) => q.gultigBis && q.gultigBis < heute);
  const baldAb = p.qualifikationen.filter((q) => q.gultigBis && q.gultigBis >= heute && q.gultigBis < new Date(heute.getTime() + 60 * 86400000));
  const mindest = p.kv?.lohntabelle.find((l) => l.beschaeftigungsgruppe === p.beschaeftigungsgruppe);
  const unterMindest = sensibel && mindest?.mindestStundenlohn != null && p.stundenlohn != null && p.stundenlohn < mindest.mindestStundenlohn;
  const aktiverEinsatz = p.einsaetze.find((e) => e.status === "AKTIV");
  const avgSterne = p.bewertungen.length ? p.bewertungen.reduce((x, b) => x + b.sterne, 0) / p.bewertungen.length : null;

  return (
    <>
      <PageHeader
        crumbs={[{ href: p.status === "VERMITTELT" || p.status === "AUSGESCHIEDEN" ? "/personen?bereich=mitarbeiter" : "/personen?bereich=bewerber", label: p.status === "VERMITTELT" || p.status === "AUSGESCHIEDEN" ? "Mitarbeiter" : "Bewerber" }, { label: `${p.nachname} ${p.vorname}` }]}
        title={<span className="flex items-center gap-3 flex-wrap">{p.vorname} {p.nachname} {personStatusBadge(p.status)}</span>}
        sub={<span className="flex flex-wrap gap-x-4 gap-y-1 items-center">{p.standardrolle && <span className="font-semibold text-ink">{p.standardrolle}</span>}{alter(p.geburtsdatum) != null && <span>{alter(p.geburtsdatum)} Jahre</span>}{p.telefon && <span className="flex items-center gap-1"><Phone size={13} />{p.telefon}</span>}{p.email && <span className="flex items-center gap-1"><Mail size={13} />{p.email}</span>}{p.ort && <span className="flex items-center gap-1"><MapPin size={13} />{p.plz} {p.ort}</span>}<span className="badge badge-grey">{p.kostenstelle.name}</span></span>}
        actions={fremd ? <form action={poolUebernehmen.bind(null, id)}><button className="btn btn-primary">In meine Kostenstelle übernehmen</button></form> : <>
          {/* Telefon-Button: Anruf mit einem Klick in der Historie festhalten (erreicht / nicht erreicht + Notiz) */}
          <details className="relative">
            <summary className="btn btn-secondary list-none cursor-pointer [&::-webkit-details-marker]:hidden"><Phone size={15} /> Anruf</summary>
            <div className="absolute right-0 top-full mt-2 w-80 z-30 card card-pad text-left">
              <div className="font-semibold text-[13.5px] mb-1">Anruf festhalten</div>
              {p.telefon ? <a href={`tel:${p.telefon.replace(/[^+\d]/g, "")}`} className="text-[13px] text-brand font-semibold">{p.telefon} anrufen</a> : <span className="text-[13px] text-muted">Keine Telefonnummer hinterlegt.</span>}
              <form action={anrufFesthalten.bind(null, id)} className="space-y-2 mt-3">
                <input name="notiz" className="input" placeholder="Notiz (optional) – z. B. Rückruf morgen" />
                <div className="flex gap-2">
                  <button name="ergebnis" value="erreicht" className="btn btn-primary flex-1 justify-center">Erreicht</button>
                  <button name="ergebnis" value="nicht_erreicht" className="btn btn-secondary flex-1 justify-center">Nicht erreicht</button>
                </div>
                <p className="help">Wird als Anruf in der Historie eingetragen.</p>
              </form>
            </div>
          </details>
          {p.email && <Link href={`/mail/neu?personId=${id}`} className="btn btn-secondary"><Mail size={15} /> E-Mail</Link>}
          <a href={`/personen/${id}/profil`} target="_blank" className="btn btn-secondary"><FileUser size={15} /> Kundenprofil (PDF)</a>
          <Link href={`/mail/neu?personId=${id}&profil=1&vorlage=profil${aktiverEinsatz ? `&kundeId=${aktiverEinsatz.kundeId}` : p.hinterlegterKundeId ? `&kundeId=${p.hinterlegterKundeId}` : ""}`} className="btn btn-secondary"><Mail size={15} /> Kundenprofil senden</Link>
          {p.status !== "AUSGESCHIEDEN" && <Link href={`/einsaetze/neu?personId=${id}`} className="btn btn-secondary">Einsatz planen</Link>}
          <Link href={`/personen/${id}/bearbeiten`} className="btn btn-primary"><Pencil size={15} /> Bearbeiten</Link>
        </>}
      />
      {fehler === "berechtigung" && <div className="alert alert-red mb-4">Dafür fehlt die Berechtigung.</div>}
      {fehler === "dateityp" && <div className="alert alert-red mb-4">Dieser Dateityp ist nicht erlaubt – möglich sind PDF, JPG, PNG, Word, Excel und CSV.</div>}
      {fehler === "ablaufdatum" && <div className="alert alert-red mb-4">Bei dieser Kategorie ist das Ablaufdatum Pflicht – bitte „Gültig bis“ angeben.</div>}
      {sp.mail && <div className={`alert ${sp.mail === "FEHLER" ? "alert-red" : "alert-teal"} mb-4`}>{sp.mail === "TEST" ? "E-Mail im Testmodus protokolliert (SMTP noch nicht hinterlegt)." : sp.mail === "GESENDET" ? "E-Mail gesendet." : "E-Mail-Versand fehlgeschlagen – siehe Mail-Protokoll."}</div>}
      {abgelaufen.length > 0 && <div className="alert alert-red mb-4"><ShieldAlert size={16} className="mt-0.5" /><span><strong>Abgelaufene Nachweise:</strong> {abgelaufen.map((q) => `${q.typ} (${datum(q.gultigBis)})`).join(", ")} – vor dem nächsten Einsatz erneuern.</span></div>}
      {baldAb.length > 0 && <div className="alert alert-amber mb-4"><ShieldAlert size={16} className="mt-0.5" /><span><strong>Läuft bald ab:</strong> {baldAb.map((q) => `${q.typ} (${datum(q.gultigBis)})`).join(", ")}</span></div>}
      {sensibel && amsEndeTage != null && amsEndeTage <= 30 && <div className={`alert ${amsEndeTage < 0 ? "alert-red" : "alert-amber"} mb-4`}><ShieldAlert size={16} className="mt-0.5" /><span><strong>AMS-Förderung {amsEndeTage < 0 ? "abgelaufen" : `endet in ${amsEndeTage} Tagen`}</strong> ({datum(p.amsFoerderungBis)}) – Verlängerung beim AMS prüfen bzw. Kalkulation anpassen.</span></div>}
      {unterMindest && <div className="alert alert-red mb-4"><ShieldAlert size={16} className="mt-0.5" /><span><strong>KV-Mindestlohn unterschritten:</strong> {eur(p.stundenlohn)} liegt unter {eur(mindest!.mindestStundenlohn)} ({p.kv?.name}, {p.beschaeftigungsgruppe}).</span></div>}
      {p.status === "GESPERRT" && (
        <div className="alert alert-red mb-4"><Lock size={16} className="mt-0.5" /><span><strong>Gesperrt seit {datum(p.gesperrtSeit)}</strong>{sensibel ? ` – Grund: ${p.gesperrtGrund ?? "–"}${p.gesperrtVon ? ` (erfasst von ${p.gesperrtVon})` : ""}` : " – Grund nur für berechtigte Rollen sichtbar."}</span></div>
      )}

      <div className="tabs mb-5 overflow-x-auto reveal">
        {(p.status === "VERMITTELT" || p.status === "AUSGESCHIEDEN" ? TABS_MITARBEITER : TABS_BEWERBER).map(([k, l]) => <Link key={k} href={`/personen/${id}?tab=${k}`} className={`tab whitespace-nowrap ${tab === k ? "active" : ""}`}>{l}</Link>)}
      </div>

      {tab === "profil" && (
        <div className="grid lg:grid-cols-3 gap-4">
          <Card title="Stammdaten" className="reveal">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-20 h-20 rounded-2xl bg-brand-soft overflow-hidden flex items-center justify-center text-brand font-display font-extrabold text-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.fotoDokumentId ? <img src={`/dokumente/${p.fotoDokumentId}`} alt="" className="w-full h-full object-cover" /> : <span>{p.vorname.charAt(0)}{p.nachname.charAt(0)}</span>}
              </div>
              {!fremd && <form action={fotoHochladen.bind(null, id)} encType="multipart/form-data" className="text-[12.5px]"><label className="btn btn-secondary btn-sm cursor-pointer"><Camera size={14} /> Foto {p.fotoDokumentId ? "ersetzen" : "hochladen"}<input type="file" name="foto" accept="image/*" className="hidden" onChange={undefined} /></label><button className="btn btn-ghost btn-sm ml-1">Speichern</button></form>}
            </div>
            <Stat label="Geburtsdatum" value={p.geburtsdatum ? datumLang(p.geburtsdatum) : "–"} />
            <Stat label="Staatsangehörigkeit" value={<span>{p.staatsangehoerigkeit ?? <span className="text-red">fehlt</span>}{brauchtArbeitsbewilligung(p.staatsangehoerigkeit) && (p.qualifikationen.some((q) => IST_BEWILLIGUNG.test(q.typ) && (!q.gultigBis || q.gultigBis >= heute)) ? <Badge tone="teal">Arbeitsbewilligung hinterlegt</Badge> : <Badge tone="red">Arbeitsbewilligung fehlt</Badge>)}</span>} />
            <Stat label="Adresse" value={[p.strasse, [p.plz, p.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "–"} />
            <Stat label="SVNR" value={sensibel ? (svnr ?? "–") : <span className="text-muted flex items-center gap-1"><Lock size={12} /> ····{p.svnrLast4 ?? ""}</span>} />
            <Stat label="Beworben am" value={datum(p.aufnahmedatum)} />
            <Stat label="Quelle" value={<span className="flex flex-wrap items-center gap-1">{p.quelle ?? <span className="text-muted">–</span>}{werber && <Link href={`/personen/${werber.id}`} className="badge badge-fox">geworben von {werber.vorname} {werber.nachname}</Link>}</span>} />
            <Stat label="Mobilität" value={<span className="flex flex-wrap gap-1">{p.fuehrerschein ? <Badge tone="teal">Führerschein B</Badge> : <Badge tone="grey">kein Führerschein</Badge>}{p.autoVorhanden ? <Badge tone="teal">Auto</Badge> : <Badge tone="grey">kein Auto</Badge>}{p.maxPendelKm ? <Badge tone="brand">max. {p.maxPendelKm} km</Badge> : null}</span>} />
            <Stat label="Verfügbar" value={p.verfuegbarSofort ? "sofort" : p.verfuegbarAb ? datum(p.verfuegbarAb) : "–"} />
            <Stat label="Hinterlegter Kunde" value={p.hinterlegterKunde ? <Link className="text-brand" href={`/kunden/${p.hinterlegterKunde.id}`}>{p.hinterlegterKunde.firmenname}</Link> : "–"} />
          </Card>
          <Card title="Verlauf – Kommunikation & Änderungen" className="reveal reveal-2" actions={<Link href={`/personen/${id}?tab=historie`} className="text-[12.5px] text-brand font-semibold whitespace-nowrap">Historie</Link>}>
            {(() => {
              const grenze = new Date(Date.now() - 90 * 86400000);
              const alle = p.aktivitaeten;
              const aktuell = alle.filter((x) => x.zeitpunkt >= grenze);
              const zeige = sp.verlauf === "alle" ? alle : aktuell;
              const aeltere = alle.length - aktuell.length;
              const ICON: Record<string, string> = { EMAIL: "✉", PROFIL: "📄", AENDERUNG: "✎", STATUS: "●", EINSATZ: "▶", BEWERTUNG: "🦊", NOTIZ: "✎", ANRUF: "☎", GESPRAECH: "💬", ANGEBOT: "§", RECHNUNG: "€" };
              return zeige.length ? (
                <>
                  <ul className="divide-y divide-line -mx-5 max-h-[420px] overflow-y-auto">{zeige.map((x) => (
                    <li key={x.id} className="px-5 py-2 flex gap-3 text-[13px]">
                      <span className="text-muted w-[42px] shrink-0 text-[11.5px] leading-5">{x.zeitpunkt.toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit", year: "2-digit" })}</span>
                      <span className="w-4 shrink-0 text-center text-muted">{ICON[x.typ] ?? "•"}</span>
                      <span className="flex-1 min-w-0"><span className="break-words">{x.text}</span>{x.nutzerName && <span className="text-muted"> · {x.nutzerName}</span>}</span>
                    </li>
                  ))}</ul>
                  {sp.verlauf !== "alle" && aeltere > 0 && <div className="pt-3"><Link href={`/personen/${id}?tab=profil&verlauf=alle`} className="btn btn-secondary btn-sm w-full justify-center">Ältere Einträge anzeigen ({aeltere})</Link></div>}
                  {sp.verlauf === "alle" && <div className="pt-3"><Link href={`/personen/${id}?tab=profil`} className="btn btn-ghost btn-sm w-full justify-center">Nur letzte 3 Monate</Link></div>}
                </>
              ) : <div className="text-[13px] text-muted">Keine Einträge in den letzten 3 Monaten.{aeltere > 0 && <> <Link href={`/personen/${id}?tab=profil&verlauf=alle`} className="text-brand font-semibold">Ältere Einträge anzeigen ({aeltere})</Link></>}</div>;
            })()}
          </Card>
          <div className="space-y-4">
            <Card title="Aktueller Einsatz" className="reveal reveal-3">
              {aktiverEinsatz ? (
                <div>
                  <div className="font-display font-bold text-[16px]"><Link href={`/kunden/${aktiverEinsatz.kundeId}`} className="hover:text-brand">{aktiverEinsatz.kunde.firmenname}</Link></div>
                  <div className="text-muted text-[13px]">{aktiverEinsatz.rolleImEinsatz} · seit {datum(aktiverEinsatz.von)}{aktiverEinsatz.bis ? ` bis ${datum(aktiverEinsatz.bis)}` : ""}</div>
                  {sensibel && aktiverEinsatz.verrechnungssatz && <div className="mt-3 flex gap-4 text-[13px]"><span>Verrechnung <b className="num">{eur(aktiverEinsatz.verrechnungssatz)}/Std</b></span><span>Lohn <b className="num">{eur(aktiverEinsatz.stundenlohn)}/Std</b></span></div>}
                  {avgSterne && <div className="mt-2 flex items-center gap-2 text-[13px]"><Fuechse n={avgSterne} zahl /> <span className="text-muted">{p.bewertungen.length} Bewertung{p.bewertungen.length !== 1 && "en"}</span></div>}
                </div>
              ) : <p className="text-muted text-[13px]">Kein laufender Einsatz.{p.status === "SUCHT" && " Person ist im Bewerber-Pool."}</p>}
            </Card>
            <Card title="Status ändern" className="reveal reveal-4">
              <form action={personStatus.bind(null, id)} className="space-y-3">
                <select name="status" defaultValue={p.status} className="select">
                  <option value="SUCHT">Bewerber-Pool (sucht)</option>
                  <option value="VERMITTELT">Vermittelt / aktiv</option>
                  {sensibel && <option value="GESPERRT">Sperren</option>}
                  <option value="AUSGESCHIEDEN">Ausgeschieden</option>
                </select>
                {sensibel && <input name="grund" className="input" placeholder="Sperrgrund (nur bei Sperrung, sensibel)" />}
                <button className="btn btn-secondary w-full justify-center">Status übernehmen</button>
              </form>
              {istAdmin(s) && p.status === "AUSGESCHIEDEN" && !p.anonymisiertAm && (
                <form action={personAnonymisieren.bind(null, id)} className="mt-3"><button className="btn btn-danger w-full justify-center">Anonymisieren (Löschkonzept)</button></form>
              )}
              {s.rolle === "SYSTEMADMIN" && (
                <form action={personLoeschen.bind(null, id)} className="mt-3"><button className="btn btn-ghost btn-sm w-full justify-center text-red">Endgültig löschen (nur Systemadmin)</button><p className="help mt-1">Löscht Bewerber/Mitarbeiter samt Einsätzen, Nachweisen und Dokumenten.</p><label className="flex items-start gap-2 mt-2 text-[12px] text-muted"><input type="checkbox" name="erzwingen" value="ja" className="mt-[3px]" /><span>Auch Rechnungspositionen und abgerechnete Monate mitlöschen. Rechnungen werden dabei neu gerechnet, Rechnungen ohne verbleibende Position ganz gelöscht. Nur für Testdaten und echte Fehleingaben – versendete Rechnungen gehören storniert (§ 132 BAO).</span></label></form>
              )}
            </Card>
            {p.notizen && <Card title="Notizen" className="reveal reveal-4"><p className="whitespace-pre-wrap text-[13.5px]">{p.notizen}</p></Card>}
          </div>
        </div>
      )}

      {tab === "onboarding" && (() => { const ob = (p.onboarding as Record<string, string> | null) ?? {}; const done = ONBOARDING.filter((o) => ob[o.key]).length; return (
        <div className="grid lg:grid-cols-3 gap-4">
          <Card title={`Checkliste neue/r Mitarbeiter/in – ${done}/${ONBOARDING.length} erledigt`} className="lg:col-span-2 reveal">
            <form action={onboardingSpeichern.bind(null, id)} className="space-y-5">
              {(["A", "B"] as const).map((g) => (
                <div key={g}>
                  <div className="section-title mb-2">{g === "A" ? "A · Unterlagen von der/dem Mitarbeiter/in" : "B · Unsere Pflichten als Dienstgeber"}</div>
                  <ul className="divide-y divide-line">{ONBOARDING.filter((o) => o.gruppe === g).map((o) => <li key={o.key} className="py-2.5 flex items-start gap-3"><input type="checkbox" name={`ob_${o.key}`} defaultChecked={!!ob[o.key]} className="mt-1" disabled={fremd} /><div className="flex-1"><div className="text-[13.5px]">{o.text}</div>{o.hinweis && <div className="text-[12px] text-muted">{o.hinweis}</div>}</div>{ob[o.key] && <span className="text-[12px] text-teal num">{datum(ob[o.key])}</span>}</li>)}</ul>
                </div>
              ))}
              {!fremd && <button className="btn btn-primary">Checkliste speichern</button>}
            </form>
          </Card>
          <div className="space-y-4">
            <div className="kpi reveal reveal-2"><div className="label">Vollständigkeit</div><div className={`value ${done === ONBOARDING.length ? "text-teal" : done < 8 ? "text-red" : ""}`}>{Math.round((done / ONBOARDING.length) * 100)} %</div><div className="sub">{ONBOARDING.length - done} Punkte offen</div></div>
            <Card title="Hinweise" className="reveal reveal-3"><ul className="text-[13px] space-y-2 text-ink-2"><li>ÖGK-Anmeldung muss <b>vor</b> Arbeitsantritt erfolgen – die Wiedervorlage erscheint automatisch 7 Tage vor Einsatzbeginn.</li><li>Aufenthaltstitel bitte zusätzlich als Qualifikation mit Ablaufdatum erfassen, damit die Erinnerung greift.</li><li>Unterschriebene Verträge unter „Dokumente“ ablegen (Portal-Freigabe für den Mitarbeiter).</li></ul></Card>
          </div>
        </div>
      ); })()}

      {tab === "qualifikationen" && (
        <div className="grid lg:grid-cols-3 gap-4">
          <Card title="Qualifikationsnachweise" pad={false} className="lg:col-span-2 reveal">
            {p.qualifikationen.length ? (
              <table className="table"><thead><tr><th>Nachweis</th><th>Nummer / Bezeichnung</th><th>Ausgestellt</th><th>Gültig bis</th><th>Status</th><th></th></tr></thead>
                <tbody>{p.qualifikationen.map((q) => {
                  const st = !q.gultigBis ? <Badge tone="teal">unbefristet</Badge> : q.gultigBis < heute ? <Badge tone="red">abgelaufen</Badge> : q.gultigBis < new Date(heute.getTime() + q.erinnerungTageVorher * 86400000) ? <Badge tone="amber">läuft ab</Badge> : <Badge tone="teal">gültig</Badge>;
                  return <tr key={q.id}><td className="font-semibold">{q.typ}{q.notiz && <div className="text-[12px] text-muted font-normal">{q.notiz}</div>}</td><td>{q.nummer ?? "–"}{q.bezeichnung && <div className="text-[12px] text-muted">{q.bezeichnung}</div>}</td><td>{datum(q.ausgestelltAm)}</td><td>{datum(q.gultigBis)}</td><td>{st}{q.dokumentId && <a href={`/dokumente/${q.dokumentId}`} className="ml-2 text-brand inline-flex"><FileDown size={14} /></a>}</td><td className="r"><form action={qualifikationLoeschen.bind(null, id, q.id)}><button className="btn btn-ghost btn-sm text-red">Entfernen</button></form></td></tr>;
                })}</tbody></table>
            ) : <Empty title="Noch keine Nachweise" text="Führerschein, Staplerschein, Arbeitserlaubnis, Sicherheitsunterweisung … mit Ablaufdatum – das System erinnert automatisch." />}
          </Card>
          <Card title="Nachweis hinzufügen" className="reveal reveal-2">
            <form action={qualifikationAnlegen.bind(null, id)} className="space-y-3" encType="multipart/form-data">
              <Field label="Typ" required help="Ausweis, Aufenthaltstitel und Arbeitserlaubnis gehören unter Dokumente – dort wird das Ablaufdatum überwacht."><input name="typ" list="qtypen" required className="input" placeholder="z. B. Staplerschein" /><datalist id="qtypen">{QUALIFIKATIONSTYPEN.map((t) => <option key={t} value={t} />)}</datalist></Field>
              <Field label="Nachweis-Nummer"><input name="nummer" className="input" placeholder="z. B. Zertifikats-/Ausweisnummer" /></Field>
              <Field label="Bezeichnung lt. Nachweis" help="Genauer Titel und Aussteller, z. B. „Staplerschein Klasse Gegengewicht, TÜV Austria“."><input name="bezeichnung" className="input" /></Field>
              <div className="grid grid-cols-2 gap-3"><Field label="Ausgestellt"><input type="date" name="ausgestelltAm" className="input" /></Field><Field label="Gültig bis"><input type="date" name="gultigBis" className="input" /></Field></div>
              <Field label="Erinnerung (Tage vorher)"><input name="erinnerung" defaultValue={60} className="input num" /></Field>
              <Field label="Scan / Foto"><input type="file" name="datei" className="input" /></Field>
              <Field label="Notiz"><input name="notiz" className="input" /></Field>
              <button className="btn btn-primary w-full justify-center">Speichern</button>
            </form>
          </Card>
        </div>
      )}

      {tab === "kundenprofil" && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <Card title="Werdegang – bisherige Arbeiten und Zeiträume" className="reveal"
              actions={<a href={`/personen/${id}/profil`} target="_blank" className="btn btn-secondary btn-sm"><FileDown size={14} /> Profil ansehen</a>}>
              <p className="help mb-3">Steht im Kundenprofil unter „Werdegang“. Eine Zeile je Station – leere Zeilen werden beim Speichern übergangen.</p>
              <form action={werdegangNurSpeichern.bind(null, id)}>
                <WerdegangTabelle start={p.berufserfahrung} />
                <button className="btn btn-primary mt-3">Werdegang speichern</button>
              </form>
            </Card>
            <Card title="An wen ging das Profil?" pad={false} className="reveal reveal-2">
              {p.profilVersand.length ? (
                <table className="table">
                  <thead><tr><th>Kunde</th><th>Gesendet</th><th>An</th><th>Rückmeldung</th><th></th></tr></thead>
                  <tbody>{p.profilVersand.map((v) => (
                    <tr key={v.id}>
                      <td><Link href={`/kunden/${v.kundeId}`} className="row-link">{v.kunde.firmenname}</Link></td>
                      <td className="whitespace-nowrap">{datum(v.gesendetAm)} <span className="text-muted">{v.gesendetAm.toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" })}</span><div className="text-[11.5px] text-muted">{v.gesendetVon}</div></td>
                      <td className="text-[12.5px]">{v.an ?? <span className="text-muted">nur abgelegt</span>}</td>
                      <td className="text-[12.5px]">{v.rueckmeldungAm ? <span className="text-teal">{v.rueckmeldung} · {datum(v.rueckmeldungAm)}</span> : <span className="text-amber">offen</span>}</td>
                      <td className="r">
                        {!v.rueckmeldungAm && (
                          <form action={profilRueckmeldung.bind(null, id, v.id)} className="flex gap-1 justify-end">
                            <select name="rueckmeldung" className="select !w-auto !py-1 text-[12px]"><option>Interesse</option><option>Vorstellungstermin</option><option>Absage</option><option>Keine Rückmeldung</option></select>
                            <button className="btn btn-ghost btn-sm">Festhalten</button>
                          </form>
                        )}
                        {v.dokumentId && <a href={`/dokumente/${v.dokumentId}`} className="btn btn-ghost btn-sm">PDF</a>}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              ) : <Empty title="Noch nicht versendet" text="Sobald ein Profil an einen Beschäftiger geht, steht es hier mit Uhrzeit und Rückmeldung." />}
            </Card>
          </div>
          <div className="space-y-4">
            {sp.gesendet && <div className={`alert ${sp.gesendet === "FEHLER" ? "alert-red" : sp.gesendet === "TEST" ? "alert-amber" : "alert-teal"}`}>{sp.gesendet === "GESENDET" ? "Profil versendet und abgelegt." : sp.gesendet === "TEST" ? "Testmodus: protokolliert, nicht zugestellt. Abgelegt ist es trotzdem." : sp.gesendet === "OHNE_MAIL" ? "Ohne E-Mail abgelegt – keine Adresse hinterlegt." : "Versand fehlgeschlagen – siehe Mail-Protokoll."}</div>}
            {sp.ok === "werdegang" && <div className="alert alert-teal">Werdegang gespeichert.</div>}
            <Card title="Profil an Beschäftiger senden" className="reveal reveal-2">
              <form action={profilSenden.bind(null, id)} className="space-y-3">
                <Field label="Kunde" required>
                  <select name="kundeId" required className="select" defaultValue={p.hinterlegterKundeId ?? ""}><option value="">– wählen –</option>{alleKunden.map((k) => <option key={k.id} value={k.id}>{k.firmenname}</option>)}</select>
                </Field>
                <Field label="E-Mail" help="Leer = Ansprechpartner mit Rolle Disposition. Ohne Adresse wird das Profil nur abgelegt."><input name="an" type="email" className="input" /></Field>
                <Field label="Nachricht" help="Leer = Standardtext mit der beim Ansprechpartner hinterlegten Anrede."><textarea name="text" rows={4} className="textarea" /></Field>
                <button className="btn btn-primary w-full justify-center">Profil senden & ablegen</button>
                <p className="help">Das PDF wird beim Mitarbeiter und beim Kunden abgelegt. In drei Tagen erinnert die Software an die Rückmeldung.</p>
              </form>
            </Card>
          </div>
        </div>
      )}

      {tab === "einsaetze" && (
        <div className="space-y-4">
          <Card title="Einsätze" pad={false} className="reveal" actions={<Link href={`/einsaetze/neu?personId=${id}`} className="btn btn-primary btn-sm"><Plus size={14} /> Neuer Einsatz</Link>}>
            {p.einsaetze.length ? (
              <table className="table"><thead><tr><th>Kunde</th><th>Rolle im Einsatz</th><th>Von</th><th>Bis</th><th>Status</th><th>Auflösungsart</th>{sensibel && <th className="r">Satz / Lohn</th>}</tr></thead>
                <tbody>{p.einsaetze.map((e) => <tr key={e.id}>
                  <td><Link href={`/einsaetze/${e.id}`} className="row-link">{e.kunde.firmenname}</Link></td>
                  <td>{e.rolleImEinsatz}</td>
                  <td className="whitespace-nowrap">{datum(e.von)}</td>
                  <td className="whitespace-nowrap">{e.bis ? datum(e.bis) : <span className="text-muted">offen</span>}</td>
                  <td>{einsatzStatusBadge(e.status)}</td>
                  <td className="text-[12.5px]">{e.aufloesungsart ?? <span className="text-muted">–</span>}</td>
                  {sensibel && <td className="r num">{eur(e.verrechnungssatz)} / {eur(e.stundenlohn)}</td>}
                </tr>)}</tbody></table>
            ) : <Empty title="Noch kein Einsatz" text="Hier stehen alle Einsätze mit Zeitraum, Kunde und Auflösungsart." action={<Link href={`/einsaetze/neu?personId=${id}`} className="btn btn-primary btn-sm">Neuer Einsatz</Link>} />}
          </Card>
          <div className="grid lg:grid-cols-3 gap-4"><div className="lg:col-span-2 space-y-4">
          {sensibel && (
            <Card title={`Verrechnung & ${prov ? "Provision" : "DB1"} ${jahr}`} pad={false} className="reveal reveal-2">
              {meine.length ? (
                <table className="table"><thead><tr><th>Kunde</th><th className="r">Verrechnung</th>{!prov && <><th className="r">Bruttolohn</th><th className="r">DG-Abgaben</th></>}<th className="r">{prov ? "Provision" : "DB1"}</th>{!prov && <th className="r">Marge</th>}</tr></thead>
                  <tbody>{meine.map((m) => <tr key={m.kundeId}><td className="font-semibold">{m.kunde}</td><td className="r num">{eur(m.verrechnungJahr)}</td>{!prov && <><td className="r num">{eur(m.selbstkostenJahr)}</td><td className="r num">{eur(m.abgabenRueckstellungenJahr)}</td></>}<td className={`r num font-bold ${m.db1Jahr < 0 ? "text-red" : "text-teal"}`}>{prov && !c.kosten ? "–" : eur(prov ? m.provisionJahr : m.db1Jahr)}</td>{!prov && <td className="r num">{pct(m.db1Marge)}</td>}</tr>)}</tbody></table>
              ) : <p className="text-muted text-[13px] p-5">Noch keine Monatswerte in {jahr}. <Link href="/abrechnung" className="text-brand font-semibold">Zur Monatsabrechnung</Link></p>}
            </Card>
          )}
          </div>
          <Card title="Dienstvertrag & Entgelt" className="reveal reveal-3">
            <p className="help mb-2">Wird beim Einsatz erfasst (Einsatz → bearbeiten).</p>
            <Stat label="Kollektivvertrag" value={p.kv?.name ?? "–"} />
            <Stat label="Beschäftigungsgruppe" value={p.beschaeftigungsgruppe ?? "–"} />
            {sensibel && <Stat label="Bruttostundenlohn" value={<span className={unterMindest ? "text-red" : ""}>{eur(p.stundenlohn)}</span>} />}
            {sensibel && mindest && <Stat label="KV-Mindestlohn" value={mindest.mindestStundenlohn != null ? eur(mindest.mindestStundenlohn) + "/Std" : eur(mindest.mindestMonatsbrutto) + "/Monat"} />}
            <Stat label="Wochenstunden" value={p.wochenstunden ?? "–"} />
            <Stat label="Eintritt / Austritt" value={`${datum(p.eintrittsdatum)} / ${datum(p.austrittsdatum)}`} />
            <Stat label="Arbeiter / Angestellte" value={p.angestellt ? "Angestellte/r (AngG)" : "Arbeiter/in (KV AKÜ)"} />
            {fr && p.status === "VERMITTELT" && <Stat label="Kündigung durch DG heute" value={<Link href={`/personen/${id}?tab=fristen`} className="text-brand">{fristText(fr.dgStufe.frist)} → Ende {datum(fr.dgEndeHeute)}</Link>} />}
            <Stat label={`Resturlaub ${jahr}`} value={ul.aktiv ? <span className={ul.rest < 2 ? "text-amber" : ""}>{tg(ul.rest)} von {tg(ul.erworben)} freigeschalteten Tagen ({ul.monate} Monate × {tg(ul.proMonat)})</span> : <span className="text-muted">kein aktives Dienstverhältnis</span>} />
            <Stat label={`Krankenstand ${jahr}`} value={`${krank} Tage`} />
            {sensibel && <Stat label="AMS-Förderung" value={p.amsGefoerdert ? <span className="text-teal font-semibold">{eur(p.amsFoerderungBetrag ?? 0)}/Monat{p.amsFoerderungArt ? ` · ${p.amsFoerderungArt}` : ""}{p.amsFoerderungBis ? ` · bis ${datum(p.amsFoerderungBis)}` : ""}</span> : "keine"} />}
            {p.status === "VERMITTELT" && <Stat label="Krankenstand letzte 365 Tage" value={<span className={krank365 > 10 ? "text-red" : ""}>{krank365} Tage</span>} />}
          </Card>
          </div>
        </div>
      )}

      {tab === "abwesenheiten" && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <div className="grid grid-cols-3 gap-3 reveal">
              <div className="kpi"><div className="label">Urlaub freigeschaltet {jahr}</div><div className="value">{tg(ul.erworben)}</div><div className="sub">{ul.aktiv ? `${ul.monate} Monate × ${tg(ul.proMonat)} Tage (${p.urlaubsanspruchTage}/Jahr)` : "nur aktive Mitarbeiter"}</div></div>
              <div className="kpi"><div className="label">Resturlaub {jahr}</div><div className={`value ${ul.rest < 0 ? "text-red" : ul.rest < 2 ? "text-amber" : "text-teal"}`}>{tg(ul.rest)}</div><div className="sub">{urlaubGenommen} Tage genommen{ul.rest < 0 ? " – Vorgriff" : ""}</div></div>
              <div className="kpi"><div className="label">Krankenstand {jahr} / 365 Tage</div><div className={`value ${krank365 > 10 ? "text-red" : ""}`}>{krank} <span className="text-muted text-[16px]">/ {krank365}</span></div><div className="sub">Tage im Jahr / rollierend 365 Tage</div></div>
            </div>
            <Card title="Abwesenheiten" pad={false} className="reveal reveal-2">
              {p.abwesenheiten.length ? <table className="table"><thead><tr><th>Typ</th><th>Von</th><th>Bis</th><th className="r">Tage</th><th>Status</th><th>Notiz</th><th></th></tr></thead><tbody>{p.abwesenheiten.map((a) => <tr key={a.id}><td>{a.typ === "URLAUB" ? <Badge tone="brand">Urlaub</Badge> : a.typ === "KRANKENSTAND" ? <Badge tone="red">Krankenstand</Badge> : a.notiz?.includes("Zeitausgleich") ? <Badge tone="amber">Zeitausgleich</Badge> : <Badge tone="grey">{a.typ === "PFLEGEFREISTELLUNG" ? "Pflegefreistellung" : "Sonstiges"}</Badge>}{a.quelle === "APP" && <div className="text-[10.5px] text-muted">über App</div>}</td><td>{datum(a.von)}</td><td>{datum(a.bis)}</td><td className="r num">{a.tage}</td><td>{a.status === "BEANTRAGT" ? <Badge tone="amber">beantragt</Badge> : a.status === "ABGELEHNT" ? <Badge tone="red">abgelehnt</Badge> : <Badge tone="teal">{a.typ === "URLAUB" ? "genehmigt" : "gemeldet"}</Badge>}</td><td className="text-muted">{a.notiz}{a.dokumentId && <a href={`/dokumente/${a.dokumentId}`} target="_blank" className="text-brand ml-1">Nachweis</a>}</td><td className="r whitespace-nowrap">{a.status === "BEANTRAGT" && sensibel && <><form action={abwesenheitEntscheiden.bind(null, id, a.id, "GENEHMIGT")} className="inline"><button className="btn btn-primary btn-sm">Genehmigen</button></form><form action={abwesenheitEntscheiden.bind(null, id, a.id, "ABGELEHNT")} className="inline ml-1"><button className="btn btn-ghost btn-sm text-red">Ablehnen</button></form></>}</td></tr>)}</tbody></table> : <Empty title="Keine Abwesenheiten erfasst" />}
            </Card>
          </div>
          <Card title="Abwesenheit erfassen" className="reveal reveal-3">
            <form action={abwesenheitAnlegen.bind(null, id)} className="space-y-3">
              <Field label="Typ"><select name="typ" className="select"><option value="URLAUB">Urlaub</option><option value="KRANKENSTAND">Krankenstand</option><option value="PFLEGEFREISTELLUNG">Pflegefreistellung</option><option value="SONSTIGES">Sonstiges</option></select></Field>
              <div className="grid grid-cols-2 gap-3"><Field label="Von" required><input type="date" name="von" required className="input" /></Field><Field label="Bis"><input type="date" name="bis" className="input" /></Field></div>
              <Field label="Tage" help="Leer lassen = Kalendertage"><input name="tage" className="input num" inputMode="decimal" /></Field>
              <Field label="Notiz"><input name="notiz" className="input" /></Field>
              <button className="btn btn-primary w-full justify-center">Speichern</button>
            </form>
          </Card>
        </div>
      )}

      {tab === "bewertungen" && (
        <div className="grid lg:grid-cols-3 gap-4">
          <Card title="Referenz- & Bewertungshistorie" className="lg:col-span-2 reveal">
            {p.bewertungen.length ? (
              <ul className="divide-y divide-line">{p.bewertungen.map((b) => (
                <li key={b.id} className="py-3 flex gap-4">
                  <div className="shrink-0"><Fuechse n={b.sterne} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-semibold">{b.kunde?.firmenname ?? "Allgemein"} <span className="text-muted font-normal">· {datum(b.datum)} · {b.erfasstVon}</span></div>
                    <MerkmalChips merkmale={b.merkmale} />
                    {b.kommentar && <p className="text-[13.5px] mt-0.5">{b.kommentar}</p>}
                  </div>
                  {b.wiedereinsatzEmpfohlen ? <Badge tone="teal">Wiedereinsatz ja</Badge> : <Badge tone="red">Kein Wiedereinsatz</Badge>}
                  {s.rolle === "SYSTEMADMIN" && <form action={bewertungLoeschen.bind(null, id, b.id, "MA")}><button className="btn btn-ghost btn-sm text-red">Löschen</button></form>}
                </li>
              ))}</ul>
            ) : <Empty title="Noch keine Bewertung" text="Nach jedem Einsatz kurz festhalten, wie es beim Kunden lief – entscheidend für Wiedereinsatz-Entscheidungen." />}
          </Card>
          <Card title="So bewertet der Mitarbeiter seine Beschäftiger" className="lg:col-span-2 reveal reveal-2">
            {p.kundenBewertungen.length ? <ul className="divide-y divide-line">{p.kundenBewertungen.map((b) => <li key={b.id} className="py-2.5 flex gap-3 text-[13.5px]"><Fuechse n={b.sterne} /><div className="flex-1"><Link href={`/kunden/${b.kundeId}`} className="font-semibold hover:text-brand">{b.kunde.firmenname}</Link><span className="text-muted text-[12px]"> · {datum(b.datum)} · {b.quelle === "PORTAL" ? "Portal" : "intern"}</span><MerkmalChips merkmale={b.merkmale} />{b.kommentar && <p className="mt-0.5">{b.kommentar}</p>}</div>{b.wiederArbeiten ? <Badge tone="teal">würde wieder</Badge> : <Badge tone="red">nicht wieder</Badge>}{s.rolle === "SYSTEMADMIN" && <form action={bewertungLoeschen.bind(null, id, b.id, "KUNDE")}><button className="btn btn-ghost btn-sm text-red">Löschen</button></form>}</li>)}</ul> : <p className="text-muted text-[13px]">Noch keine Rückmeldung – Mitarbeiter können ihren Beschäftiger in der Mitarbeiter-App bewerten oder ihr erfasst die Rückmeldung beim Kunden unter „Bewertungen“.</p>}
          </Card>
          <Card title="Bewertung erfassen" className="reveal reveal-2">
            <form action={bewertungAnlegen.bind(null, id)} className="space-y-3">
              <Field label="Kunde"><select name="kundeId" className="select" defaultValue={aktiverEinsatz?.kundeId ?? ""}><option value="">Allgemein</option>{kunden.map((k) => <option key={k.id} value={k.id}>{k.firmenname}</option>)}</select></Field>
              <BewertungFelder ziel="MITARBEITER" kompakt kommentarPlaceholder="Wie lief der Einsatz? Rückmeldung des Kunden, Besonderheiten …" />
              <label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" name="wiedereinsatz" defaultChecked /> Wiedereinsatz empfohlen</label>
              <button className="btn btn-primary w-full justify-center">Speichern</button>
            </form>
          </Card>
        </div>
      )}

      {tab === "sperren" && (
        <div className="grid lg:grid-cols-3 gap-4">
          <Card title="Sperren" pad={false} className="lg:col-span-2 reveal">
            {sperren.length ? (
              <table className="table"><thead><tr><th>Grund</th><th>Gilt für</th><th>ab</th><th>bis</th><th>Notiz</th><th></th></tr></thead>
                <tbody>{sperren.map((sp) => (
                  <tr key={sp.id}>
                    <td className="font-semibold">{sp.grund?.bezeichnung ?? "–"}{sp.grund?.sperrtEinsatz === false && <Badge tone="amber">nur Hinweis</Badge>}</td>
                    <td>{sp.kunde ? <Link href={`/kunden/${sp.kunde.id}`} className="row-link">{sp.kunde.firmenname}</Link> : <Badge tone="red">alle Kunden</Badge>}</td>
                    <td className="whitespace-nowrap">{datum(sp.ab)}</td>
                    <td className="whitespace-nowrap">{sp.bis ? datum(sp.bis) : "unbefristet"}</td>
                    <td className="text-[12.5px] text-muted max-w-[240px]">{sp.notiz}{sp.erfasstVon ? <div className="text-[11.5px]">erfasst von {sp.erfasstVon}</div> : null}</td>
                    <td className="r"><form action={sperreAufheben.bind(null, id, sp.id)}><button className="btn btn-ghost btn-sm text-red">Aufheben</button></form></td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <Empty title="Keine Sperre" text="Der Mitarbeiter kann überall eingesetzt werden. Sperren wirken sofort in der Einsatzprüfung – generell oder nur bei einem bestimmten Beschäftiger." />}
          </Card>
          <Card title="Sperre erfassen" className="reveal reveal-2">
            <form action={sperreAnlegen.bind(null, id)} className="space-y-3">
              <Field label="Grund" required><select name="grundId" required className="select"><option value="">– wählen –</option>{sperrgruende.map((g) => <option key={g.id} value={g.id}>{g.bezeichnung}</option>)}</select></Field>
              <Field label="Gilt für" help="Leer = generelle Sperre. Der Mitarbeiter wird dann auf „Gesperrt“ gesetzt."><select name="kundeId" className="select"><option value="">alle Kunden (generell)</option>{kunden.map((k) => <option key={k.id} value={k.id}>{k.firmenname}</option>)}</select></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="ab"><input type="date" name="ab" className="input" /></Field>
                <Field label="bis (optional)"><input type="date" name="bis" className="input" /></Field>
              </div>
              <Field label="Notiz"><textarea name="notiz" rows={2} className="textarea" placeholder="Was genau ist vorgefallen? Nur sachlich und nachvollziehbar dokumentieren." /></Field>
              <button className="btn btn-primary w-full justify-center">Sperre speichern</button>
            </form>
            <p className="help mt-2">Der Sperrgrund-Katalog wird zentral gepflegt – so sind Auswertungen möglich und niemand schreibt Freitext, den später keiner mehr versteht.</p>
          </Card>
        </div>
      )}

      {tab === "dokumente" && (
        <div className="grid lg:grid-cols-3 gap-4">
          <Card title="Dokumente" pad={false} className="lg:col-span-2 reveal">
            {p.dokumente.length ? <table className="table"><thead><tr><th>Dokument</th><th>Kategorie</th><th>Portal</th><th>Hochgeladen</th><th></th></tr></thead><tbody>{p.dokumente.map((d) => <tr key={d.id}><td className="font-semibold">{d.dateiname}<div className="text-[12px] text-muted font-normal">{Math.round(d.groesse / 1024)} KB</div></td><td><Badge tone="grey">{d.kategorie}</Badge></td><td>{d.sichtbarImPortal ? <Badge tone="teal">sichtbar</Badge> : <span className="text-muted">–</span>}{!d.geprueft && <Badge tone="amber">ungeprüft (App)</Badge>}</td><td className="text-muted">{datum(d.hochgeladenAm)} · {d.hochgeladenVon}</td><td className="r whitespace-nowrap">{!d.geprueft && <form action={dokumentGeprueft.bind(null, id, d.id)} className="inline"><button className="btn btn-secondary btn-sm">Geprüft</button></form>}<a href={`/dokumente/${d.id}`} className="btn btn-ghost btn-sm ml-1"><FileDown size={14} /> Öffnen</a>{s.rolle === "SYSTEMADMIN" && <form action={dokumentLoeschen.bind(null, id, d.id)} className="inline ml-2"><button className="btn btn-ghost btn-sm text-red">Löschen</button></form>}</td></tr>)}</tbody></table> : <Empty title="Keine Dokumente" text="Lohnzettel, Dienstverträge, Einsatzbestätigungen – mit Freigabe fürs Mitarbeiter-Portal." />}
          </Card>
          <div className="space-y-4">
            <Card title="Dokument hochladen" className="reveal reveal-2">
              <form action={dokumentHochladen.bind(null, id)} className="space-y-3" encType="multipart/form-data">
                <Field label="Datei" required><input type="file" name="datei" required className="input" /></Field>
                <Field label="Kategorie"><select name="kategorie" className="select">{KATEGORIEN.map((k) => <option key={k}>{k}</option>)}</select></Field>
                <Field label="Gültig bis" help="Pflicht bei Reisepass, Personalausweis, Aufenthaltstitel, Arbeitserlaubnis und Führerschein – daraus kommt die Erinnerung vor dem Ablauf."><input type="date" name="gultigBis" className="input" /></Field>
                <label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" name="portal" defaultChecked /> Im Mitarbeiter-Portal sichtbar</label>
                <button className="btn btn-primary w-full justify-center">Hochladen</button>
              </form>
            </Card>
            <Card title="Mitarbeiter-Portal" className="reveal reveal-3">
              <p className="text-[13px] text-muted mb-3">Sicherer Zugang per E-Mail-Link (gültig 7 Tage) zu allen freigegebenen Dokumenten.</p>
              <form action={`/portal/einladen/${id}`} method="post"><button className="btn btn-secondary w-full justify-center" disabled={!p.email}>{p.email ? "Portal-Link senden" : "Keine E-Mail hinterlegt"}</button></form>
            </Card>
            {sensibel && (
              <Card title="Mitarbeiter-App" className="reveal reveal-4">
                <Stat label="Zuletzt aktiv" value={p.appZuletztAktiv ? datum(p.appZuletztAktiv) : <span className="text-muted">noch nie angemeldet</span>} />
                <Stat label="Datenschutz bestätigt" value={p.datenschutzAkzeptiertAm ? `${datum(p.datenschutzAkzeptiertAm)}${p.datenschutzVersion ? ` (Fassung ${p.datenschutzVersion})` : ""}` : <span className="text-amber">offen</span>} />
                <Stat label="Zugang" value={p.appGesperrtAm ? <Badge tone="red">gesperrt seit {datum(p.appGesperrtAm)}</Badge> : <Badge tone="teal">offen</Badge>} />
                <form action={appEinladungSenden.bind(null, id)} className="mt-3">
                  <button className="btn btn-primary w-full justify-center" disabled={!p.email}>{p.email ? (p.appZuletztAktiv ? "Einladung erneut senden" : "Einladung zur App senden") : "Keine E-Mail hinterlegt"}</button>
                </form>
                <p className="help mt-2">Schickt eine E-Mail mit dem Link zur App, der Anleitung zum Anmelden und dem Hinweis, dass die Krankmeldung telefonisch läuft.</p>
                <form action={appZugangSchalten.bind(null, id, !p.appGesperrtAm)} className="mt-3">
                  <button className={`btn w-full justify-center ${p.appGesperrtAm ? "btn-secondary" : "btn-ghost text-red"}`}>{p.appGesperrtAm ? "Zugang wieder freigeben" : "Zugang sperren (alle Geräte abmelden)"}</button>
                </form>
                <p className="help mt-2">Beim Sperren werden offene Anmeldecodes und alle Benachrichtigungs-Geräte gelöscht; eine laufende Sitzung endet beim nächsten Aufruf sofort.</p>
              </Card>
            )}
            {p.vertraege.length > 0 && <Card title="Verträge" className="reveal reveal-4"><ul className="divide-y divide-line">{p.vertraege.map((v) => <li key={v.id} className="py-2 text-[13.5px] flex justify-between"><Link href={`/vertraege/${v.id}`} className="font-semibold hover:text-brand">{v.nummer}</Link><span className="text-muted">{v.status}</span></li>)}</ul></Card>}
          </div>
        </div>
      )}

      {tab === "lohnzettel" && (() => {
        const lohnzettel = p.dokumente.filter((d) => (d.kategorie ?? "").trim().toLowerCase() === "lohnzettel");
        return (
          <div className="grid lg:grid-cols-3 gap-4">
            <Card title={`Lohnzettel (${lohnzettel.length})`} pad={false} className="lg:col-span-2 reveal">
              {lohnzettel.length ? (
                <table className="table"><thead><tr><th>Lohnzettel</th><th>App</th><th>Abgelegt</th><th></th></tr></thead><tbody>
                  {lohnzettel.map((d) => (
                    <tr key={d.id}>
                      <td className="font-semibold">{d.dateiname}<div className="text-[12px] text-muted font-normal">{Math.round(d.groesse / 1024)} KB</div></td>
                      <td>{d.sichtbarImPortal ? <Badge tone="teal">in der App sichtbar</Badge> : <Badge tone="grey">nur intern</Badge>}</td>
                      <td className="text-muted">{datum(d.hochgeladenAm)} · {d.hochgeladenVon}</td>
                      <td className="r whitespace-nowrap"><a href={`/dokumente/${d.id}`} className="btn btn-ghost btn-sm"><FileDown size={14} /> Öffnen</a>{s.rolle === "SYSTEMADMIN" && <form action={dokumentLoeschen.bind(null, id, d.id)} className="inline ml-2"><button className="btn btn-ghost btn-sm text-red">Löschen</button></form>}</td>
                    </tr>
                  ))}
                </tbody></table>
              ) : <Empty title="Noch keine Lohnzettel" text="Hier liegen alle Lohnzettel des Mitarbeiters – hochgeladen aus der Lohnverrechnung, für den Mitarbeiter in der App unter „Lohn“ sichtbar." />}
            </Card>
            <Card title="Lohnzettel hochladen" className="reveal reveal-2">
              <form action={dokumentHochladen.bind(null, id)} className="space-y-3" encType="multipart/form-data">
                <input type="hidden" name="kategorie" value="Lohnzettel" />
                <input type="hidden" name="zielTab" value="lohnzettel" />
                <Field label="Datei (PDF)" required><input type="file" name="datei" required accept="application/pdf,image/*" className="input" /></Field>
                <label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" name="portal" defaultChecked /> Für den Mitarbeiter in der App sichtbar</label>
                <button className="btn btn-primary w-full justify-center">Hochladen</button>
                <p className="help">Der Mitarbeiter bekommt eine Push-Nachricht und findet den Lohnzettel in der App unter „Lohn“. Die Ablage erscheint auch in der Historie.</p>
              </form>
            </Card>
          </div>
        );
      })()}

      {tab === "zeitkonto" && zk && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              <div className="kpi reveal"><div className="label">Saldo Zeitkonto</div><div className={`value ${zk.saldo < 0 ? "text-red" : zk.saldo > 40 ? "text-amber" : "text-teal"}`}>{zk.saldo > 0 ? "+" : ""}{zk.saldo.toLocaleString("de-AT")} h</div><div className="sub">Ist − Soll + Buchungen</div></div>
              <div className="kpi reveal reveal-2"><div className="label">Soll im Zeitraum</div><div className="value">{Math.round(zk.sollGesamt)} h</div><div className="sub">aus Wochenraster (X)</div></div>
              <div className="kpi reveal reveal-3"><div className="label">Ist erfasst</div><div className="value">{Math.round(zk.istGesamt)} h</div><div className="sub">Monatsabrechnung</div></div>
              <div className="kpi reveal reveal-4"><div className="label">Durchrechnung endet</div><div className={`value ${zk.tageBisEnde < 60 ? "text-amber" : ""}`}>{datum(zk.ende)}</div><div className="sub">{zk.tageBisEnde >= 0 ? `in ${zk.tageBisEnde} Tagen` : "abgelaufen"} · seit {datum(zk.start)}</div></div>
            </div>
            <Card title="Monate im Durchrechnungszeitraum" pad={false} className="reveal reveal-2">
              {zk.monate.length ? <table className="table"><thead><tr><th>Monat</th><th className="r">Soll</th><th className="r">Ist</th><th className="r">Differenz</th></tr></thead><tbody>{zk.monate.map((m) => <tr key={`${m.jahr}-${m.monat}`}><td>{String(m.monat).padStart(2, "0")}/{m.jahr}</td><td className="r num">{m.soll}</td><td className="r num">{m.ist}</td><td className={`r num font-semibold ${m.saldo < 0 ? "text-red" : m.saldo > 0 ? "text-teal" : "text-muted"}`}>{m.saldo > 0 ? "+" : ""}{m.saldo}</td></tr>)}</tbody></table> : <Empty title="Noch keine Monate im Zeitraum" />}
            </Card>
            <Card title="Buchungen" pad={false} className="reveal reveal-3">
              {p.zeitbuchungen.length ? <table className="table"><thead><tr><th>Datum</th><th>Typ</th><th className="r">Stunden</th><th>Notiz</th></tr></thead><tbody>{p.zeitbuchungen.map((b) => <tr key={b.id}><td>{datum(b.datum)}</td><td>{({ KORREKTUR: "Korrektur", ZEITAUSGLEICH: "Zeitausgleich", AUSZAHLUNG: "Auszahlung", UEBERTRAG: "Übertrag" })[b.typ]}</td><td className={`r num font-semibold ${b.stunden < 0 ? "text-red" : "text-teal"}`}>{b.stunden > 0 ? "+" : ""}{b.stunden}</td><td className="text-muted">{b.notiz ?? "–"}</td></tr>)}</tbody></table> : <p className="text-muted text-[13px] p-5">Noch keine Buchungen.</p>}
            </Card>
          </div>
          {sensibel && (
            <Card title="Buchung erfassen" className="reveal reveal-2">
              <form action={zeitbuchungAnlegen.bind(null, id)} className="space-y-3">
                <Field label="Typ"><select name="typ" className="select"><option value="ZEITAUSGLEICH">Zeitausgleich (baut Konto ab)</option><option value="AUSZAHLUNG">Auszahlung Mehrstunden (baut Konto ab)</option><option value="KORREKTUR">Korrektur (+/−)</option><option value="UEBERTRAG">Übertrag aus Vorperiode (+/−)</option></select></Field>
                <Field label="Stunden" required><input name="stunden" required className="input num" inputMode="decimal" placeholder="z. B. 8" /></Field>
                <Field label="Datum"><input type="date" name="datum" defaultValue={new Date().toISOString().slice(0, 10)} className="input" /></Field>
                <Field label="Notiz"><input name="notiz" className="input" /></Field>
                <button className="btn btn-primary w-full justify-center">Buchen</button>
                <p className="help">Das Zeitkonto vergleicht die im Wochenraster geplante Sollzeit mit den in der Monatsabrechnung erfassten Ist-Stunden. Zum Ende des Durchrechnungszeitraums kommt automatisch eine Wiedervorlage.</p>
              </form>
            </Card>
          )}
        </div>
      )}

      {tab === "fristen" && fristenTab && (
        <div className="grid lg:grid-cols-3 gap-4">
          {!fr ? <Card className="lg:col-span-3"><Empty title="Kein Eintrittsdatum" text="Fristen werden ab dem Eintrittsdatum berechnet – bitte im Profil ergänzen." /></Card> : (
            <>
              <Card title="Fristen auf einen Blick" className="reveal">
                <Stat label="Dienstverhältnis" value={`${p.angestellt ? "Angestellte/r (AngG)" : "Arbeiter/in (KV AKÜ)"} · seit ${datum(p.eintrittsdatum)}`} />
                <Stat label="Dienstjahre" value={fr.dienstjahre.toFixed(1)} />
                <Stat label="Probezeit bis" value={fr.probezeitEnde ? datum(fr.probezeitEnde) : "–"} />
                {fr.behaltefristEnde && <Stat label="Behaltefrist nach Lehre (§ 18 BAG) bis" value={<span className={fr.behaltefristEnde > new Date() ? "text-amber font-semibold" : ""}>{datum(fr.behaltefristEnde)}</span>} />}
                <Stat label="Kündigungsfrist Dienstgeber" value={`${fristText(fr.dgStufe.frist)} ${terminText(fr.dgStufe.termin)}`} />
                <Stat label="Kündigungsfrist Dienstnehmer" value={`${fristText(fr.dnStufe.frist)} ${terminText(fr.dnStufe.termin)}`} />
                {fr.naechsteStufe && <Stat label="Nächste Fristenstufe" value={`ab ${datum(fr.naechsteStufe.ab)}: ${fristText(fr.naechsteStufe.stufe.frist)} ${terminText(fr.naechsteStufe.stufe.termin)}`} />}
                <p className="help mt-3">{fristenTab.hinweis}</p>
              </Card>
              <Card title="Wenn heute gekündigt wird" className="reveal reveal-2">
                <Stat label="Durch Dienstgeber → Ende am" value={<span className="font-semibold">{datumLang(fr.dgEndeHeute)}</span>} />
                <Stat label="Durch Dienstnehmer → Ende am" value={<span className="font-semibold">{datumLang(fr.dnEndeHeute)}</span>} />
                <p className="help mt-3">Berechnet aus der heutigen Betriebszugehörigkeit; Frist + nächstmöglicher Kündigungstermin.</p>
              </Card>
              <Card title="Letzter Kündigungstag für ein Wunsch-Ende" className="reveal reveal-3">
                <div className="space-y-2 text-[13.5px]">
                  {[1, 2, 3, 6].map((m) => { const ziel = new Date(new Date().getFullYear(), new Date().getMonth() + m + 1, 0); const r = letzterKuendigungstag(p.angestellt ? fristenTab.angestellteDienstgeber : fristenTab.arbeiterDienstgeber, p.eintrittsdatum!, ziel); return <div key={m} className="flex justify-between border-b border-line py-1.5"><span>Ende {datum(ziel)}</span><span className="font-semibold num">{r ? `Kündigung bis ${datum(r.tag)}` : "nicht erreichbar"}</span></div>; })}
                </div>
                <p className="help mt-3">Dienstgeber-Kündigung, jeweils zum Monatsletzten der nächsten 1, 2, 3 und 6 Monate.</p>
              </Card>
            </>
          )}
        </div>
      )}

      {tab === "historie" && (
        <div className="grid lg:grid-cols-3 gap-4">
          <Card title="Historie" className="lg:col-span-2 reveal">
            {p.aktivitaeten.length ? (
              <ol className="relative border-l border-line ml-2">{p.aktivitaeten.map((a) => (
                <li key={a.id} className="ml-5 pb-5 last:pb-0">
                  <span className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-brand border-2 border-surface" />
                  <div className="text-[12px] text-muted">{datum(a.zeitpunkt)} · {a.nutzerName} · {a.typ}</div>
                  <div className="text-[13.5px]">{a.text}</div>
                </li>
              ))}</ol>
            ) : <Empty title="Noch keine Einträge" />}
          </Card>
          <div className="space-y-4">
            <Card title="Notiz / Kontakt festhalten" className="reveal reveal-2">
              <form action={notizAnlegen.bind(null, id)} className="space-y-3">
                <Field label="Typ"><select name="typ" className="select"><option value="NOTIZ">Notiz</option><option value="ANRUF">Telefonat</option><option value="EMAIL">E-Mail</option><option value="GESPRAECH">Gespräch</option></select></Field>
                <Field label="Text" required><textarea name="text" rows={4} required className="textarea" /></Field>
                <button className="btn btn-primary w-full justify-center">Speichern</button>
              </form>
            </Card>
            {p.vertraege.length > 0 && (
              <Card title="Arbeitspapiere & Verträge" className="reveal reveal-3">
                <ul className="divide-y divide-line">
                  {p.vertraege.map((v) => (
                    <li key={v.id} className="py-2 text-[13.5px] flex items-center justify-between gap-2">
                      <span><Link href={`/vertraege/${v.id}`} className="font-semibold hover:text-brand">{vertragTitel(v.typ)}</Link><span className="text-muted"> · {v.nummer} · {datum(v.erstelltAm)}</span></span>
                      <Badge tone={v.status === "UNTERSCHRIEBEN" ? "teal" : v.status === "VERSENDET" ? "amber" : "grey"}>{v.status}</Badge>
                    </li>
                  ))}
                </ul>
                <p className="help mt-2">Erzeugen, Versand und Rücklauf stehen zusätzlich als Einträge in der Historie links.</p>
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  );
}
