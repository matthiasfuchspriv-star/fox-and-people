import Link from "next/link";
import { requireSession, tenantWhere } from "@/lib/auth";
import { datum } from "@/lib/format";
import { PageHeader, Card, Empty, Badge } from "@/components/ui";
import { verfallMitarbeiter, verfallKunden, verfallSchluessel, VORWARNUNG_TAGE, type VerfallEintrag } from "@/lib/verfall";
import { einstellung } from "@/lib/einstellungen";
import { complianceErledigt, complianceWiedervorlage } from "./actions";

export const dynamic = "force-dynamic";

const LABEL: Record<VerfallEintrag["art"], string> = {
  BEWILLIGUNG: "Arbeitsbewilligung", AUSWEIS: "Ausweis", QUALIFIKATION: "Nachweis",
  RAHMENVERTRAG: "Rahmenvertrag", KV: "Kollektivvertrag", UID: "UID-Prüfung", AGB: "AGB",
};

function Liste({ eintraege, leer }: { eintraege: VerfallEintrag[]; leer: string }) {
  if (!eintraege.length) return <Empty title="Alles in Ordnung" text={leer} />;
  return (
    <div className="overflow-x-auto"><table className="table">
      <thead><tr><th>Art</th><th>Betrifft</th><th>Details</th><th className="r">Fällig</th><th className="r">Rest</th><th></th></tr></thead>
      <tbody>{eintraege.map((v, i) => (
        <tr key={i} className={v.blockiert ? "bg-red/5" : undefined}>
          <td><Badge tone={v.blockiert ? "red" : v.abgelaufen ? "red" : (v.tageRest ?? 99) <= 14 ? "amber" : "grey"}>{LABEL[v.art]}</Badge></td>
          <td className="font-semibold">{v.titel}</td>
          <td className="text-[12.5px] text-muted max-w-[420px]">{v.detail}</td>
          <td className="r whitespace-nowrap">{v.faelligAm ? datum(v.faelligAm) : "–"}</td>
          <td className="r num">{v.tageRest == null ? "–" : v.tageRest < 0 ? <span className="text-red">{v.tageRest} T</span> : `${v.tageRest} T`}</td>
          <td className="r whitespace-nowrap">
            {/* Harte Blocker (z. B. fehlende Arbeitsbewilligung) lassen sich NICHT abhaken – sie müssen
                wirklich behoben werden. Weiche Hinweise darf man direkt aus der Liste erledigen. */}
            {!v.blockiert && (
              <form action={complianceErledigt} className="inline">
                <input type="hidden" name="schluessel" value={verfallSchluessel(v)} />
                <button className="btn btn-secondary btn-sm">Erledigt</button>
              </form>
            )}
            {v.personId ? <Link href={`/personen/${v.personId}`} className="btn btn-ghost btn-sm ml-1">Öffnen</Link> : v.kundeId ? <Link href={`/kunden/${v.kundeId}`} className="btn btn-ghost btn-sm ml-1">Öffnen</Link> : null}
          </td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}

/** Fristen- und Verfallsmonitor: was läuft ab, was blockiert einen Einsatz oder eine Rechnung. */
export default async function CompliancePage({ searchParams }: { searchParams: Promise<{ erledigte?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const w = tenantWhere(s);
  const [maAll, kuAll, quittiert] = await Promise.all([
    verfallMitarbeiter(w.kostenstelleId ?? null),
    verfallKunden(w.kostenstelleId ?? null),
    einstellung<Record<string, string>>("compliance_quittungen", {}),
  ]);
  // Abgehakte weiche Punkte ausblenden; Blocker bleiben immer sichtbar.
  const offen = (v: VerfallEintrag) => v.blockiert || !quittiert[verfallSchluessel(v)];
  const istErledigt = (v: VerfallEintrag) => !v.blockiert && Boolean(quittiert[verfallSchluessel(v)]);
  const ma = maAll.filter(offen);
  const ku = kuAll.filter(offen);
  const zeigeErledigte = sp.erledigte === "1";
  const erledigte = [...maAll, ...kuAll].filter(istErledigt);
  const blockierend = [...ma, ...ku].filter((x) => x.blockiert);
  return (
    <>
      <PageHeader title="Compliance & Fristen" sub={`Alles, was ablaufen kann – Vorwarnzeit ${VORWARNUNG_TAGE / 7} Wochen. Rot markierte Punkte verhindern einen neuen Einsatz oder eine korrekte Rechnung.`}
        actions={erledigte.length > 0 ? <Link href={zeigeErledigte ? "/compliance" : "/compliance?erledigte=1"} className="btn btn-secondary">{zeigeErledigte ? "Erledigte ausblenden" : `Erledigte anzeigen (${erledigte.length})`}</Link> : undefined} />
      {blockierend.length > 0 && (
        <div className="alert alert-red mb-4"><span><b>{blockierend.length} Punkt{blockierend.length === 1 ? "" : "e"} blockieren:</b> {blockierend.slice(0, 3).map((x) => x.titel).join(" · ")}{blockierend.length > 3 ? " …" : ""}</span></div>
      )}
      <div className="space-y-4">
        <Card title={`Mitarbeiter (${ma.length})`} pad={false} className="reveal">
          <Liste eintraege={ma} leer="Alle Bewilligungen, Ausweise und Nachweise sind gültig." />
        </Card>
        <Card title={`Kunden (${ku.length})`} pad={false} className="reveal reveal-2">
          <Liste eintraege={ku} leer="Rahmenverträge, KV-Abschlüsse, AGB-Akzeptanz und UID-Prüfungen sind aktuell." />
        </Card>
        {zeigeErledigte && (
          <Card title={`Erledigt (${erledigte.length})`} pad={false} className="reveal reveal-3">
            {erledigte.length ? (
              <div className="overflow-x-auto"><table className="table">
                <thead><tr><th>Art</th><th>Betrifft</th><th>Details</th><th></th></tr></thead>
                <tbody>{erledigte.map((v, i) => (
                  <tr key={i} className="opacity-70">
                    <td><Badge tone="grey">{LABEL[v.art]}</Badge></td>
                    <td className="font-semibold">{v.titel}</td>
                    <td className="text-[12.5px] text-muted max-w-[420px]">{v.detail}</td>
                    <td className="r"><form action={complianceWiedervorlage} className="inline"><input type="hidden" name="schluessel" value={verfallSchluessel(v)} /><button className="btn btn-ghost btn-sm">Wieder anzeigen</button></form></td>
                  </tr>
                ))}</tbody>
              </table></div>
            ) : <Empty title="Nichts abgehakt" />}
          </Card>
        )}
      </div>
    </>
  );
}
