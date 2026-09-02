import Link from "next/link";
import clsx from "clsx";
import type { ReactNode } from "react";

export function PageHeader({ title, sub, actions, crumbs }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; crumbs?: { href?: string; label: string }[] }) {
  return (
    // relative z-20: Die Reveal-Animation erzeugt einen Stacking-Context – ohne eigenes z-index
    // läge ein Dropdown aus dem Kopf (z. B. der Anruf-Knopf) unter den später gezeichneten Karten.
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6 reveal relative z-20">
      <div>
        {crumbs && (
          <div className="flex items-center gap-1.5 text-[12.5px] text-muted mb-1.5">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {c.href ? <Link href={c.href} className="hover:text-ink">{c.label}</Link> : <span>{c.label}</span>}
                {i < crumbs.length - 1 && <span className="opacity-50">/</span>}
              </span>
            ))}
          </div>
        )}
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className, title, actions, pad = true, id }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode; pad?: boolean; id?: string }) {
  return (
    <section id={id} className={clsx("card", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
          <h2 className="font-display font-semibold text-[15px] tracking-[-0.01em]">{title}</h2>
          {actions}
        </header>
      )}
      <div className={clsx(pad && (title ? "px-5 pb-5" : "card-pad"))}>{children}</div>
    </section>
  );
}

export function Kpi({ label, value, sub, tone, className }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "teal" | "red" | "fox" | "brand" | "amber"; className?: string }) {
  const color = tone === "teal" ? "text-teal" : tone === "red" ? "text-red" : tone === "fox" ? "text-fox" : tone === "amber" ? "text-amber" : "";
  return (
    <div className={clsx("kpi reveal", className)}>
      <div className="label">{label}</div>
      <div className={clsx("value", color)}>{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export function Badge({ tone, children }: { tone: "teal" | "brand" | "fox" | "red" | "amber" | "grey" | "violet"; children: ReactNode }) {
  return <span className={clsx("badge", `badge-${tone}`)}>{children}</span>;
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="text-center py-14 px-6">
      <div className="mx-auto w-12 h-12 avatar bg-surface-2 text-muted mb-3">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M4 12h10M4 17h7" strokeLinecap="round" /></svg>
      </div>
      <h3 className="font-display font-semibold text-[15px]">{title}</h3>
      {text && <p className="text-muted text-[13px] mt-1 max-w-sm mx-auto">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Field({ label, children, help, className, required }: { label: string; children: ReactNode; help?: string; className?: string; required?: boolean }) {
  return (
    <div className={clsx("field", className)}>
      <label className="label">{label}{required && <span className="text-muted font-normal ml-1" title="Pflichtfeld">·</span>}</label>
      {children}
      {help && <div className="help">{help}</div>}
    </div>
  );
}

export function Gauge({ kosten, preis }: { kosten: number; preis: number | null }) {
  if (!preis || preis <= 0) return <div className="gauge"><div className="cost" style={{ width: "100%", opacity: 0.35 }} /></div>;
  const c = Math.min(100, (kosten / preis) * 100);
  const neg = kosten > preis;
  return (
    <div className="gauge" title={`Selbstkosten ${c.toFixed(0)} % des Verrechnungssatzes`}>
      <div className={neg ? "neg" : "cost"} style={{ width: `${neg ? 100 : c}%` }} />
      {!neg && <div className="db1" style={{ width: `${100 - c}%` }} />}
    </div>
  );
}

/** Initialen oder Foto als Squircle – wie in Kontakte. */
export function Avatar({ name, src, size = 40, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const initialen = name.split(/\s+/).filter(Boolean).slice(0, 2).map((t) => t[0]?.toUpperCase()).join("");
  return (
    <span className={clsx("avatar", className)} style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }} aria-hidden>
      {src ? <img src={src} alt="" /> : initialen}
    </span>
  );
}

export function Stat({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex justify-between gap-4 py-2 border-b border-line last:border-0 text-[13.5px]", className)}>
      <span className="text-muted">{label}</span>
      <span className="num font-semibold text-right">{value}</span>
    </div>
  );
}

export function personStatusBadge(status: string) {
  switch (status) {
    case "VERMITTELT": return <Badge tone="teal">Aktiv / Vermittelt</Badge>;
    case "SUCHT": return <Badge tone="brand">Bewerber-Pool</Badge>;
    case "GESPERRT": return <Badge tone="red">Gesperrt</Badge>;
    case "AUSGESCHIEDEN": return <Badge tone="grey">Ausgeschieden</Badge>;
    default: return <Badge tone="grey">{status}</Badge>;
  }
}
export function angebotStatusBadge(status: string) {
  switch (status) {
    case "ENTWURF": return <Badge tone="grey">Entwurf</Badge>;
    case "VERSENDET": return <Badge tone="brand">Versendet</Badge>;
    case "ANGENOMMEN": return <Badge tone="teal">Angenommen</Badge>;
    case "ABGELEHNT": return <Badge tone="red">Abgelehnt</Badge>;
    case "ABGELAUFEN": return <Badge tone="amber">Abgelaufen</Badge>;
    default: return <Badge tone="grey">{status}</Badge>;
  }
}
export function rechnungStatusBadge(status: string) {
  switch (status) {
    case "ENTWURF": return <Badge tone="grey">Entwurf</Badge>;
    case "VERSENDET": return <Badge tone="brand">Offen</Badge>;
    case "TEILBEZAHLT": return <Badge tone="amber">Teilbezahlt</Badge>;
    case "BEZAHLT": return <Badge tone="teal">Bezahlt</Badge>;
    case "UEBERFAELLIG": return <Badge tone="red">Überfällig</Badge>;
    case "STORNIERT": return <Badge tone="grey">Storniert</Badge>;
    default: return <Badge tone="grey">{status}</Badge>;
  }
}
export function einsatzStatusBadge(status: string) {
  switch (status) {
    case "GEPLANT": return <Badge tone="brand">Geplant</Badge>;
    case "AKTIV": return <Badge tone="teal">Aktiv</Badge>;
    case "BEENDET": return <Badge tone="grey">Beendet</Badge>;
    case "ABGEBROCHEN": return <Badge tone="red">Abgebrochen</Badge>;
    default: return <Badge tone="grey">{status}</Badge>;
  }
}
export function vertragStatusBadge(status: string) {
  switch (status) {
    case "ENTWURF": return <Badge tone="grey">Entwurf</Badge>;
    case "VERSENDET": return <Badge tone="brand">Versendet</Badge>;
    case "UNTERSCHRIEBEN": return <Badge tone="teal">Unterschrieben</Badge>;
    case "BEENDET": return <Badge tone="grey">Beendet</Badge>;
    default: return <Badge tone="grey">{status}</Badge>;
  }
}
