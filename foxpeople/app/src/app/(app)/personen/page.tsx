import Link from "next/link";
import { Fuechse } from "@/components/fuechse";
import { Plus, ShieldAlert, Upload } from "lucide-react";
import { requireSession, tenantWhere, darfSensibel } from "@/lib/auth";
import { db } from "@/lib/db";
import { datum } from "@/lib/format";
import { PageHeader, Card, Empty, personStatusBadge, Badge } from "@/components/ui";
import type { PersonStatus } from "@/generated/prisma/enums";
import { kranktage365 } from "@/lib/person-stats";

export const dynamic = "force-dynamic";


/** Klickbare Spaltenüberschrift: erster Klick sortiert absteigend, zweiter aufsteigend. */
function SortLink({ feld, aktiv, richtung, basis, children }: { feld: string; aktiv: boolean; richtung: "asc" | "desc"; basis: string; children: React.ReactNode }) {
  const neu = aktiv && richtung === "desc" ? "asc" : "desc";
  return (
    <Link href={`/personen?${basis}&sort=${feld}&richtung=${neu}`} className="inline-flex items-center gap-1 hover:text-brand">
      {children}<span className={aktiv ? "" : "opacity-30"}>{aktiv && richtung === "asc" ? "▲" : "▼"}</span>
    </Link>
  );
}

export default async function PersonenPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; rolle?: string; seite?: string; bereich?: string; geloescht?: string; sort?: string; richtung?: string; proSeite?: string }> }) {
  const s = await requireSession();
  const sensibel = darfSensibel(s);
  const sp = await searchParams;
  // Zwei getrennte Bereiche: Bewerber (Pool + Sperrliste) und Mitarbeiter (aktiv + ausgeschieden)
  const bereich = sp.bereich === "mitarbeiter" ? "mitarbeiter" : "bewerber";
  const STATUS = bereich === "bewerber"
    ? [{ key: "", label: "Alle Bewerber" }, { key: "SUCHT", label: "Bewerber-Pool" }, { key: "GESPERRT", label: "Sperrliste" }]
    : [{ key: "", label: "Aktive Mitarbeiter" }, { key: "VERMITTELT", label: "Im Einsatz" }, { key: "AUSGESCHIEDEN", label: "Ausgeschieden" }];
  const status = (sp.status ?? "") as PersonStatus | "";
  const q = sp.q?.trim() ?? "";
  const seite = Math.max(1, Number(sp.seite) || 1);
  // Seitengröße frei wählbar – bei mehreren tausend Bewerbern will man nicht durch 30 Seiten blättern
  const GROESSEN = [25, 50, 100, 200];
  const take = GROESSEN.includes(Number(sp.proSeite)) ? Number(sp.proSeite) : 50;
  // Voreinstellung im Bewerberbereich: neueste Bewerbung oben
  const sort = sp.sort === "name" ? "name" : "beworben";
  const richtung = sp.richtung === "asc" ? "asc" as const : "desc" as const;
  const sortierung = sort === "name"
    ? [{ nachname: richtung }, { vorname: richtung }]
    : [{ aufnahmedatum: richtung }, { nachname: "asc" as const }];
  // Bewerber-Pool (SUCHT) ist für alle Kostenstellen sichtbar; alles andere bleibt getrennt
  const tw = tenantWhere(s);
  const sichtbar = status === "SUCHT" ? { status: "SUCHT" as PersonStatus } : status ? { ...tw, status } : bereich === "bewerber" ? { OR: [{ status: "SUCHT" as PersonStatus }, { ...tw, status: "GESPERRT" as PersonStatus }] } : { ...tw, status: "VERMITTELT" as PersonStatus };
  const where = {
    ...sichtbar,
    ...(q ? { OR: [{ nachname: { contains: q, mode: "insensitive" as const } }, { vorname: { contains: q, mode: "insensitive" as const } }, { standardrolle: { contains: q, mode: "insensitive" as const } }, { ort: { contains: q, mode: "insensitive" as const } }, { hinterlegterKunde: { firmenname: { contains: q, mode: "insensitive" as const } } }] } : {}),
  };
  const [personen, total, counts] = await Promise.all([
    db.person.findMany({ where, orderBy: sortierung, skip: (seite - 1) * take, take, include: { hinterlegterKunde: { select: { firmenname: true } }, qualifikationen: true, kostenstelle: { select: { name: true } }, abwesenheiten: { where: { typ: "KRANKENSTAND" } }, bewertungen: { select: { sterne: true } }, einsaetze: { where: { status: "AKTIV" }, include: { kunde: { select: { firmenname: true } } }, take: 1 } } }),
    db.person.count({ where }),
    db.person.groupBy({ by: ["status"], where: { OR: [{ status: "SUCHT" }, tw] }, _count: true }),
  ]);
  const cnt = (k: string) => (k ? counts.find((c) => c.status === k)?._count ?? 0 : bereich === "bewerber" ? counts.filter((c) => c.status === "SUCHT" || c.status === "GESPERRT").reduce((a, c) => a + c._count, 0) : counts.find((c) => c.status === "VERMITTELT")?._count ?? 0);
  const heute = new Date();
  const seiten = Math.ceil(total / take);
  /** gemeinsame Parameter aller Links auf dieser Seite – ohne Seite und Sortierung */
  const basis = `bereich=${bereich}&status=${status}&q=${encodeURIComponent(q)}&proSeite=${take}`;
  const link = (extra: string) => `/personen?${basis}&${extra}`;

  return (
    <>
      <PageHeader title={bereich === "bewerber" ? "Bewerber" : "Mitarbeiter"} sub={bereich === "bewerber" ? "Bewerber-Pool (für alle Kostenstellen sichtbar) und Sperrliste. Sobald ein Einsatz geplant wird, wandert die Person automatisch zu den Mitarbeitern." : "Aktive Mitarbeiter im Einsatz und ausgeschiedene Mitarbeiter. Ohne Einsatz kehrt eine Person automatisch in den Bewerber-Pool zurück."} actions={<><Link href="/personen/geburtstage" className="btn btn-secondary">Geburtstage</Link><Link href={bereich === "bewerber" ? "/personen/import" : "/personen/import?art=MITARBEITER"} className="btn btn-secondary"><Upload size={16} /> Aus Liste importieren</Link><Link href="/personen/neu" className="btn btn-primary"><Plus size={16} /> Person aufnehmen</Link></>} />
      {sp.geloescht && <div className="alert alert-teal mb-4">{sp.geloescht} wurde endgültig gelöscht.</div>}
      <div className="flex flex-wrap items-center gap-2 mb-4 reveal">
        {STATUS.map((st) => (
          <Link key={st.key} href={`/personen?bereich=${bereich}&status=${st.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={`chip-filter ${status === st.key ? "active" : ""}`}>
            {st.label} <span className="opacity-70 num">{cnt(st.key)}</span>
          </Link>
        ))}
        <form className="ml-auto flex gap-2">
          {status && <input type="hidden" name="status" value={status} />}<input type="hidden" name="bereich" value={bereich} />
          <input name="q" defaultValue={q} placeholder="Name, Rolle, Ort, Kunde…" className="input !w-64" />
          <button className="btn btn-secondary">Suchen</button>
        </form>
      </div>
      <Card pad={false} className="reveal reveal-2">
        {personen.length === 0 ? (
          <Empty title="Keine Personen gefunden" text={q ? `Keine Treffer für „${q}“.` : "Lege die erste Person an – Bewerber landen automatisch im Pool."} action={<Link href="/personen/neu" className="btn btn-primary btn-sm">Person aufnehmen</Link>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th><SortLink feld="name" aktiv={sort === "name"} richtung={richtung} basis={basis}>Name</SortLink></th>
                  <th>Status</th><th>Rolle / Position</th><th>Qualifikationen</th><th>Kunde / Einsatz</th><th>Verfügbar</th><th>Bewertung</th><th className="r">Krank 365 T.</th><th>Ort</th>
                  <th className="r"><SortLink feld="beworben" aktiv={sort === "beworben"} richtung={richtung} basis={basis}>Beworben am</SortLink></th>
                </tr>
              </thead>
              <tbody>
                {personen.map((p) => {
                  const abgelaufen = p.qualifikationen.some((qu) => qu.gultigBis && qu.gultigBis < heute);
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/personen/${p.id}`} className="row-link">{p.nachname} {p.vorname}</Link>
                        {p.geburtsdatum && <div className="text-[12px] text-muted">geb. {datum(p.geburtsdatum)}</div>}
                      </td>
                      <td>{personStatusBadge(p.status)}{p.amsGefoerdert && sensibel && <div className="mt-1"><Badge tone="teal">AMS</Badge></div>}</td>
                      <td>{p.standardrolle ?? <span className="text-muted">–</span>}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {p.qualifikationen.slice(0, 3).map((qu) => (
                            <span key={qu.id} className={`badge ${qu.gultigBis && qu.gultigBis < heute ? "badge-red" : "badge-grey"}`}>{qu.typ}</span>
                          ))}
                          {p.qualifikationen.length > 3 && <span className="text-muted text-[12px]">+{p.qualifikationen.length - 3}</span>}
                          {abgelaufen && <ShieldAlert size={14} className="text-red" />}
                        </div>
                      </td>
                      <td>{p.einsaetze[0]?.kunde.firmenname ?? p.hinterlegterKunde?.firmenname ?? <span className="text-muted">–</span>}</td>
                      <td>{p.status === "GESPERRT" ? <Badge tone="red">seit {datum(p.gesperrtSeit)}</Badge> : p.verfuegbarSofort ? <Badge tone="teal">sofort</Badge> : p.verfuegbarAb ? datum(p.verfuegbarAb) : <span className="text-muted">–</span>}</td>
                      <td>{p.bewertungen.length ? <Fuechse n={p.bewertungen.reduce((a, b) => a + b.sterne, 0) / p.bewertungen.length} size="text-[12px]" /> : <span className="text-muted">–</span>}</td>
                      <td className="r num">{p.status === "VERMITTELT" ? <span className={kranktage365(p.abwesenheiten) > 10 ? "text-red font-semibold" : ""}>{kranktage365(p.abwesenheiten)}</span> : <span className="text-muted">–</span>}</td>
                      <td className="text-muted">{[p.plz, p.ort].filter(Boolean).join(" ")}{p.status === "SUCHT" && <div className="text-[11px]">{p.kostenstelle.name}</div>}</td>
                      <td className="r text-muted">{datum(p.aufnahmedatum)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-line text-[13px] text-muted">
          <span>{total} Personen{seiten > 1 ? ` · Seite ${seite} von ${seiten}` : ""}</span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">Pro Seite:{GROESSEN.map((g) => (
              <Link key={g} href={`/personen?bereich=${bereich}&status=${status}&q=${encodeURIComponent(q)}&proSeite=${g}&sort=${sort}&richtung=${richtung}`}
                className={`px-1.5 rounded ${g === take ? "font-bold text-ink" : "hover:text-brand"}`}>{g}</Link>
            ))}</span>
            {seiten > 1 && <span className="flex gap-2">
              {seite > 1 && <Link className="btn btn-secondary btn-sm" href={link(`sort=${sort}&richtung=${richtung}&seite=${seite - 1}`)}>Zurück</Link>}
              {seite < seiten && <Link className="btn btn-secondary btn-sm" href={link(`sort=${sort}&richtung=${richtung}&seite=${seite + 1}`)}>Weiter</Link>}
            </span>}
          </div>
        </div>
      </Card>
    </>
  );
}
