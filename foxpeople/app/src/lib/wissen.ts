/**
 * Wissensbot – Retrieval (PostgreSQL-Volltextsuche, deutsch) + Claude-Antwort mit Quellenangaben.
 * Ohne ANTHROPIC_API_KEY läuft ein extraktiver Modus (liefert die passenden Textstellen).
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { db } from "./db";
import { Prisma } from "@/generated/prisma/client";
import { controlling } from "./controlling";
import { firma as ladeFirma } from "./einstellungen";
import { eur, pct, MONATE_LANG } from "./format";

const exec = promisify(execFile);

// ---------------------------------------------------------------- Textextraktion
export async function extrahiereText(datei: Buffer, name: string, mime: string): Promise<string> {
  const ext = name.toLowerCase().slice(name.lastIndexOf("."));
  if (ext === ".pdf" || mime === "application/pdf") {
    const tmp = path.join(os.tmpdir(), `w-${Date.now()}.pdf`);
    await writeFile(tmp, datei);
    try { const { stdout } = await exec("pdftotext", ["-layout", "-enc", "UTF-8", tmp, "-"], { maxBuffer: 200 * 1024 * 1024 }); return stdout; }
    finally { await unlink(tmp).catch(() => {}); }
  }
  if (ext === ".docx" || ext === ".pptx") {
    const tmp = path.join(os.tmpdir(), `w-${Date.now()}${ext}`);
    await writeFile(tmp, datei);
    try {
      const { stdout } = await exec("unzip", ["-p", tmp, ext === ".docx" ? "word/document.xml" : "ppt/slides/*.xml"], { maxBuffer: 200 * 1024 * 1024 });
      return stdout.replace(/<\/w:p>|<\/a:p>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
    } finally { await unlink(tmp).catch(() => {}); }
  }
  return datei.toString("utf8");
}

/** Text in Abschnitte von ~1.200 Zeichen (mit Überlappung) zerlegen */
export function chunke(text: string, groesse = 1200, ueberlappung = 150): string[] {
  const clean = text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const out: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let ende = Math.min(clean.length, i + groesse);
    if (ende < clean.length) { const nl = clean.lastIndexOf("\n", ende); if (nl > i + groesse * 0.6) ende = nl; }
    const t = clean.slice(i, ende).trim();
    if (t.length > 40) out.push(t);
    i = ende - ueberlappung > i ? ende - ueberlappung : ende;
  }
  return out;
}

export async function wissenImportieren(datei: Buffer, name: string, mime: string, kategorie: string, titel?: string) {
  const text = await extrahiereText(datei, name, mime);
  const chunks = chunke(text);
  const doc = await db.wissenDokument.create({ data: { titel: titel || name, quelle: name, kategorie, zeichen: text.length } });
  for (let i = 0; i < chunks.length; i += 200) {
    await db.wissenChunk.createMany({ data: chunks.slice(i, i + 200).map((t, j) => ({ dokumentId: doc.id, index: i + j, text: t })) });
  }
  return { doc, chunks: chunks.length, zeichen: text.length };
}

// ---------------------------------------------------------------- Retrieval
export interface Treffer { id: string; text: string; titel: string; kategorie: string; index: number; rank: number }

export async function suche(frage: string, limit = 8): Promise<Treffer[]> {
  const q = frage.replace(/[^\p{L}\p{N}\s§.-]/gu, " ").trim();
  if (!q) return [];
  const rows = await db.$queryRaw<Treffer[]>(Prisma.sql`
    SELECT c.id, c.text, c.index, d.titel, d.kategorie,
           ts_rank_cd(c.tsv, websearch_to_tsquery('german', ${q})) AS rank
    FROM "WissenChunk" c JOIN "WissenDokument" d ON d.id = c."dokumentId"
    WHERE c.tsv @@ websearch_to_tsquery('german', ${q})
    ORDER BY rank DESC LIMIT ${limit}`);
  if (rows.length) return rows;
  // Fallback: OR-Suche über die Wörter
  const worte = q.split(/\s+/).filter((w) => w.length > 3).slice(0, 8);
  if (!worte.length) return [];
  return db.$queryRaw<Treffer[]>(Prisma.sql`
    SELECT c.id, c.text, c.index, d.titel, d.kategorie,
           ts_rank_cd(c.tsv, to_tsquery('german', ${worte.map((w) => w.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean).join(" | ")})) AS rank
    FROM "WissenChunk" c JOIN "WissenDokument" d ON d.id = c."dokumentId"
    WHERE c.tsv @@ to_tsquery('german', ${worte.map((w) => w.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean).join(" | ")})
    ORDER BY rank DESC LIMIT ${limit}`);
}

// ---------------------------------------------------------------- Live-Kontext (Kennzahlen)
export async function kennzahlenKontext(jahr = new Date().getFullYear()) {
  const c = await controlling(jahr);
  const [pool, aktiv, gesperrt, offeneRe, kunden, ks] = await Promise.all([
    db.person.count({ where: { status: "SUCHT" } }), db.person.count({ where: { status: "VERMITTELT" } }), db.person.count({ where: { status: "GESPERRT" } }),
    db.rechnung.aggregate({ where: { status: { in: ["VERSENDET", "UEBERFAELLIG", "TEILBEZAHLT"] } }, _sum: { brutto: true, bezahltBetrag: true }, _count: true }),
    db.kunde.count({ where: { status: "AKTIV" } }), db.kostenstelle.findMany({ where: { aktiv: true } }),
  ]);
  return [
    `Kennzahlen ${jahr} (alle Kostenstellen: ${ks.map((k) => k.name).join(", ")}):`,
    `Umsatz ${eur(c.gesamt.umsatz)}, Bruttolöhne ${eur(c.gesamt.selbstkosten)}, Abgaben & Rückstellungen ${eur(c.gesamt.abgaben)}, DB1 ${eur(c.gesamt.db1)} (Marge ${pct(c.gesamt.marge)}), Personalkostenquote ${pct(c.gesamt.personalkostenquote)}.`,
    `Bewerber-Pool ${pool}, aktive Mitarbeiter ${aktiv}, gesperrt ${gesperrt}, aktive Kunden ${kunden}, offene Forderungen ${eur((offeneRe._sum.brutto ?? 0) - (offeneRe._sum.bezahltBetrag ?? 0))} (${offeneRe._count} Rechnungen).`,
    `Monatswerte (Umsatz/DB1): ${c.monatsreihe.filter((m) => m.umsatz).map((m) => `${m.label} ${eur(m.umsatz, 0)}/${eur(m.db1, 0)}`).join(", ")}.`,
    `Top-Mitarbeiter nach DB1: ${c.mitarbeiter.slice(0, 5).map((m) => `${m.name} (${m.kunde}) ${eur(m.db1Jahr, 0)}`).join("; ")}.`,
    `Kunden nach DB1: ${c.kunden.map((k) => `${k.kunde} ${eur(k.db1Jahr, 0)} (${pct(k.db1Marge)})`).join("; ")}.`,
  ].join("\n");
}

// ---------------------------------------------------------------- Claude
export async function frageAssistent(frage: string, verlauf: { rolle: string; text: string }[]): Promise<{ antwort: string; quellen: Treffer[]; modus: "claude" | "extraktiv" }> {
  const [quellen, f, kennzahlen] = await Promise.all([suche(frage, 8), ladeFirma(), kennzahlenKontext().catch(() => "")]);
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    const antwort = quellen.length
      ? `**Extraktiver Modus** (kein ANTHROPIC_API_KEY hinterlegt – ich zeige die passendsten Stellen aus dem hinterlegten Wissen):\n\n` + quellen.slice(0, 4).map((q, i) => `**[${i + 1}] ${q.titel}**\n${q.text.slice(0, 700)}…`).join("\n\n")
      : "Dazu finde ich nichts im hinterlegten Wissen. Bitte weitere Dokumente unter „Wissen“ hochladen – oder einen ANTHROPIC_API_KEY in der .env hinterlegen, damit ich auch aus dem allgemeinen Wissen antworten kann.";
    return { antwort, quellen, modus: "extraktiv" };
  }
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: key });
  const system = `Du bist der interne Wissensassistent von ${f.name} (${f.rechtstraeger}), einem österreichischen Personaldienstleister (Arbeitskräfteüberlassung & Vermittlung, Sitz ${f.ort}). Du antwortest dem Geschäftsführer auf Deutsch, präzise und praxisnah.
Regeln:
- Stütze dich vorrangig auf die bereitgestellten Quellen (Arbeitsrecht, AÜG, KV, WIFI-Kalkulation, Firmenunterlagen). Zitiere sie als [1], [2] …
- Bei rechtlichen Fragen: Paragraphen nennen, wenn sie in den Quellen stehen; unsichere Punkte klar als unsicher markieren und auf Steuerberater/WKO/Arbeiterkammer verweisen. Keine erfundenen Paragraphen.
- Kalkulation und Aufschläge sind intern (kein Open Book gegenüber Kunden).
- Wenn die Quellen nichts hergeben, sag das offen und antworte aus allgemeinem Wissen mit Hinweis.
- Kurz und strukturiert; Markdown erlaubt.

Aktuelle Live-Kennzahlen aus der Software:
${kennzahlen}`;
  const kontext = quellen.length ? "Quellen:\n" + quellen.map((q, i) => `[${i + 1}] ${q.titel} (${q.kategorie}, Abschnitt ${q.index}):\n${q.text}`).join("\n\n") : "Quellen: keine passenden Textstellen gefunden.";
  const messages = [
    ...verlauf.slice(-8).map((m) => ({ role: (m.rolle === "user" ? "user" : "assistant") as "user" | "assistant", content: m.text })),
    { role: "user" as const, content: `${kontext}\n\nFrage: ${frage}` },
  ];
  const res = await client.messages.create({ model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5", max_tokens: 1500, system, messages });
  const antwort = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  return { antwort, quellen, modus: "claude" };
}

// ---------------------------------------------------------------- Monatsreport
export async function erzeugeMonatsreport(jahr: number, monat: number, kostenstelleId?: string, erstelltVon?: string) {
  const c = await controlling(jahr, kostenstelleId);
  const m = c.monatsreihe[monat - 1];
  const vormonat = monat > 1 ? c.monatsreihe[monat - 2] : null;
  const bis = new Date(Date.UTC(jahr, monat, 0, 23, 59, 59));
  const von = new Date(Date.UTC(jahr, monat - 1, 1));
  const where = kostenstelleId ? { kostenstelleId } : {};
  const [neueMa, neueKunden, angebote, rechnungen, ueberf, einsaetzeNeu, einsaetzeEnde, abwesenheiten] = await Promise.all([
    db.person.count({ where: { ...where, aufnahmedatum: { gte: von, lte: bis } } }),
    db.kunde.count({ where: { ...where, erstelltAm: { gte: von, lte: bis } } }),
    db.angebot.findMany({ where: { ...where, datum: { gte: von, lte: bis } }, include: { kunde: true } }),
    db.rechnung.findMany({ where: { ...where, leistungJahr: jahr, leistungMonat: monat, status: { not: "STORNIERT" } }, include: { kunde: true } }),
    db.rechnung.findMany({ where: { ...where, status: "UEBERFAELLIG" }, include: { kunde: true } }),
    db.einsatz.count({ where: { ...where, von: { gte: von, lte: bis } } }),
    db.einsatz.count({ where: { ...where, bis: { gte: von, lte: bis } } }),
    db.abwesenheit.findMany({ where: { von: { gte: von, lte: bis }, person: where }, include: { person: true } }),
  ]);
  const krank = abwesenheiten.filter((a) => a.typ === "KRANKENSTAND").reduce((s, a) => s + a.tage, 0);
  const delta = (a: number, b: number | undefined) => (b == null || !b ? "" : ` (${a >= b ? "+" : ""}${pct((a - b) / Math.abs(b), 0)} zum Vormonat)`);
  const md = `# Monatsreport ${MONATE_LANG[monat - 1]} ${jahr}${kostenstelleId ? "" : " – alle Kostenstellen"}

## Ergebnis
- Verrechnung: **${eur(m.umsatz)}**${delta(m.umsatz, vormonat?.umsatz)}
- Bruttolöhne: ${eur(m.selbstkosten)} · Abgaben & Rückstellungen: ${eur(m.abgaben)}
- DB1: **${eur(m.db1)}** (${m.umsatz ? pct(m.db1 / m.umsatz) : "–"})${delta(m.db1, vormonat?.db1)}
- Kumuliert ${jahr}: Umsatz ${eur(c.gesamt.umsatz)}, DB1 ${eur(c.gesamt.db1)} (${pct(c.gesamt.marge)}), Personalkostenquote ${pct(c.gesamt.personalkostenquote)}

## Mitarbeiter & Kunden
- ${c.mitarbeiter.filter((x) => x.monate[monat - 1].verrechnung).length} Mitarbeiter mit Verrechnung im Monat · ${einsaetzeNeu} Einsätze begonnen · ${einsaetzeEnde} beendet
- ${neueMa} neue Bewerber aufgenommen · ${neueKunden} neue Kunden
- Krankenstandstage im Monat: ${krank}
- Beste DB1-Beiträge: ${c.mitarbeiter.map((x) => ({ n: x.name, k: x.kunde, d: x.monate[monat - 1].db1 })).filter((x) => x.d).sort((a, b) => b.d - a.d).slice(0, 3).map((x) => `${x.n} (${x.k}) ${eur(x.d, 0)}`).join(", ") || "–"}
- Negative DB1 im Monat: ${c.mitarbeiter.map((x) => ({ n: x.name, k: x.kunde, d: x.monate[monat - 1].db1 })).filter((x) => x.d < 0).map((x) => `${x.n} (${x.k}) ${eur(x.d, 0)}`).join(", ") || "keine"}

## Vertrieb
- Angebote erstellt: ${angebote.length} (${angebote.filter((a) => a.status === "ANGENOMMEN").length} angenommen, ${angebote.filter((a) => a.status === "ABGELEHNT").length} abgelehnt, ${angebote.filter((a) => a.status === "VERSENDET").length} offen)

## Forderungen
- Rechnungen für ${MONATE_LANG[monat - 1]}: ${rechnungen.length} · Netto ${eur(rechnungen.reduce((s, r) => s + r.netto, 0))}
- Überfällig gesamt: ${ueberf.length} Rechnungen, ${eur(ueberf.reduce((s, r) => s + r.brutto - r.bezahltBetrag, 0))}${ueberf.length ? ` (${ueberf.map((r) => `${r.nummer} ${r.kunde.firmenname}`).join(", ")})` : ""}
`;
  let inhalt = md;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const res = await client.messages.create({ model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5", max_tokens: 1200, system: "Du bist Controller eines österreichischen Personaldienstleisters. Schreibe auf Basis der Zahlen eine kurze Management-Einschätzung (max. 200 Wörter) mit 3 konkreten Handlungsempfehlungen. Keine Zahlen erfinden.", messages: [{ role: "user", content: md }] });
      inhalt = md + "\n## Einschätzung & Empfehlungen\n" + res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
    } catch (e) { inhalt = md + `\n_(KI-Einschätzung nicht verfügbar: ${e instanceof Error ? e.message : String(e)})_`; }
  }
  return db.monatsreport.create({ data: { jahr, monat, kostenstelleId: kostenstelleId ?? null, inhalt, erstelltVon } });
}
