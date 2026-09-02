import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { einstellung } from "@/lib/einstellungen";
import { werberZuCode } from "@/lib/werbelink";
import { EMPFEHLUNG_DEFAULT, type EmpfehlungConfig } from "@/lib/empfehlung";
import { BewerbungsFormular } from "../../bewerben/formular";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Jobempfehlung – Fox & People", robots: { index: false, follow: false } };

/** Persönlicher Empfehlungs-Link: der Freund bewirbt sich selbst, die Zuordnung zum Werber passiert automatisch. */
export default async function WerbeLink({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ ok?: string; fehler?: string }> }) {
  const { code } = await params;
  const sp = await searchParams;
  const werber = await werberZuCode(code);
  if (!werber) notFound();
  const cfg = { ...EMPFEHLUNG_DEFAULT, ...(await einstellung<Partial<EmpfehlungConfig>>("empfehlung", {})) };
  if (!cfg.aktiv) return <BewerbungsFormular quelle="Empfehlung (Programm pausiert)" ok={!!sp.ok} fehler={sp.fehler} />;
  return <BewerbungsFormular werber={werber} code={code} ok={!!sp.ok} fehler={sp.fehler} praemieGeworbener={cfg.praemieGeworbener} />;
}
