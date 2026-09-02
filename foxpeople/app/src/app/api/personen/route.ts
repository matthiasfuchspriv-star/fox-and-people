import { NextResponse } from "next/server";
import { getSession, tenantWhere } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Personensuche für Auswahlfelder.
 *
 * Eine Auswahlliste mit allen Personen ist ab ein paar hundert Einträgen unbrauchbar: Man findet
 * niemanden mehr und kann nichts eintippen. Deshalb sucht diese Route serverseitig – über den
 * gesamten Bestand, nicht nur über die ersten paar hundert Namen.
 *
 * Gesucht wird in Vor- und Nachname sowie in der Personalnummer; mehrere Wörter müssen alle
 * vorkommen ("mus max" findet Max Muster). Mitarbeiter stehen vor Bewerbern, weil sie häufiger
 * gemeint sind.
 *
 * Nur für Angemeldete, und nur im eigenen Mandanten – sonst wäre das eine Auskunft darüber, wer
 * überhaupt im Bestand ist.
 */
const STATUS: Record<string, string> = { VERMITTELT: "Mitarbeiter", SUCHT: "Bewerber", AUSGESCHIEDEN: "ausgeschieden", GESPERRT: "gesperrt" };

export async function GET(req: Request) {
  const s = await getSession();
  if (!s || s.totpPending) return NextResponse.json({ treffer: [] }, { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ treffer: [] });

  const worte = q.split(/\s+/).filter(Boolean).slice(0, 4);
  const treffer = await db.person.findMany({
    where: {
      ...tenantWhere(s),
      AND: worte.map((w) => ({
        OR: [
          { vorname: { contains: w, mode: "insensitive" as const } },
          { nachname: { contains: w, mode: "insensitive" as const } },
        ],
      })),
    },
    orderBy: [{ nachname: "asc" }, { vorname: "asc" }],
    select: { id: true, vorname: true, nachname: true, status: true, geburtsdatum: true, ort: true },
    take: 25,
  });

  const rang = { VERMITTELT: 0, SUCHT: 1, AUSGESCHIEDEN: 2, GESPERRT: 3 } as Record<string, number>;
  const sortiert = [...treffer].sort((a, b) => (rang[a.status] ?? 9) - (rang[b.status] ?? 9));

  return NextResponse.json({
    treffer: sortiert.map((p) => ({
      id: p.id,
      name: `${p.nachname} ${p.vorname}`.trim(),
      zusatz: [STATUS[p.status] ?? p.status, p.geburtsdatum ? new Date(p.geburtsdatum).toLocaleDateString("de-AT") : null, p.ort].filter(Boolean).join(" · "),
    })),
  });
}
