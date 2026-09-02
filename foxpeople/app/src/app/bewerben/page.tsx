import type { Metadata } from "next";
import { BewerbungsFormular } from "./formular";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "In 30 Sekunden bewerben – Fox & People",
  description: "Kein Lebenslauf, kein Anschreiben. Name, Handynummer, was du kannst – wir rufen zurück.",
  robots: { index: true, follow: true },
};

/** Allgemeine Kurzbewerbung – Ziel des QR-Codes auf Flyer, Aushang, Fahrzeug und Einsatzbestätigung. */
export default async function BewerbenPage({ searchParams }: { searchParams: Promise<{ ok?: string; fehler?: string; q?: string }> }) {
  const sp = await searchParams;
  return <BewerbungsFormular quelle={sp.q} ok={!!sp.ok} fehler={sp.fehler} />;
}
