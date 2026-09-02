"use client";
import Link from "next/link";
import { VERSION } from "@/lib/version";
import { usePathname, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { LayoutDashboard, Users, UserCheck, Building2, CalendarRange, FileSignature, Receipt, CalendarCheck, BellRing, Settings, Sparkles, BarChart3, MessageCircle, ClipboardCheck, Gift, Smartphone, ShieldCheck, type LucideIcon, Wallet, AlertTriangle, Scale } from "lucide-react";
import { Logo } from "./login-shell";

const items: { href: string; label: string; icon: LucideIcon; group?: string; nurZentrale?: boolean }[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/aufgaben", label: "Wiedervorlagen", icon: BellRing },
  { href: "/personen?bereich=bewerber", label: "Bewerber", icon: Users, group: "Stammdaten" },
  { href: "/personen?bereich=mitarbeiter", label: "Mitarbeiter", icon: UserCheck },
  { href: "/kunden", label: "Kunden", icon: Building2 },
  { href: "/einsaetze", label: "Einsatzplanung", icon: CalendarRange, group: "Tagesgeschäft" },
  { href: "/vertraege", label: "Verträge", icon: FileSignature },
  { href: "/compliance", label: "Compliance & Fristen", icon: ShieldCheck },
  { href: "/kollektivvertraege", label: "Kollektivverträge", icon: Scale, nurZentrale: true },
  { href: "/abrechnung", label: "Monatsabrechnung", icon: CalendarCheck, group: "Verrechnung", nurZentrale: true },
  { href: "/rechnungen", label: "Rechnungen", icon: Receipt, nurZentrale: true },
  { href: "/nachrichten", label: "Nachrichten", icon: MessageCircle, group: "Mitarbeiter-App" },
  { href: "/stundennachweise", label: "Stundennachweise", icon: ClipboardCheck },
  { href: "/empfehlungen", label: "Freunde werben Freunde", icon: Gift },
];

export function Sidebar({ rolle, admin, offeneAufgaben, neueNachrichten = 0, offeneNachweise = 0, offeneFehler = 0 }: { rolle: string; admin: boolean; offeneAufgaben: number; neueNachrichten?: number; offeneNachweise?: number; offeneFehler?: number }) {
  const zentrale = admin || rolle === "ZENTRALE";
  const path = usePathname();
  const bereich = useSearchParams().get("bereich");
  const active = (href: string) => { if (href === "/") return path === "/"; const [p, q] = href.split("?"); if (q) return path.startsWith(p) && q.endsWith(bereich ?? ""); return path.startsWith(href); };
  return (
    <aside className="bg-brand-ink text-white lg:min-h-screen lg:sticky lg:top-0 lg:h-screen flex lg:flex-col px-3 py-3 lg:py-5 overflow-x-auto lg:overflow-y-auto" style={{ background: "#10222a" }}>
      <Link href="/" className="hidden lg:block px-3 mb-7">
        <Logo size={34} />
        <div className="text-[11px] text-white/50 mt-1.5 pl-[15px] tracking-wide">Personaldisposition</div>
      </Link>
      <nav className="flex lg:flex-col gap-1 lg:gap-0.5 flex-1">
        {items.filter((it) => !it.nurZentrale || zentrale).map((it) => (
          <div key={it.href} className="lg:contents">
            {it.group && <div className="hidden lg:block section-title !text-white/35 px-3 pt-5 pb-2">{it.group}</div>}
            <Link href={it.href} className={clsx("nav-link", active(it.href) && "active")}>
              <it.icon size={17} strokeWidth={1.9} />
              <span className="whitespace-nowrap">{it.label}</span>
              {it.href === "/aufgaben" && offeneAufgaben > 0 && <span className="ml-auto text-[11px] font-bold bg-[#b4522c] text-white rounded-full px-1.5 py-0.5 min-w-[20px] text-center">{offeneAufgaben}</span>}
              {it.href === "/nachrichten" && neueNachrichten > 0 && <span className="ml-auto text-[11px] font-bold bg-[#b4522c] text-white rounded-full px-1.5 py-0.5 min-w-[20px] text-center">{neueNachrichten}</span>}
              {it.href === "/stundennachweise" && offeneNachweise > 0 && <span className="ml-auto text-[11px] font-bold bg-white/20 text-white rounded-full px-1.5 py-0.5 min-w-[20px] text-center">{offeneNachweise}</span>}
            </Link>
          </div>
        ))}
        {zentrale && <Link href="/controlling" className={clsx("nav-link", active("/controlling") && "active")}><BarChart3 size={17} strokeWidth={1.9} /><span className="whitespace-nowrap">Controlling</span></Link>}
        {zentrale && <Link href="/controlling/kosten" className={clsx("nav-link", active("/controlling/kosten") && "active")}><Wallet size={17} strokeWidth={1.9} /><span className="whitespace-nowrap">Kosten</span></Link>}
        {zentrale && (
          <Link href="/fehler" className={clsx("nav-link", active("/fehler") && "active")}>
            <AlertTriangle size={17} strokeWidth={1.9} />
            <span className="whitespace-nowrap">Systemprotokoll</span>
            {offeneFehler > 0 && <span className="ml-auto text-[11px] font-bold bg-[#b4522c] text-white rounded-full px-1.5 py-0.5 min-w-[20px] text-center">{offeneFehler}</span>}
          </Link>
        )}
        {!admin && (
          <>
            <div className="hidden lg:block section-title !text-white/35 px-3 pt-5 pb-2">Konto</div>
            <Link href="/einstellungen?tab=konto" className={clsx("nav-link", active("/einstellungen") && "active")}><Settings size={17} strokeWidth={1.9} /><span className="whitespace-nowrap">Mein Konto (Passwort, 2FA)</span></Link>
          </>
        )}
        {admin && (
          <>
            <div className="hidden lg:block section-title !text-white/35 px-3 pt-5 pb-2">System</div>
            <Link href="/assistent" className={clsx("nav-link", active("/assistent") && "active")}><Sparkles size={17} strokeWidth={1.9} /><span className="whitespace-nowrap">Wissensassistent</span></Link>
            <Link href="/einstellungen" className={clsx("nav-link", active("/einstellungen") && "active")}><Settings size={17} strokeWidth={1.9} /><span className="whitespace-nowrap">Einstellungen</span></Link>
          </>
        )}
      </nav>
      <a href="/app" target="_blank" className="hidden lg:flex items-center gap-2 px-3 pt-4 text-[11.5px] text-white/50 hover:text-white"><Smartphone size={13} /> Mitarbeiter-App öffnen</a>
      <div className="hidden lg:block px-3 pt-2 text-[11px] text-white/35">WIFI-NÖ-Schema 2023 · v{VERSION}</div>
    </aside>
  );
}
