import Link from "next/link";
import { Check } from "lucide-react";
import { requireSession, tenantWhere, istZentrale } from "@/lib/auth";
import { db } from "@/lib/db";
import { erzeugeAufgabenGedrosselt } from "@/lib/aufgaben";
import { datum } from "@/lib/format";
import { PageHeader, Card, Empty, Field, Badge } from "@/components/ui";
import { aufgabeErledigt, aufgabeAnlegen } from "./actions";
import { after } from "next/server";

export const dynamic = "force-dynamic";
const TYP: Record<string, { label: string; tone: "red" | "amber" | "brand" | "teal" | "grey" | "violet" }> = {
  QUALIFIKATION_ABLAUF: { label: "Nachweis läuft ab", tone: "amber" },
  RAHMENVERTRAG_ABLAUF: { label: "Rahmenvertrag", tone: "violet" },
  KV_ABLAUF: { label: "KV läuft aus – Angebot anpassen", tone: "violet" },
  PROBEZEIT_ENDE: { label: "Probezeit", tone: "amber" },
  UEBERNAHME_MOEGLICH: { label: "Übernahme möglich", tone: "teal" },
  OEGK_ANMELDUNG: { label: "ÖGK-Anmeldung", tone: "red" },
  BEWERTUNG_OFFEN: { label: "Bewertung einholen", tone: "brand" },
  AMS_FOERDERUNG_ENDE: { label: "AMS-Förderung endet", tone: "amber" },
  AUEG_STATISTIK: { label: "AÜG-Statistik", tone: "red" },
  ZKO_MELDUNG: { label: "ZKO-Meldung", tone: "red" },
  ZEITKONTO_ABLAUF: { label: "Zeitkonto", tone: "amber" },
  PROVISION_FREIGABE: { label: "Provision freigeben", tone: "brand" },
  STUNDENNACHWEIS_PRUEFEN: { label: "Stundennachweis", tone: "brand" },
  KRANKMELDUNG: { label: "Krankmeldung", tone: "red" },
  URLAUBSANTRAG: { label: "Urlaubsantrag", tone: "amber" },
  DOKUMENT_PRUEFEN: { label: "Dokument prüfen", tone: "brand" },
  EMPFEHLUNG_PRAEMIE: { label: "Empfehlungsprämie", tone: "violet" },
  RECHNUNG_UEBERFAELLIG: { label: "Rechnung überfällig", tone: "red" },
  ANGEBOT_OFFEN: { label: "Angebot nachfassen", tone: "brand" },
  EINSATZ_ENDE: { label: "Einsatz endet", tone: "teal" },
  MANUELL: { label: "Aufgabe", tone: "grey" },
};
const link = (a: { typ: string; referenzId: string | null; personId: string | null; kundeId: string | null }) =>
  a.typ === "RECHNUNG_UEBERFAELLIG" ? `/rechnungen/${a.referenzId}` : a.typ === "ANGEBOT_OFFEN" ? `/angebote/${a.referenzId}` : a.typ === "EINSATZ_ENDE" ? `/einsaetze/${a.referenzId}` : a.typ === "QUALIFIKATION_ABLAUF" ? `/personen/${a.personId}?tab=qualifikationen` : a.typ === "BEWERTUNG_OFFEN" ? `/kunden/${a.kundeId}?tab=bewertungen` : a.typ === "KV_ABLAUF" ? `/kunden/${a.kundeId}?tab=uebersicht` : a.typ === "OEGK_ANMELDUNG" ? `/personen/${a.personId}?tab=onboarding` : a.typ === "AUEG_STATISTIK" ? `/controlling?tab=aueg` : a.typ === "ZKO_MELDUNG" ? `/einsaetze/${a.referenzId}` : a.typ === "ZEITKONTO_ABLAUF" ? `/personen/${a.personId}?tab=zeitkonto` : a.typ === "PROVISION_FREIGABE" ? `/controlling?tab=provisionen` : a.typ === "STUNDENNACHWEIS_PRUEFEN" ? `/stundennachweise` : a.typ === "KRANKMELDUNG" || a.typ === "URLAUBSANTRAG" ? `/personen/${a.personId}?tab=abwesenheiten` : a.typ === "DOKUMENT_PRUEFEN" ? `/personen/${a.personId}?tab=dokumente` : a.typ === "EMPFEHLUNG_PRAEMIE" ? `/empfehlungen` : a.kundeId ? `/kunden/${a.kundeId}` : a.personId ? `/personen/${a.personId}` : "#";

export default async function AufgabenPage({ searchParams }: { searchParams: Promise<{ alle?: string }> }) {
  const s = await requireSession();
  const { alle } = await searchParams;
  // Erst ausliefern, dann nachziehen: der Lauf darf die Seite nicht aufhalten.
  after(() => erzeugeAufgabenGedrosselt());
  const aufgaben = await db.aufgabe.findMany({ where: { ...tenantWhere(s), ...(alle ? {} : { erledigt: false }) }, orderBy: [{ erledigt: "asc" }, { faelligAm: "asc" }], include: { person: true, kunde: true, kostenstelle: true }, take: 200 });
  const kostenstellen = istZentrale(s) ? await db.kostenstelle.findMany({ where: { aktiv: true } }) : [];
  const heute = new Date();
  return (
    <>
      <PageHeader title="Wiedervorlagen" sub="Automatisch aus Nachweisen, Rahmenverträgen, Rechnungen, Angeboten und Einsätzen – plus eigene Aufgaben." actions={<Link href={alle ? "/aufgaben" : "/aufgaben?alle=1"} className="btn btn-secondary">{alle ? "Nur offene" : "Auch erledigte"}</Link>} />
      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        <Card pad={false} className="reveal">
          {aufgaben.length ? (
            <ul className="divide-y divide-line">{aufgaben.map((a) => { const t = TYP[a.typ] ?? TYP.MANUELL; const ueber = !a.erledigt && a.faelligAm < heute; return (
              <li key={a.id} className={`flex items-center gap-4 px-5 py-3 ${a.erledigt ? "opacity-50" : ""}`}>
                <form action={aufgabeErledigt.bind(null, a.id)}><button className={`w-7 h-7 rounded-lg border flex items-center justify-center ${a.erledigt ? "bg-teal border-teal text-white" : "border-line-2 hover:border-teal hover:text-teal"}`} title="Erledigt" disabled={a.erledigt}><Check size={14} /></button></form>
                <div className="flex-1 min-w-0"><Link href={link(a)} className="font-semibold text-[14px] hover:text-brand">{a.titel}</Link><div className="text-[12.5px] text-muted">{a.kunde?.firmenname ?? a.person ? `${a.person?.vorname ?? ""} ${a.person?.nachname ?? ""}`.trim() : ""}{!tenantWhere(s).kostenstelleId && ` · ${a.kostenstelle.name}`}</div></div>
                <Badge tone={t.tone}>{t.label}</Badge>
                <div className={`text-[12.5px] num w-28 text-right ${ueber ? "text-red font-semibold" : "text-muted"}`}>{ueber ? "seit " : ""}{datum(a.faelligAm)}</div>
              </li>
            ); })}</ul>
          ) : <Empty title="Alles erledigt" text="Keine offenen Wiedervorlagen." />}
        </Card>
        <Card title="Aufgabe anlegen" className="reveal reveal-2">
          <form action={aufgabeAnlegen} className="space-y-3">
            <Field label="Titel" required><input name="titel" required className="input" /></Field>
            <Field label="Fällig am"><input type="date" name="faelligAm" className="input" defaultValue={heute.toISOString().slice(0, 10)} /></Field>
            {kostenstellen.length > 0 && <Field label="Kostenstelle"><select name="kostenstelleId" className="select" defaultValue={s.aktiveKostenstelleId ?? kostenstellen[0].id}>{kostenstellen.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select></Field>}
            <button className="btn btn-primary w-full justify-center">Anlegen</button>
          </form>
        </Card>
      </div>
    </>
  );
}
