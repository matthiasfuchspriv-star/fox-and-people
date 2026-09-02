import { LogOut, Search } from "lucide-react";
import type { Session } from "@/lib/auth";
import { wechsleKostenstelle } from "@/app/(app)/actions";
import { Avatar } from "./ui";

const rolleLabel: Record<string, string> = { SYSTEMADMIN: "Systemadmin", ZENTRALE: "Zentrale", KOSTENSTELLEN_LEITUNG: "Kostenstellen-Leitung", SACHBEARBEITUNG: "Sachbearbeitung" };

export function Topbar({ session, kostenstellen, zentrale }: { session: Session; kostenstellen: { id: string; name: string; isZentrale: boolean }[]; zentrale: boolean }) {
  const aktuelle = kostenstellen.find((k) => k.id === (session.aktiveKostenstelleId ?? session.kostenstelleId));
  return (
    <header className="sticky top-0 z-20 bg-bg/80 backdrop-blur-xl backdrop-saturate-150 border-b border-line px-5 lg:px-8 h-14 flex items-center gap-4">
      <form action="/personen" className="hidden md:flex items-center gap-2 bg-surface-2/80 hover:bg-surface-2 focus-within:bg-surface focus-within:shadow-[var(--ring)] border border-transparent focus-within:border-fox rounded-[9px] px-3 h-9 w-72 transition-colors">
        <Search size={15} className="text-muted" />
        <input name="q" placeholder="Person oder Kunde suchen" className="bg-transparent outline-none text-[14px] flex-1 placeholder:text-muted" />
      </form>
      <div className="ml-auto flex items-center gap-3">
        {zentrale ? (
          <form action={wechsleKostenstelle} className="flex items-center gap-2">
            <select name="kostenstelleId" defaultValue={session.aktiveKostenstelleId ?? ""} className="select !w-auto !py-1.5 !text-[12.5px] font-medium" aria-label="Kostenstelle" onChange={undefined}>
              <option value="">Alle Kostenstellen</option>
              {kostenstellen.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
            <button className="btn btn-secondary btn-sm">Wechseln</button>
          </form>
        ) : (
          <span className="badge badge-brand">{aktuelle?.name}</span>
        )}
        <div className="hidden sm:flex items-center gap-2.5 pl-2">
          <Avatar name={session.name} size={30} />
          <div className="text-right leading-tight">
            <div className="text-[12.5px] font-medium">{session.name}</div>
            <div className="text-[12.5px] text-muted">{rolleLabel[session.rolle]}</div>
          </div>
        </div>
        <a href="/logout" className="btn btn-ghost btn-sm" title="Abmelden" aria-label="Abmelden"><LogOut size={16} /></a>
      </div>
    </header>
  );
}
