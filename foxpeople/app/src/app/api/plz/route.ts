import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { orteAusTabelle } from "@/lib/plz-orte";
import amtlich from "@/lib/plz-amtlich.json";

/**
 * Orte zu einer österreichischen Postleitzahl.
 *
 * Drei Quellen, in dieser Reihenfolge:
 *  1. die kuratierte Tabelle aus dem eigenen Bestand – dort steht der Postort, also das, was auf
 *     den Brief gehört;
 *  2. alles, was seither bei Personen und Kunden erfasst wurde;
 *  3. das amtliche Verzeichnis der Post (2.246 Postleitzahlen, alle Ortschaften je PLZ).
 *
 * Warum das amtliche Verzeichnis nicht einfach den Ort setzt: Es führt je Postleitzahl sämtliche
 * Ortschaften auf, und der Postort steht darin nicht an einer festen Stelle. Ein Test gegen die
 * kuratierte Tabelle hat gezeigt, dass die erste Ortschaft nur in etwa einem Drittel der Fälle der
 * Postort ist – automatisch übernommen wäre also meistens falsch. Deshalb liefert diese Route zwei
 * Dinge getrennt: `ort` ist die Antwort, auf die man sich verlassen kann (Tabelle, oder eindeutig
 * aus Bestand bzw. Verzeichnis), `orte` ist die Auswahlliste.
 *
 * Nur für Angemeldete: Die Antwort verrät sonst, welche Orte im Bestand vorkommen.
 */
export async function GET(req: Request) {
  const s = await getSession();
  if (!s || s.totpPending) return NextResponse.json({ ort: null, orte: [] }, { status: 401 });
  const plz = (new URL(req.url).searchParams.get("plz") ?? "").trim();
  if (!/^\d{4}$/.test(plz)) return NextResponse.json({ ort: null, orte: [] });

  const tabelle = orteAusTabelle(plz);
  const [personen, kunden] = await Promise.all([
    db.person.findMany({ where: { plz, ort: { not: null } }, select: { ort: true }, distinct: ["ort"], take: 12 }),
    db.kunde.findMany({ where: { plz, ort: { not: null } }, select: { ort: true }, distinct: ["ort"], take: 12 }),
  ]);
  const bestand = [...personen, ...kunden].map((x) => (x.ort ?? "").trim()).filter((o) => o.length >= 2);
  const amtsorte = (amtlich as Record<string, string[]>)[plz] ?? [];

  // Reihenfolge festhalten, Doppelte nach Kleinschreibung entfernen
  const orte = new Map<string, string>();
  for (const o of [...tabelle, ...bestand, ...amtsorte]) if (!orte.has(o.toLowerCase())) orte.set(o.toLowerCase(), o);

  // Sicher ist: die kuratierte Tabelle, ein eindeutiger Wert aus dem Bestand oder eine
  // Postleitzahl, die im Verzeichnis nur eine einzige Ortschaft hat.
  const bestandEindeutig = new Set(bestand.map((o) => o.toLowerCase())).size === 1 ? bestand[0] : null;
  const ort = tabelle[0] ?? bestandEindeutig ?? (amtsorte.length === 1 ? amtsorte[0] : null);

  return NextResponse.json({ ort, orte: [...orte.values()].slice(0, 40) });
}
