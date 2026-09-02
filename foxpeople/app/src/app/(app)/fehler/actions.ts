"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession, istZentrale } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { tagesmailSenden } from "@/lib/tagesmail";

/** Einen Eintrag abhaken. Er verschwindet aus der Liste und aus der Tagesmail. */
export async function fehlerErledigt(id: string) {
  const s = await requireSession();
  if (!istZentrale(s)) redirect("/?fehler=keine-berechtigung");
  const f = await db.fehlerprotokoll.findUnique({ where: { id } });
  if (!f) redirect("/fehler");
  await db.fehlerprotokoll.update({ where: { id }, data: { erledigtAm: new Date() } });
  await audit(s, "UPDATE", "Fehlerprotokoll", id, `Abgehakt: [${f.quelle}] ${f.meldung.slice(0, 120)}`);
  revalidatePath("/fehler");
}

/**
 * Die Tagesmail sofort schicken, statt bis morgen früh zu warten. Vor allem zum Ausprobieren, ob
 * der Mailweg überhaupt steht – ein Systembericht, der nie ankommt, ist schlimmer als keiner.
 */
export async function tagesmailJetzt() {
  const s = await requireSession();
  if (!istZentrale(s)) redirect("/?fehler=keine-berechtigung");
  await db.einstellung.deleteMany({ where: { key: "tagesmailZuletzt" } });
  const erg = await tagesmailSenden(new Date(new Date().setHours(12, 0, 0, 0)));
  await audit(s, "UPDATE", "Fehlerprotokoll", null, `Systembericht von Hand ausgelöst: ${erg}`);
  redirect(`/fehler?probe=${encodeURIComponent(erg)}`);
}
