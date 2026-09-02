import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Logo } from "@/components/login-shell";

/** Kopfzeile der App-Seiten: helle Glas-Leiste mit zentriertem Titel und 44-px-Zurück-Ziel, wie in iOS. */
export function AppKopf({ titel, zurueck, rechts }: { titel?: string; zurueck?: string; rechts?: React.ReactNode }) {
  return (
    <header className="app-bar px-2 flex items-center gap-1 min-h-[52px]" style={{ paddingTop: "max(4px, env(safe-area-inset-top))" }}>
      <div className="flex items-center min-w-[44px]">
        {zurueck ? <Link href={zurueck} aria-label="Zurück" className="w-11 h-11 -ml-1 flex items-center justify-center rounded-full text-fox-ink active:bg-surface-2"><ChevronLeft size={24} strokeWidth={2.2} /></Link> : <span className="pl-2"><Logo dark size={26} /></span>}
      </div>
      {titel ? <h1 className="flex-1 text-center font-display font-semibold text-[17px] tracking-[-0.01em] truncate px-1">{titel}</h1> : <div className="flex-1" />}
      <div className="flex items-center justify-end min-w-[44px] pr-1">{rechts}</div>
    </header>
  );
}
