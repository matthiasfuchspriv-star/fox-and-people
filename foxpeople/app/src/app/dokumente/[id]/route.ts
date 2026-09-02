import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, darfKostenstelle } from "@/lib/auth";
import { appSession } from "@/lib/app-auth";
import { leseDokument, darfInline } from "@/lib/storage";
import { audit } from "@/lib/audit";

/**
 * Kopfzeilen für die Auslieferung. Nur PDF und Bilder werden im Browser angezeigt, alles andere
 * wird heruntergeladen – und nichts darf im Browser Skripte ausführen (sandbox + nosniff).
 */
function kopf(mime: string, dateiname: string) {
  const inline = darfInline(mime);
  return {
    "Content-Type": inline ? mime : "application/octet-stream",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(dateiname)}"`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'",
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  const d = await db.dokument.findUnique({ where: { id }, include: { person: { select: { status: true } } } });
  // Mitarbeiter-App: eigene, im Portal sichtbare Dokumente (und eigene Uploads) ohne Büro-Login
  if (!s || s.totpPending) {
    const a = await appSession();
    // Gesperrter oder ausgeschiedener Zugang darf nichts mehr herunterladen – der Cookie allein genügt
    // nicht, sonst behält ein gekündigter Mitarbeiter 30 Tage lang Zugriff auf seine Lohnzettel.
    const offen = a
      ? await db.person.findUnique({ where: { id: a.personId }, select: { appGesperrtAm: true, status: true } })
      : null;
    const zugangGueltig = !!offen && !offen.appGesperrtAm && offen.status !== "AUSGESCHIEDEN" && offen.status !== "GESPERRT";
    if (a && zugangGueltig && d && d.personId === a.personId && (d.sichtbarImPortal || d.quelle === "APP")) {
      const buf = await leseDokument(d.speicherpfad);
      return new NextResponse(new Uint8Array(buf), { headers: kopf(d.mime, d.dateiname) });
    }
    return NextResponse.redirect(new URL("/login", _req.url));
  }
  const poolFoto = d?.kategorie === "Foto" && d.person?.status === "SUCHT"; // Bewerber-Pool-Fotos sind für alle sichtbar
  if (!d || (!darfKostenstelle(s, d.kostenstelleId) && !poolFoto)) return new NextResponse("Nicht gefunden", { status: 404 });
  const buf = await leseDokument(d.speicherpfad);
  await audit(s, "EXPORT", "Dokument", id, `Download ${d.dateiname}`, undefined, d.kostenstelleId);
  return new NextResponse(new Uint8Array(buf), { headers: kopf(d.mime, d.dateiname) });
}
