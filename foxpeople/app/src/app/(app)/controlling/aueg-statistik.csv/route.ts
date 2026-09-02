import { NextResponse } from "next/server";
import { requireSession, istZentrale } from "@/lib/auth";
import { auegStatistik, auegStatistikCsv } from "@/lib/aueg-statistik";
import { audit } from "@/lib/audit";

export async function GET(req: Request) {
  const s = await requireSession();
  if (!istZentrale(s)) return new NextResponse("Keine Berechtigung", { status: 403 });
  const url = new URL(req.url);
  const st = url.searchParams.get("stichtag");
  const stichtag = st ? new Date(st) : new Date(new Date().getFullYear(), 6, 31);
  const a = await auegStatistik(stichtag);
  await audit(s, "EXPORT", "AuegStatistik", stichtag.toISOString().slice(0, 10), `Überlassungsstatistik § 13 AÜG exportiert (${a.ueberlassen} überlassene Arbeitskräfte)`);
  return new NextResponse(auegStatistikCsv(a), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="AUEG-Statistik-${stichtag.toISOString().slice(0, 10)}.csv"` } });
}
