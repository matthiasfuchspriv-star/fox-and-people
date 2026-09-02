import type { ReactNode } from "react";

export function LoginShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen grid lg:grid-cols-[1.1fr_1fr]">
      <section className="hidden lg:flex flex-col justify-between p-12 text-white relative overflow-hidden bg-brand-ink">
        <div className="absolute -right-32 -top-32 w-[520px] h-[520px] rounded-full opacity-20" style={{ background: "radial-gradient(closest-side, #b4522c, transparent)" }} />
        <div className="relative"><Logo size={40} /></div>
        <div className="relative max-w-md">
          <p className="text-[12.5px] font-medium text-white/60 mb-3">Personaldisposition · Verrechnung · Controlling</p>
          <h1 className="font-display text-[40px] leading-[1.05] font-bold tracking-[-0.035em]">Ein Arbeitsplatz für den ganzen Tag in der Personaldisposition.</h1>
          <p className="mt-4 text-white/70 text-[15px] leading-relaxed">Bewerber, Einsätze, Angebote mit DB1 in Echtzeit, Rechnungen und Rückstellungen – nach dem WIFI-NÖ-Kalkulationsschema, getrennt je Kostenstelle.</p>
        </div>
        <p className="text-white/45 text-xs relative">Blackburn Beteiligungs GmbH · Fox & People · Fox & System</p>
      </section>
      <section className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8"><Logo dark size={34} /></div>
          {children}
        </div>
      </section>
    </main>
  );
}

export function Logo({ dark, size = 36 }: { dark?: boolean; size?: number }) {
  // Wortmarke wie auf der Website: "Fox & People", das "&" in der Akzentfarbe
  return (
    <span className="inline-flex items-center" style={{ height: size }}>
      <span className="wordmark" style={{ fontSize: size * 0.52, color: dark ? "var(--ink)" : "#f7f6f2", lineHeight: 1 }}>Fox <span style={{ color: "var(--fox)" }}>&</span> People</span>
    </span>
  );
}
