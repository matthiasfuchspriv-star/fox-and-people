import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, darfKostenstelle } from "@/lib/auth";
import { angebotPdfBuffer } from "../../pdf";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  if (!s || s.totpPending) return NextResponse.redirect(new URL("/login", req.url));
  const a = await db.angebot.findUnique({ where: { id } });
  if (!a || !darfKostenstelle(s, a.kostenstelleId)) return new NextResponse("Nicht gefunden", { status: 404 });
  const buf = await angebotPdfBuffer(id);
  return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="Angebot_${a.nummer}.pdf"` } });
}
