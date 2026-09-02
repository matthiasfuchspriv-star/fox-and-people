import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getSession } from "@/lib/auth";
import { bewerbenUrl } from "@/lib/werbelink";

/**
 * QR-Code für die allgemeine Kurzbewerbung – zum Ausdrucken auf Flyer, Aushang, Fahrzeugbeschriftung,
 * Visitenkarte und Einsatzbestätigung. Über `?q=` lässt sich der Kanal mitgeben, damit im Controlling
 * sichtbar wird, welcher Aushang wirklich Bewerbungen bringt: /empfehlungen/qr?q=Aushang%20Werk%20Kilb
 */
export async function GET(req: Request) {
  const s = await getSession();
  if (!s || s.totpPending) return NextResponse.redirect(new URL("/login", req.url));
  const u = new URL(req.url);
  const quelle = u.searchParams.get("q") ?? undefined;
  const png = await QRCode.toBuffer(bewerbenUrl(quelle), { width: 900, margin: 2, color: { dark: "#10222aff", light: "#ffffffff" } });
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Content-Disposition": `inline; filename="Bewerbung-QR${quelle ? `-${quelle.replace(/[^a-zA-Z0-9]+/g, "-")}` : ""}.png"` },
  });
}
