import { db } from "./db";
import { koordinatenOffline, distanzKm } from "./geo";
import { kranktage365 } from "./person-stats";

export interface Vorschlag {
  personId: string; name: string; rolle: string | null; ort: string | null; status: string;
  km: number | null; /** false = aus der Postleitzahl genähert, nicht hausgenau */ kmGenau: boolean; bewertung: number | null; anzahlBewertungen: number; kundenErfahrung: boolean; kranktage: number;
  qualiTreffer: string[]; qualiFehlend: string[]; rolleTreffer: boolean; verfuegbar: string; score: number; gruende: string[]; warnungen: string[];
}

/** Schlägt passende Mitarbeiter für einen Kunden (optional: Rolle, benötigte Qualifikationen, Beginn) vor. */
export async function passendeMitarbeiter(kundeId: string, opts: { rolle?: string | null; qualifikationen?: string[]; von?: Date; kostenstelleId?: string; limit?: number } = {}): Promise<Vorschlag[]> {
  const kunde = await db.kunde.findUniqueOrThrow({ where: { id: kundeId }, include: { bewertungen: true, einsaetze: { select: { personId: true, status: true } } } });
  const kk = koordinatenOffline(kunde);
  const gefordert = [...new Set([...(opts.qualifikationen ?? []), ...(((kunde.erforderlicheQualifikationen as string[] | null) ?? []))])].map((q) => q.trim()).filter(Boolean);
  const rolle = (opts.rolle ?? "").toLowerCase().trim();
  const von = opts.von ?? new Date();
  const heute = new Date();
  // Kandidaten: Bewerber-Pool aller Kostenstellen + aktive Mitarbeiter der eigenen Kostenstelle, deren Einsatz bald endet
  const personen = await db.person.findMany({
    where: { OR: [{ status: "SUCHT" }, { status: "VERMITTELT", ...(opts.kostenstelleId ? { kostenstelleId: opts.kostenstelleId } : {}) }] },
    include: { qualifikationen: true, bewertungen: true, abwesenheiten: { where: { typ: "KRANKENSTAND" } }, einsaetze: { where: { status: { in: ["AKTIV", "GEPLANT"] } }, select: { bis: true, kundeId: true } }, sperren: { where: { OR: [{ kundeId: null }, { kundeId }] } } },
  });
  const out: Vorschlag[] = [];
  for (const p of personen) {
    const gruende: string[] = []; const warnungen: string[] = [];
    let score = 0;
    // Verfügbarkeit
    const laufend = p.einsaetze.filter((e) => !e.bis || e.bis >= von);
    let verfuegbar = "sofort";
    if (p.status === "VERMITTELT" && laufend.length) {
      const ende = laufend.map((e) => e.bis).filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime())[0];
      if (!ende) continue; // unbefristet im Einsatz → kein Vorschlag
      if (ende.getTime() - von.getTime() > 45 * 86400000) continue;
      verfuegbar = `ab ${ende.toLocaleDateString("de-AT")}`; score += 10; gruende.push(`Einsatz endet ${ende.toLocaleDateString("de-AT")}`);
    } else if (p.verfuegbarAb && p.verfuegbarAb > von && !p.verfuegbarSofort) { verfuegbar = `ab ${p.verfuegbarAb.toLocaleDateString("de-AT")}`; score += 15; }
    else { score += 30; gruende.push("sofort verfügbar"); }
    // Rolle
    const rolleTreffer = !!rolle && !!p.standardrolle && (p.standardrolle.toLowerCase().includes(rolle) || rolle.includes(p.standardrolle.toLowerCase()));
    if (rolleTreffer) { score += 25; gruende.push(`Rolle passt (${p.standardrolle})`); }
    // Qualifikationen
    const eigene = p.qualifikationen.filter((q) => !q.gultigBis || q.gultigBis > von).map((q) => q.typ.toLowerCase());
    const treffer = gefordert.filter((g) => eigene.some((e) => e.includes(g.toLowerCase()) || g.toLowerCase().includes(e)));
    const fehlend = gefordert.filter((g) => !treffer.includes(g));
    score += treffer.length * 12 - fehlend.length * 15;
    if (treffer.length) gruende.push(`Nachweise: ${treffer.join(", ")}`);
    if (fehlend.length) warnungen.push(`fehlt: ${fehlend.join(", ")}`);
    const abgelaufen = p.qualifikationen.filter((q) => q.gultigBis && q.gultigBis < heute);
    if (abgelaufen.length) warnungen.push(`abgelaufen: ${abgelaufen.map((q) => q.typ).join(", ")}`);
    // Entfernung
    let km: number | null = null; let kmGenau = false;
    const pk = koordinatenOffline(p);
    if (kk && pk) { km = distanzKm(pk, kk); kmGenau = kk.genau && pk.genau; score += km <= 15 ? 25 : km <= 30 ? 18 : km <= 50 ? 10 : km <= 80 ? 3 : -10; if (km <= 30) gruende.push(`${km} km entfernt`); if (km > 60) warnungen.push(`${km} km Anfahrt`); if (p.maxPendelKm && km > p.maxPendelKm) warnungen.push(`über max. Pendeldistanz (${p.maxPendelKm} km)`); }
    // Bewertung & Kundenerfahrung
    const bew = p.bewertungen;
    const avg = bew.length ? bew.reduce((s, b) => s + b.sterne, 0) / bew.length : null;
    if (avg != null) { score += (avg - 3) * 8; if (avg >= 4) gruende.push(`Ø ${avg.toFixed(1)} Sterne`); if (avg < 3) warnungen.push(`Ø ${avg.toFixed(1)} Sterne`); }
    const beimKunden = kunde.einsaetze.some((e) => e.personId === p.id) || bew.some((b) => b.kundeId === kundeId);
    const kundenBew = bew.filter((b) => b.kundeId === kundeId);
    if (beimKunden) { if (kundenBew.some((b) => !b.wiedereinsatzEmpfohlen)) { score -= 40; warnungen.push("Kunde wünscht keinen Wiedereinsatz"); } else { score += 15; gruende.push("war bereits bei diesem Kunden"); } }
    const kranktage = kranktage365(p.abwesenheiten);
    if (kranktage > 15) { score -= 10; warnungen.push(`${kranktage} Kranktage/365 T.`); }
    if (p.status === "GESPERRT") continue;
    // Kundenspezifische (und generelle) Sperren aus dem Sperrlisten-Katalog: Wer genau bei diesem
    // Beschäftiger gesperrt ist, wird ihm nicht vorgeschlagen – statt erst beim Anlegen durchzufallen.
    if (p.sperren.some((sp) => (!sp.bis || sp.bis >= heute) && sp.ab <= heute)) continue;
    out.push({ personId: p.id, name: `${p.vorname} ${p.nachname}`.trim(), rolle: p.standardrolle, ort: [p.plz, p.ort].filter(Boolean).join(" ") || null, status: p.status, km, kmGenau, bewertung: avg, anzahlBewertungen: bew.length, kundenErfahrung: beimKunden, kranktage, qualiTreffer: treffer, qualiFehlend: fehlend, rolleTreffer, verfuegbar, score: Math.round(score), gruende, warnungen });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, opts.limit ?? 12);
}
