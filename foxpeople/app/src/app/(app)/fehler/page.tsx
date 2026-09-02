import { Check, Mail } from "lucide-react";
import { requireSession, istZentrale } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { einstellung, firma as ladeFirma } from "@/lib/einstellungen";
import { PageHeader, Card, Empty, Badge } from "@/components/ui";
import { fehlerErledigt, tagesmailJetzt } from "./actions";

export const dynamic = "force-dynamic";

const zeit = (d: Date) => d.toLocaleString("de-AT", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * Was im Hintergrund schiefgegangen ist.
 *
 * Diese Seite ist die Antwort auf eine unangenehme Erkenntnis: Im ganzen Programm gab es genau ein
 * `console.error`. Alles andere wurde abgefangen und verschwand. Ein kaputter Mailversand oder ein
 * defektes Skript fiel erst auf, wenn jemand es brauchte.
 */
export default async function FehlerPage({ searchParams }: { searchParams: Promise<{ alle?: string; probe?: string }> }) {
  const s = await requireSession();
  if (!istZentrale(s)) redirect("/?fehler=keine-berechtigung");
  const sp = await searchParams;
  const alle = sp.alle === "1";

  const [eintraege, erledigt, zuletzt, f, empfaenger] = await Promise.all([
    db.fehlerprotokoll.findMany({ where: { erledigtAm: null }, orderBy: [{ stufe: "asc" }, { zuletztAm: "desc" }], take: 200 }),
    alle ? db.fehlerprotokoll.findMany({ where: { erledigtAm: { not: null } }, orderBy: { erledigtAm: "desc" }, take: 50 }) : Promise.resolve([]),
    einstellung<string | null>("tagesmailZuletzt", null),
    ladeFirma(),
    einstellung<string | null>("tagesmailAn", null),
  ]);
  const an = empfaenger ?? f.email;

  return (
    <>
      <PageHeader title="Systemprotokoll" sub="Was im Hintergrund schiefgegangen ist – Wiedervorlagen, Mailversand, Rechnungslauf, Koordinaten." crumbs={[{ label: "Systemprotokoll" }]} />

      {sp.probe && <div className="alert alert-brand mb-4"><span><b>Systembericht ausgelöst:</b> {sp.probe}</span></div>}

      <div className="alert alert-grey mb-4 flex-col !items-stretch gap-2">
        <span>
          Jeden Morgen um 7 Uhr geht ein Bericht über alles Offene an <b>{an}</b>.
          {zuletzt ? ` Zuletzt am ${zuletzt.split("-").reverse().join(".")}.` : " Bisher wurde noch keiner verschickt."}
          {" "}Gibt es nichts zu melden, kommt bewusst keine Mail – sonst liest man sie nach einer Woche nicht mehr.
        </span>
        <form action={tagesmailJetzt}>
          <button className="btn btn-secondary"><Mail size={15} /> Bericht jetzt schicken (Probe)</button>
        </form>
      </div>

      <Card title={`Offen (${eintraege.length})`}>
        {eintraege.length === 0 ? (
          <Empty title="Nichts offen" text="Seit dem letzten Abhaken ist im Hintergrund kein Fehler aufgetreten." />
        ) : (
          <table className="table">
            <thead><tr><th>Quelle</th><th>Meldung</th><th className="r">Anzahl</th><th>Zuerst</th><th>Zuletzt</th><th></th></tr></thead>
            <tbody>
              {eintraege.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap"><Badge tone={e.stufe === "FEHLER" ? "red" : "amber"}>{e.quelle}</Badge></td>
                  <td>
                    {e.meldung}
                    {e.detail && <details className="mt-1"><summary className="text-[12px] text-muted cursor-pointer">Einzelheiten</summary><pre className="text-[11.5px] whitespace-pre-wrap mt-1 text-muted">{e.detail}</pre></details>}
                    {e.gemeldetAm && <div className="text-[11.5px] text-muted mt-0.5">war im Bericht vom {zeit(e.gemeldetAm)}</div>}
                  </td>
                  <td className="r num">{e.anzahl}×</td>
                  <td className="whitespace-nowrap text-[12.5px] text-muted">{zeit(e.zuerstAm)}</td>
                  <td className="whitespace-nowrap text-[12.5px]">{zeit(e.zuletztAm)}</td>
                  <td className="r">
                    <form action={fehlerErledigt.bind(null, e.id)}>
                      <button className="btn btn-secondary !py-1 !px-2" title="Abgehakt – verschwindet aus der Liste und aus der Tagesmail"><Check size={15} /></button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="mt-4">
        <a href={alle ? "/fehler" : "/fehler?alle=1"} className="text-[13.5px] underline text-muted">{alle ? "Abgehakte ausblenden" : "Abgehakte anzeigen"}</a>
      </div>

      {alle && erledigt.length > 0 && (
        <Card title={`Abgehakt (${erledigt.length})`} className="mt-3">
          <table className="table">
            <thead><tr><th>Quelle</th><th>Meldung</th><th className="r">Anzahl</th><th>Abgehakt</th></tr></thead>
            <tbody>
              {erledigt.map((e) => (
                <tr key={e.id} className="text-muted">
                  <td className="whitespace-nowrap">{e.quelle}</td>
                  <td>{e.meldung}</td>
                  <td className="r num">{e.anzahl}×</td>
                  <td className="whitespace-nowrap text-[12.5px]">{e.erledigtAm ? zeit(e.erledigtAm) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
