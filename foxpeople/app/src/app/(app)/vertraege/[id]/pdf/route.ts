import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, darfKostenstelle } from "@/lib/auth";
import { vertragPdf } from "../../pdf";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  if (!s || s.totpPending) return NextResponse.redirect(new URL("/login", req.url));
  const v = await db.vertrag.findUnique({ where: { id } });
  if (!v || !darfKostenstelle(s, v.kostenstelleId)) return new NextResponse("Nicht gefunden", { status: 404 });
  return new NextResponse(new Uint8Array(await vertragPdf(id)), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${v.nummer}.pdf"` } });
}
