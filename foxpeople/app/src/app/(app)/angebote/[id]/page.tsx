import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown, Send, Copy, CheckCircle2, XCircle } from "lucide-react";
import { requireSession, darfKostenstelle, darfSensibel } from "@/lib/auth";
import { db } from "@/lib/db";
import { referenzlohnErmitteln, referenzKvFuer } from "@/lib/referenzlohn";
import { mailFuer } from "@/lib/kontakte";
import { aktuelleSaetze } from "@/lib/einstellungen";
import { DZ_BUNDESLAND } from "@/engine/kalkulation";
import { datum, isoDate } from "@/lib/format";
import { PageHeader, Card, Field, angebotStatusBadge } from "@/components/ui";
import { AngebotEditor } from "./editor";
import { ergebnisSicht, provisionPct, ladeControllingkosten } from "@/lib/provision";
import type { PositionKalkulation } from "@/lib/angebot-kalkulation";
import { angebotStatus, angebotVersenden, angebotKopieren, type PositionInput } from "../actions";

export const dynamic = "force-dynamic";

export default async function AngebotDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ gesendet?: string; fehler?: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  const a = await db.angebot.findUnique({ where: { id }, include: { kunde: { include: { ansprechpartner: true, konditionen: true } }, positionen: { orderBy: { reihenfolge: "asc" } }, kostenstelle: true, einsaetze: { include: { person: true } } } });
  if (!a || !darfKostenstelle(s, a.kostenstelleId)) notFound();
  const { saetze } = await aktuelleSaetze(a.bundesland ?? a.kostenstelle.bundesland);
  // Provision der Kostenstelle nur serverseitig berechnen (vom DB2 = DB1 − Kostenumlage je Mitarbeiter) – der Prozentsatz bleibt intern
  const kostenMa = (await ladeControllingkosten(a.datum.getFullYear()))?.kostenProMitarbeiterMonat ?? null;
  const provisionSumme = kostenMa == null ? { monat: null, jahr: null } : a.positionen.reduce((acc, p) => { const k = p.kalkulation as unknown as PositionKalkulation | null; const pp = provisionPct(a.kostenstelle, k?.kalkulationsart === "VERMITTLUNG" ? "DIREKTVERMITTLUNG" : "UEBERLASSUNG"); const umlage = kostenMa * 1; const m = (((k?.db1Monat ?? 0) - umlage) * pp) / 100; return { monat: (acc.monat ?? 0) + m, jahr: (acc.jahr ?? 0) + (k?.kalkulationsart === "VERMITTLUNG" ? m : m * 12) }; }, { monat: 0, jahr: 0 } as { monat: number | null; jahr: number | null });
  const { aktuelleLohnstufen } = await import("@/lib/referenzlohn");
  // Je Gruppe nur die heute gültige Zeile – sonst stehen im Auswahlfeld beide Tafel-Stände
  // (z. B. Metall ab 1.11.2025 UND ab 1.11.2026) mit verschiedenen Beträgen durcheinander.
  const kvs = (await db.kollektivvertrag.findMany({ include: { lohntabelle: true } })).map((kv) => ({ ...kv, lohntabelle: aktuelleLohnstufen(kv.lohntabelle) }));
  // Beschäftiger-KV dieses Kunden: verknüpfte Tafel, sonst der Freitext über die Synonymliste.
  // Ohne diese Vorbelegung startet jede Position mit dem erstbesten KV der Liste – und der
  // Referenzlohn, der daraus fällt, gehört einer fremden Branche.
  const kundenKv = await referenzlohnErmitteln({ kv: referenzKvFuer(a.kunde, false) });
  const kundenKvId = kundenKv?.kvId ?? null;
  const sensibel = darfSensibel(s);
  const readOnly = a.status !== "ENTWURF" || !sensibel;
  const positionen: PositionInput[] = a.positionen.map((p) => ({ id: p.id, kalkulationsart: p.kalkulationsart, rolle: p.rolle, anzahlPersonen: 1, stundenlohn: p.stundenlohn, bruttogehalt: p.bruttogehalt, wochenstunden: p.wochenstunden, stundenProMonat: p.stundenProMonat, verrechnungssatz: p.verrechnungssatz, aufschlagMonat: p.aufschlagMonat, honorar: p.honorar, kvId: p.kvId, beschaeftigungsgruppe: p.beschaeftigungsgruppe, zuschlag50: p.zuschlag50, zuschlag100: p.zuschlag100, zulagenIds: p.zulagenIds }));
  const zulagen = await db.zulage.findMany({ where: { aktiv: true, weiterverrechnen: true }, orderBy: [{ reihenfolge: "asc" }, { name: "asc" }], select: { id: true, name: true, kuerzel: true, art: true, wert: true } });
  const empf = mailFuer(a.kunde, "DISPOSITION"); // Disposition/Einsatzplanung → Haupt → Kunde

  return (
    <>
      <PageHeader crumbs={[{ href: "/angebote", label: "Angebote" }, { label: a.nummer }]}
        title={<span className="flex items-center gap-3 flex-wrap">{a.nummer} {angebotStatusBadge(a.status)}</span>}
        sub={<span><Link href={`/kunden/${a.kundeId}`} className="font-semibold text-ink hover:text-brand">{a.kunde.firmenname}</Link> · {datum(a.datum)} · gültig bis {datum(a.gultigBis)} · {a.kostenstelle.name}{a.versendetAm && ` · versendet ${datum(a.versendetAm)} an ${a.versendetAn}`}</span>}
        actions={<>
          <a href={`/angebote/${id}/pdf`} target="_blank" className="btn btn-secondary"><FileDown size={15} /> PDF</a>
          <form action={angebotKopieren.bind(null, id)}><button className="btn btn-secondary"><Copy size={15} /> Kopieren</button></form>
        </>} />
      {sp.gesendet && <div className={`alert ${sp.gesendet === "FEHLER" ? "alert-red" : sp.gesendet === "TEST" ? "alert-amber" : "alert-teal"} mb-4`}>{sp.gesendet === "GESENDET" ? "Angebot wurde per E-Mail versendet." : sp.gesendet === "TEST" ? "Testmodus: E-Mail wurde protokolliert, aber nicht zugestellt (SMTP noch nicht konfiguriert)." : "E-Mail-Versand fehlgeschlagen – bitte SMTP-Einstellungen prüfen."}</div>}
      {sp.fehler === "email" && <div className="alert alert-red mb-4">Keine E-Mail-Adresse beim Kunden hinterlegt.</div>}
      {a.status === "ANGENOMMEN" && a.einsaetze.length === 0 && <div className="alert alert-teal mb-4"><CheckCircle2 size={16} className="mt-0.5" /><span><strong>Angenommen.</strong> Jetzt Einsätze anlegen: {a.positionen.map((p) => <Link key={p.id} href={`/einsaetze/neu?kundeId=${a.kundeId}&rolle=${encodeURIComponent(p.rolle)}&verrechnungssatz=${p.verrechnungssatz ?? ""}&stundenlohn=${p.stundenlohn ?? ""}&angebotId=${id}`} className="font-semibold underline mr-3">{p.rolle}</Link>)}</span></div>}
      {a.einsaetze.length > 0 && <div className="alert alert-brand mb-4"><span>Verknüpfte Einsätze: {a.einsaetze.map((e) => <Link key={e.id} href={`/einsaetze/${e.id}`} className="font-semibold underline mr-3">{e.person.vorname} {e.person.nachname}</Link>)}</span></div>}

      <AngebotEditor id={id} kopf={{ betreff: a.betreff, gultigBis: isoDate(a.gultigBis), bundesland: a.bundesland ?? a.kostenstelle.bundesland, einleitung: a.einleitung ?? "", schlusstext: a.schlusstext ?? "", stundennachweisVomKunden: a.stundennachweisVomKunden }} positionen={positionen} saetze={saetze} kvs={kvs} kundenKvId={kundenKvId} readOnly={readOnly} konditionen={a.kunde.konditionen} bundeslaender={Object.keys(DZ_BUNDESLAND)} provision={ergebnisSicht(s) === "PROVISION" ? provisionSumme : null} zulagen={zulagen} />

      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        {sensibel && a.status !== "ANGENOMMEN" && a.status !== "ABGELEHNT" && (
          <Card title={<span className="flex items-center gap-2"><Send size={15} /> Per E-Mail an Kunden senden</span>} className="reveal">
            <form action={angebotVersenden.bind(null, id)} className="space-y-3">
              <Field label="Empfänger" required><input name="an" type="email" required defaultValue={empf} className="input" /></Field>
              <Field label="Nachricht (optional, sonst Standardtext)"><textarea name="text" rows={4} className="textarea" placeholder={`Sehr geehrte Damen und Herren, anbei unser Angebot ${a.nummer} …`} /></Field>
              <button className="btn btn-primary" disabled={a.positionen.length === 0}>{a.status === "ENTWURF" ? "PDF erzeugen & versenden" : "Erneut senden"}</button>
              {a.positionen.length === 0 && <p className="help">Bitte zuerst Positionen speichern.</p>}
            </form>
          </Card>
        )}
        <Card title="Status" className="reveal reveal-2">
          <form action={angebotStatus.bind(null, id)} className="flex flex-wrap gap-2">
            {a.status !== "ANGENOMMEN" && <button name="status" value="ANGENOMMEN" className="btn btn-primary"><CheckCircle2 size={15} /> Angenommen</button>}
            {a.status !== "ABGELEHNT" && <button name="status" value="ABGELEHNT" className="btn btn-danger"><XCircle size={15} /> Abgelehnt</button>}
            {a.status !== "ENTWURF" && <button name="status" value="ENTWURF" className="btn btn-secondary">Zurück auf Entwurf</button>}
            {a.status === "VERSENDET" && <button name="status" value="ABGELAUFEN" className="btn btn-secondary">Abgelaufen</button>}
          </form>
          <p className="help mt-3">Versendete Angebote werden nach 14 Tagen ohne Antwort automatisch zur Wiedervorlage.</p>
        </Card>
      </div>
    </>
  );
}
