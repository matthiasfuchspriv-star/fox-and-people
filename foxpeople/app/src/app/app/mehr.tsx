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
      <button onClick={() => setOffen(!offen)} className="w-full min-h-[44px] flex items-center justify-center gap-1.5 py-2 text-[14px] font-medium text-fox-ink rounded-[9px] active:bg-surface-2">
        {offen ? <>{wenigerLabel} <ChevronUp size={16} /></> : <>{label} {offeneBadges > 0 && <span className="nav-count !ml-0">{offeneBadges}</span>} <ChevronDown size={16} /></>}
      </button>
      {offen && (
        <div className="grid grid-cols-2 gap-3 mt-1">
          {eintraege.map((e) => {
            const Icon = ICONS[e.icon];
            return (
              <Link key={e.href + e.label} href={e.href} className="app-tile">
                <div className="app-row-icon"><Icon size={16} /></div>
                <div className="font-semibold text-[15px] mt-3 leading-tight">{e.label}</div>
                <div className="text-[12.5px] text-muted mt-0.5">{e.sub}</div>
                {e.badge ? <span className="nav-count absolute top-3 right-3 !ml-0">{e.badge}</span> : null}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
