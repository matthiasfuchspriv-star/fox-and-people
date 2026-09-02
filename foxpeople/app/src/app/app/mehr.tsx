"use client";
import { useState } from "react";
import Link from "next/link";
import { CalendarX, FileText, Building2, ListChecks, Star, Gift, ChevronDown, ChevronUp } from "lucide-react";

const ICONS = {
  urlaub: CalendarX,
  dokumente: FileText,
  einsatz: Building2,
  checkliste: ListChecks,
  bewerten: Star,
  empfehlen: Gift,
} as const;

export interface MehrEintrag { href: string; label: string; sub: string; icon: keyof typeof ICONS; badge?: number }

/**
 * Alles, was nicht täglich gebraucht wird, liegt eingeklappt hinter „Mehr“. Auf der Startseite bleiben
 * dadurch vier Kacheln – genug, um mit einer Hand und ohne Suchen zu treffen.
 */
export function MehrKacheln({ eintraege, label, wenigerLabel }: { eintraege: MehrEintrag[]; label: string; wenigerLabel: string }) {
  const [offen, setOffen] = useState(false);
  const offeneBadges = eintraege.reduce((a, e) => a + (e.badge ?? 0), 0);
  return (
    <div>
      <button onClick={() => setOffen(!offen)} className="w-full flex items-center justify-center gap-1.5 py-2.5 text-[13.5px] font-semibold text-muted">
        {offen ? <>{wenigerLabel} <ChevronUp size={16} /></> : <>{label} {offeneBadges > 0 && <span className="bg-fox text-white text-[11px] font-bold rounded-full px-1.5">{offeneBadges}</span>} <ChevronDown size={16} /></>}
      </button>
      {offen && (
        <div className="grid grid-cols-2 gap-3">
          {eintraege.map((e) => {
            const Icon = ICONS[e.icon];
            return (
              <Link key={e.href + e.label} href={e.href} className="card card-pad !p-4 relative">
                <div className="text-fox"><Icon size={20} /></div>
                <div className="font-semibold text-[14px] mt-2">{e.label}</div>
                <div className="text-[12px] text-muted">{e.sub}</div>
                {e.badge ? <span className="absolute top-3 right-3 bg-fox text-white text-[11px] font-bold rounded-full px-1.5 min-w-[20px] text-center">{e.badge}</span> : null}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
