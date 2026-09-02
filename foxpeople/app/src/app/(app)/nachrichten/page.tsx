import Link from "next/link";
import { requireSession, tenantWhere } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, Card, Empty } from "@/components/ui";
import { antwortSenden } from "./actions";
import { Send } from "lucide-react";

export const dynamic = "force-dynamic";

/** Posteingang der Disposition: ein Thread je Mitarbeiter aus der App. */
export default async function NachrichtenPage({ searchParams }: { searchParams: Promise<{ person?: string; fehler?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const where = tenantWhere(s);
  const threads = await db.nachricht.groupBy({ by: ["personId"], where: { person: where.kostenstelleId ? { kostenstelleId: where.kostenstelleId } : {} }, _max: { erstelltAm: true }, _count: true });
  const personen = await db.person.findMany({ where: { id: { in: threads.map((t) => t.personId) } }, select: { id: true, vorname: true, nachname: true, status: true, kostenstelle: { select: { name: true } } } });
  const ungelesen = await db.nachricht.groupBy({ by: ["personId"], where: { vonMitarbeiter: true, gelesenAm: null, personId: { in: threads.map((t) => t.personId) } }, _count: true });
  const liste = threads.map((t) => ({ t, p: personen.find((x) => x.id === t.personId)!, neu: ungelesen.find((u) => u.personId === t.personId)?._count ?? 0 })).filter((x) => x.p).sort((a, b) => (b.neu - a.neu) || ((b.t._max.erstelltAm?.getTime() ?? 0) - (a.t._max.erstelltAm?.getTime() ?? 0)));
  const aktiv = sp.person ?? liste[0]?.p.id;
  const msgs = aktiv ? await db.nachricht.findMany({ where: { personId: aktiv }, orderBy: { erstelltAm: "asc" }, take: 300 }) : [];
  if (aktiv && msgs.some((m) => m.vonMitarbeiter && !m.gelesenAm)) await db.nachricht.updateMany({ where: { personId: aktiv, vonMitarbeiter: true, gelesenAm: null }, data: { gelesenAm: new Date() } });
  const aktivP = personen.find((p) => p.id === aktiv);
  const fmt = (d: Date) => d.toLocaleString("de-AT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return (
    <>
      <PageHeader title="Nachrichten" sub="Chat mit den Mitarbeitern aus der Mitarbeiter-App – Antworten erscheinen sofort in der App." />
      {sp.fehler && <div className="alert alert-red mb-4">Keine Berechtigung.</div>}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card pad={false} className="reveal">
          {liste.length ? <ul className="divide-y divide-line">{liste.map(({ p, t, neu }) => <li key={p.id}><Link href={`/nachrichten?person=${p.id}`} className={`flex items-center gap-3 px-4 py-3 ${p.id === aktiv ? "bg-brand-soft" : ""}`}><div className="flex-1 min-w-0"><div className="font-semibold text-[13.5px] truncate">{p.vorname} {p.nachname}</div><div className="text-[12px] text-muted">{p.kostenstelle.name} · {t._max.erstelltAm ? fmt(t._max.erstelltAm) : ""}</div></div>{neu > 0 && <span className="bg-fox text-white text-[11px] font-bold rounded-full px-1.5 min-w-[20px] text-center">{neu}</span>}</Link></li>)}</ul> : <Empty title="Noch keine Nachrichten" text="Sobald ein Mitarbeiter in der App schreibt, erscheint der Chat hier." />}
        </Card>
        <Card className="lg:col-span-2 reveal reveal-2" title={aktivP ? <span>{aktivP.vorname} {aktivP.nachname} <Link href={`/personen/${aktivP.id}`} className="text-[12px] font-normal text-brand ml-2">Akt öffnen</Link></span> : "Chat"}>
          {aktiv ? (
            <>
              <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                {msgs.map((m) => <div key={m.id} className={`flex ${m.vonMitarbeiter ? "justify-start" : "justify-end"}`}><div className={`max-w-[80%] rounded-[10px] px-3 py-2 text-[13.5px] whitespace-pre-wrap ${m.vonMitarbeiter ? "bg-surface-2" : "bg-brand text-white"}`}>{m.text}<div className={`text-[10.5px] mt-1 ${m.vonMitarbeiter ? "text-muted" : "text-white/60"}`}>{m.vonMitarbeiter ? aktivP?.vorname : m.nutzerName} · {fmt(m.erstelltAm)}</div></div></div>)}
                {!msgs.length && <p className="text-muted text-[13px]">Noch keine Nachrichten in diesem Thread.</p>}
              </div>
              <form action={antwortSenden.bind(null, aktiv)} className="flex gap-2 mt-4"><input name="text" required autoComplete="off" placeholder="Antwort schreiben …" className="input flex-1" /><button className="btn btn-primary"><Send size={16} /> Senden</button></form>
            </>
          ) : <p className="text-muted text-[13px]">Links einen Chat auswählen.</p>}
        </Card>
      </div>
    </>
  );
}
