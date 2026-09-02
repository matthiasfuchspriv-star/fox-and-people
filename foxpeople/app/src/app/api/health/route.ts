import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Gesundheitsprüfung für Docker. Ohne sie merkt niemand, wenn der Prozess zwar läuft, aber hängt
 * (erschöpfter Datenbank-Pool, blockierte Ereignisschleife) – Besucher sehen dann nur einen Fehler
 * vom Webserver, und der Container wird nie neu gestartet.
 */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, zeit: new Date().toISOString() });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
