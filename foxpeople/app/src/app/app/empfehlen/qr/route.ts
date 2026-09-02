import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireApp } from "@/lib/app-auth";
import { werbecodeFuer, werbeUrl } from "@/lib/werbelink";

/**
 * Persönlicher QR-Code des Mitarbeiters für seinen Empfehlungs-Link.
 *
 * Der Link allein hilft nur dort, wo man ihn verschicken kann. Am Bau, in der Halle oder in der
 * Kantine zeigt man dem Kollegen das Handy hin – dafür braucht es einen Code zum Abscannen. Weil er
 * denselben Werbecode enthält wie der Link, bleibt die Zuordnung zum Werber erhalten, und die Prämie
 * landet beim Richtigen.
 */
export async function GET() {
  // requireApp statt appSession: prüft auch Sperre und Austritt – ein gesperrter Mitarbeiter bekommt
  // keinen QR-Code mehr ausgeliefert.
  let s;
  try { s = await requireApp(); } catch { return new NextResponse("Nicht angemeldet", { status: 401 }); }
  const code = await werbecodeFuer(s.personId);
  if (!code) return new NextResponse("Kein Werbecode", { status: 404 });
  const png = await QRCode.toBuffer(werbeUrl(code), { width: 900, margin: 2, color: { dark: "#10222aff", light: "#ffffffff" } });
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Content-Disposition": `inline; filename="Mein-Empfehlungscode.png"`, "Cache-Control": "private, max-age=3600" },
  });
}
