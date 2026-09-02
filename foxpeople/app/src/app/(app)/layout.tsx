import { requireSession, istZentrale, istAdmin, tenantWhere } from "@/lib/auth";
import { db } from "@/lib/db";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

async function zaehleOffeneAufgaben(s: Awaited<ReturnType<typeof requireSession>>) {
  const inEinerWoche = new Date(Date.now() + 7 * 86400000);
  return db.aufgabe.count({ where: { erledigt: false, faelligAm: { lte: inEinerWoche }, ...(istZentrale(s) ? (s.aktiveKostenstelleId ? { kostenstelleId: s.aktiveKostenstelleId } : {}) : { kostenstelleId: s.kostenstelleId! }) } });
}

import { FormWaechter } from "@/components/formwaechter";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  const kostenstellen = istZentrale(s) ? await db.kostenstelle.findMany({ where: { aktiv: true }, orderBy: [{ isZentrale: "desc" }, { name: "asc" }] }) : await db.kostenstelle.findMany({ where: { id: s.kostenstelleId! } });
  const offeneAufgaben = await zaehleOffeneAufgaben(s);
  const tw = tenantWhere(s);
  const [neueNachrichten, offeneNachweise, offeneFehler] = await Promise.all([
    db.nachricht.count({ where: { vonMitarbeiter: true, gelesenAm: null, person: tw.kostenstelleId ? { kostenstelleId: tw.kostenstelleId } : {} } }),
    db.stundennachweis.count({ where: { status: "EINGEREICHT", person: tw.kostenstelleId ? { kostenstelleId: tw.kostenstelleId } : {} } }),
    // Nur für die Zentrale – sonst steht bei jeder Kostenstelle eine Zahl, mit der sie nichts anfangen kann
    istZentrale(s) ? db.fehlerprotokoll.count({ where: { erledigtAm: null, stufe: "FEHLER" } }) : Promise.resolve(0),
  ]);
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <Sidebar rolle={s.rolle} admin={istAdmin(s)} offeneAufgaben={offeneAufgaben} neueNachrichten={neueNachrichten} offeneNachweise={offeneNachweise} offeneFehler={offeneFehler} />
      <div className="min-w-0 flex flex-col">
        <Topbar session={s} kostenstellen={kostenstellen.map((k) => ({ id: k.id, name: k.name, isZentrale: k.isZentrale }))} zentrale={istZentrale(s)} />
        <main className="flex-1 p-5 lg:p-8 max-w-[1440px] w-full mx-auto">{children}</main>
        <FormWaechter />
      </div>
    </div>
  );
}
