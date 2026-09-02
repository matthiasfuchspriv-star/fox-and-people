import { LogOut, Search } from "lucide-react";
import type { Session } from "@/lib/auth";
import { wechsleKostenstelle } from "@/app/(app)/actions";

const rolleLabel: Record<string, string> = { SYSTEMADMIN: "Systemadmin", ZENTRALE: "Zentrale", KOSTENSTELLEN_LEITUNG: "Kostenstellen-Leitung", SACHBEARBEITUNG: "Sachbearbeitung" };

export function Topbar({ session, kostenstellen, zentrale }: { session: Session; kostenstellen: { id: string; name: string; isZentrale: boolean }[]; zentrale: boolean }) {
  const aktuelle = kostenstellen.find((k) => k.id === (session.aktiveKostenstelleId ?? session.kostenstelleId));
  return (
    <header className="sticky top-0 z-20 bg-bg/85 backdrop-blur border-b border-line px-5 lg:px-8 h-16 flex items-center gap-4">
      <form action="/personen" className="hidden md:flex items-center gap-2 bg-surface border border-line rounded-xl px-3 h-10 w-72">
        <Search size={15} className="text-muted" />
        <input name="q" placeholder="Person oder Kunde suchen…" className="bg-transparent outline-none text-[13.5px] flex-1" />
      </form>
      <div className="ml-auto flex items-center gap-3">
        {zentrale ? (
          <form action={wechsleKostenstelle} className="flex items-center gap-2">
            <span className="text-[12px] text-muted hidden sm:inline">Kostenstelle</span>
            <select name="kostenstelleId" defaultValue={session.aktiveKostenstelleId ?? ""} className="select !w-auto !py-1.5 !text-[13px] font-semibold" onChange={undefined}>
              <option value="">Alle Kostenstellen</option>
              {kostenstellen.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
            <button className="btn btn-secondary btn-sm">Wechseln</button>
          </form>
        ) : (
          <span className="badge badge-brand">{aktuelle?.name}</span>
        )}
        <div className="hidden sm:block text-right leading-tight">
          <div className="text-[13px] font-semibold">{session.name}</div>
          <div className="text-[11px] text-muted">{rolleLabel[session.rolle]}</div>
        </div>
        <a href="/logout" className="btn btn-ghost btn-sm" title="Abmelden"><LogOut size={16} /></a>
      </div>
    </header>
  );
}
