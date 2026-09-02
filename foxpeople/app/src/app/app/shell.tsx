import type { Metadata, Viewport } from "next";
import { AppNav } from "./nav";
import { appSession } from "@/lib/app-auth";
import { stundenerfassungAktiv } from "@/lib/app-stunden";

export const appMetadata: Metadata = { title: "Fox & People – Mitarbeiter-App", manifest: "/app-manifest.json", appleWebApp: { capable: true, title: "Fox & People", statusBarStyle: "black-translucent" } };
// Kein maximumScale: Aufziehen mit zwei Fingern muss möglich bleiben (Lesebrille, WCAG 1.4.4)
export const appViewport: Viewport = { themeColor: "#10222a", width: "device-width", initialScale: 1 };

/** Mobile Shell der Mitarbeiter-App (je Seite eingebunden – ein Nested-Layout stolpert über die Next-Typgenerierung). */
export async function AppShell({ children, navLabels }: { children: React.ReactNode; navLabels?: Record<string, string> }) {
  // Der Stundenzettel ist nur sichtbar, wenn er für einen laufenden Einsatz freigeschaltet wurde
  const s = await appSession();
  const stunden = s ? await stundenerfassungAktiv(s.personId) : false;
  return (
    <div className="min-h-screen bg-bg flex flex-col max-w-lg mx-auto lg:border-x lg:border-line">
      <div className="flex-1 pb-20">{children}</div>
      <AppNav labels={navLabels} stunden={stunden} />
      <script dangerouslySetInnerHTML={{ __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/app-sw.js').catch(()=>{})}` }} />
    </div>
  );
}
