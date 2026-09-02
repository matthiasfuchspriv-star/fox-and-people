import { MapPin, Phone, Clock, ShieldAlert, Building2 } from "lucide-react";
import { requireApp } from "@/lib/app-auth";
import { db } from "@/lib/db";
import { datum } from "@/lib/format";
import { AppShell, appMetadata, appViewport } from "../shell";
import { AppKopf } from "../kopf";

export const metadata = appMetadata; export const viewport = appViewport; export const dynamic = "force-dynamic";

/**
 * Alles zum aktuellen Einsatz: Adresse, Ansprechperson, Arbeitszeit, Sicherheitshinweise.
 * Bewusst ohne Wochenplan – der Einsatzplan wird vor Ort disponiert, wir könnten seine Richtigkeit
 * nicht garantieren, und ein falscher Plan in der App ist schlimmer als gar keiner.
 */
export default async function AppEinsatz() {
  const s = await requireApp();
  const einsatz = await db.einsatz.findFirst({
    where: { personId: s.personId, status: { in: ["AKTIV", "GEPLANT"] } },
    orderBy: [{ status: "asc" }, { von: "asc" }],
    include: { kunde: { include: { ansprechpartner: true } } },
  });
  if (!einsatz) return (
    <AppShell><AppKopf titel="Mein Einsatz" zurueck="/app" />
      <div className="px-4 pt-4"><section className="card card-pad text-[13.5px] text-muted">Derzeit ist kein Einsatz geplant. Wenn du kurzfristig verfügbar bist, schreib uns im Chat – wir melden uns, sobald etwas Passendes da ist.</section></div>
    </AppShell>
  );
  const dispo = einsatz.kunde.ansprechpartner.find((a) => a.rollen.includes("DISPOSITION")) ?? einsatz.kunde.ansprechpartner.find((a) => a.istHaupt);
  const quals = Array.isArray(einsatz.kunde.erforderlicheQualifikationen) ? (einsatz.kunde.erforderlicheQualifikationen as string[]) : [];
  const adresse = einsatz.einsatzort ?? [einsatz.kunde.strasse, [einsatz.kunde.plz, einsatz.kunde.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return (
    <AppShell>
      <AppKopf titel="Mein Einsatz" zurueck="/app" />
      <div className="px-4 pt-4 space-y-4">
        <section className="card card-pad">
          <div className="section-title mb-1 flex items-center gap-1.5"><Building2 size={14} /> {einsatz.status === "AKTIV" ? "Aktueller Einsatz" : "Geplanter Einsatz"}</div>
          <h1 className="font-display font-bold text-[20px]">{einsatz.kunde.firmenname}</h1>
          <p className="text-[13.5px] text-muted">{einsatz.rolleImEinsatz} · ab {datum(einsatz.von)}{einsatz.bis ? ` bis ${datum(einsatz.bis)}` : " (offenes Ende)"}</p>
          <div className="mt-3 space-y-2 text-[13.5px]">
            <div className="flex items-start gap-2"><MapPin size={15} className="mt-0.5 text-fox shrink-0" /><span>{adresse || "Adresse folgt"}{einsatz.kundenKostenstelle ? <span className="text-muted"> · {einsatz.kundenKostenstelle}</span> : null}</span></div>
            {dispo && <div className="flex items-start gap-2"><Phone size={15} className="mt-0.5 text-fox shrink-0" /><span>Vor Ort: {dispo.name}{dispo.funktion ? ` (${dispo.funktion})` : ""}{dispo.telefon ? <> · <a href={`tel:${dispo.telefon}`} className="text-brand font-semibold">{dispo.telefon}</a></> : ""}</span></div>}
            <div className="flex items-start gap-2"><Clock size={15} className="mt-0.5 text-fox shrink-0" /><span>{einsatz.kunde.arbeitszeitmodell ?? `${einsatz.wochenstunden} h/Woche`}{einsatz.schichtmodell !== "TAG" ? ` · ${({ ZWEI_SCHICHT: "2-Schicht", DREI_SCHICHT: "3-Schicht", FREI: "nach Bedarf" } as Record<string, string>)[einsatz.schichtmodell] ?? ""}` : ""}</span></div>
          </div>
          <a href={`https://maps.google.com/?q=${encodeURIComponent(adresse)}`} target="_blank" className="btn btn-secondary btn-sm mt-3">Route öffnen</a>
        </section>

        {(quals.length > 0 || einsatz.kunde.anforderungen) && (
          <section className="card card-pad">
            <div className="section-title mb-1 flex items-center gap-1.5"><ShieldAlert size={14} /> Was du mitbringen musst</div>
            {quals.length > 0 && <div className="flex flex-wrap gap-1.5 mb-2">{quals.map((q) => <span key={q} className="badge badge-brand">{q}</span>)}</div>}
            {einsatz.kunde.anforderungen && <p className="text-[13.5px]">{einsatz.kunde.anforderungen}</p>}
            <p className="help mt-2">Schutzausrüstung und die Sicherheitsunterweisung stellt der Beschäftiger vor Ort (§ 6 AÜG). Wenn etwas fehlt oder unklar ist: sofort bei uns melden, nicht einfach anfangen.</p>
          </section>
        )}

        <section className="card card-pad text-[13px] text-muted">
          <div className="font-semibold text-ink mb-1">Wichtig</div>
          Krankmeldung immer <b>telefonisch vor Arbeitsbeginn</b> bei uns – nicht nur beim Beschäftiger und nicht über die App.
        </section>
      </div>
    </AppShell>
  );
}
