import { requireApp } from "@/lib/app-auth";
import { db } from "@/lib/db";
import { AppShell, appMetadata, appViewport } from "../shell";
import { AppKopf } from "../kopf";
import { nachrichtSenden } from "../actions";
import { Send } from "lucide-react";

export const metadata = appMetadata; export const viewport = appViewport; export const dynamic = "force-dynamic";

/** Chat mit der Disposition – ein Thread je Mitarbeiter, Firmenseite antwortet im Büro-Programm unter „Nachrichten“. */
export default async function AppChat() {
  const s = await requireApp();
  const msgs = await db.nachricht.findMany({ where: { personId: s.personId }, orderBy: { erstelltAm: "asc" }, take: 200 });
  await db.nachricht.updateMany({ where: { personId: s.personId, vonMitarbeiter: false, gelesenAm: null }, data: { gelesenAm: new Date() } });
  const fmt = (d: Date) => d.toLocaleString("de-AT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return (
    <AppShell>
      <AppKopf titel="Chat mit Fox & People" zurueck="/app" />
      <div className="px-4 pt-4 pb-24 space-y-2">
        {!msgs.length && <div className="card card-pad text-[14px] text-muted">Hallo! Hier erreichst du deine Disposition – Fragen zum Einsatz, zum Lohnzettel, zu Urlaub oder Unterlagen. Wir antworten werktags von 7 bis 17 Uhr, im Notfall bitte anrufen: +43 676 4574096.</div>}
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.vonMitarbeiter ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-[12px] px-3.5 py-2 text-[14px] whitespace-pre-wrap ${m.vonMitarbeiter ? "bg-brand text-white rounded-br-[3px]" : "bg-surface border border-line rounded-bl-[3px]"}`}>
              {m.text}
              <div className={`text-[11px] mt-1 ${m.vonMitarbeiter ? "text-white/60" : "text-muted"}`}>{m.vonMitarbeiter ? "Du" : m.nutzerName ?? "Fox & People"} · {fmt(m.erstelltAm)}</div>
            </div>
          </div>
        ))}
      </div>
      <form action={nachrichtSenden} className="fixed bottom-[62px] inset-x-0 max-w-lg mx-auto bg-surface border-t border-line p-2 flex gap-2">
        <input name="text" required autoComplete="off" placeholder="Nachricht schreiben …" className="input flex-1 !text-[17px]" />
        <button className="btn btn-primary !px-3" aria-label="Senden"><Send size={18} /></button>
      </form>
    </AppShell>
  );
}
