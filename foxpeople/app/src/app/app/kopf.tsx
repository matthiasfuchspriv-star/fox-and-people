import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Logo } from "@/components/login-shell";

/** Kopfzeile der App-Seiten */
export function AppKopf({ titel, zurueck, rechts }: { titel?: string; zurueck?: string; rechts?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-10 text-white px-4 py-3 flex items-center gap-3" style={{ background: "#10222a", paddingTop: "max(12px, env(safe-area-inset-top))" }}>
      {zurueck ? <Link href={zurueck} className="-ml-1 p-1 text-white/80"><ChevronLeft size={22} /></Link> : <Logo size={26} />}
      {titel && <div className="font-display font-bold text-[17px] flex-1 truncate">{titel}</div>}
      {!titel && <div className="flex-1" />}
      {rechts}
    </header>
  );
}
