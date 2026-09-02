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

const ICON = { size: 17, strokeWidth: 1.75 } as const;

function Group({ children }: { children: string }) {
  return <div className="hidden lg:block section-title px-3 pt-5 pb-1.5 text-[12.5px] font-semibold">{children}</div>;
}

export function Sidebar({ rolle, admin, offeneAufgaben, neueNachrichten = 0, offeneNachweise = 0, offeneFehler = 0 }: { rolle: string; admin: boolean; offeneAufgaben: number; neueNachrichten?: number; offeneNachweise?: number; offeneFehler?: number }) {
  const zentrale = admin || rolle === "ZENTRALE";
  const path = usePathname();
  const bereich = useSearchParams().get("bereich");
  const active = (href: string) => { if (href === "/") return path === "/"; const [p, q] = href.split("?"); if (q) return path.startsWith(p) && bereich != null && q.endsWith(bereich); return path.startsWith(href); };
  return (
    // Helle, leicht getönte Seitenleiste wie in Finder oder Mail; die Tinte-Farbe bleibt Login und Hervorhebungen vorbehalten
    <aside className="bg-surface-2/70 border-b lg:border-b-0 lg:border-r border-line lg:min-h-screen lg:sticky lg:top-0 lg:h-screen flex lg:flex-col px-3 py-2 lg:py-5 overflow-x-auto lg:overflow-y-auto">
      <Link href="/" className="hidden lg:block px-3 mb-6">
        <Logo dark size={34} />
        <div className="text-[12.5px] text-muted mt-1 pl-px">Personaldisposition</div>
      </Link>
      <nav className="flex lg:flex-col gap-1 lg:gap-0.5 flex-1">
        {items.filter((it) => !it.nurZentrale || zentrale).map((it) => (
          <div key={it.href} className="lg:contents">
            {it.group && <Group>{it.group}</Group>}
            <Link href={it.href} className={clsx("nav-link", active(it.href) && "active")}>
              <it.icon {...ICON} />
              <span className="whitespace-nowrap">{it.label}</span>
              {it.href === "/aufgaben" && offeneAufgaben > 0 && <span className="nav-count">{offeneAufgaben}</span>}
              {it.href === "/nachrichten" && neueNachrichten > 0 && <span className="nav-count">{neueNachrichten}</span>}
              {it.href === "/stundennachweise" && offeneNachweise > 0 && <span className="nav-count nav-count-quiet">{offeneNachweise}</span>}
            </Link>
          </div>
        ))}
        {zentrale && <Link href="/controlling" className={clsx("nav-link", active("/controlling") && !path.startsWith("/controlling/kosten") && "active")}><BarChart3 {...ICON} /><span className="whitespace-nowrap">Controlling</span></Link>}
        {zentrale && <Link href="/controlling/kosten" className={clsx("nav-link", active("/controlling/kosten") && "active")}><Wallet {...ICON} /><span className="whitespace-nowrap">Kosten</span></Link>}
        {zentrale && (
          <Link href="/fehler" className={clsx("nav-link", active("/fehler") && "active")}>
            <AlertTriangle {...ICON} />
            <span className="whitespace-nowrap">Systemprotokoll</span>
            {offeneFehler > 0 && <span className="nav-count">{offeneFehler}</span>}
          </Link>
        )}
        {!admin && (
          <>
            <Group>Konto</Group>
            <Link href="/einstellungen?tab=konto" className={clsx("nav-link", active("/einstellungen") && "active")}><Settings {...ICON} /><span className="whitespace-nowrap">Mein Konto (Passwort, 2FA)</span></Link>
          </>
        )}
        {admin && (
          <>
            <Group>System</Group>
            <Link href="/assistent" className={clsx("nav-link", active("/assistent") && "active")}><Sparkles {...ICON} /><span className="whitespace-nowrap">Wissensassistent</span></Link>
            <Link href="/einstellungen" className={clsx("nav-link", active("/einstellungen") && "active")}><Settings {...ICON} /><span className="whitespace-nowrap">Einstellungen</span></Link>
          </>
        )}
      </nav>
      <a href="/app" target="_blank" className="hidden lg:flex items-center gap-2 px-3 pt-4 text-[12.5px] font-medium text-muted hover:text-ink transition-colors"><Smartphone size={13} /> Mitarbeiter-App öffnen</a>
      <div className="hidden lg:block px-3 pt-2 text-[11px] text-muted/80">WIFI-NÖ-Schema 2023 · v{VERSION}</div>
    </aside>
  );
}
