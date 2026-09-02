"use server";
import { requireSession } from "@/lib/auth";
import { einstellung, setEinstellung } from "@/lib/einstellungen";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { str } from "@/lib/format";

/**
 * Abgehakte Compliance-Einträge. Die Liste selbst ist berechnet (ablaufende Ausweise, UID, AGB …) –
 * es gibt kein „erledigt"-Feld am Datensatz. Damit man einen erledigten Punkt aus der Liste nehmen
 * kann, ohne jedes Mal in den Akt zu gehen, merken wir uns die abgehakten Schlüssel hier.
 *
 * Nur nicht-blockierende Punkte lassen sich abhaken – ein harter Blocker (z. B. fehlende
 * Arbeitsbewilligung) darf nicht weggeklickt werden, das prüft die Seite vor dem Anzeigen des Knopfs.
 */
const KEY = "compliance_quittungen";
type Quittungen = Record<string, string>;

export async function complianceErledigt(fd: FormData) {
  await requireSession();
  const schluessel = str(fd.get("schluessel"));
  if (schluessel) {
    const set = await einstellung<Quittungen>(KEY, {});
    set[schluessel] = new Date().toISOString();
    await setEinstellung(KEY, set);
  }
  revalidatePath("/compliance");
  redirect("/compliance");
}

export async function complianceWiedervorlage(fd: FormData) {
  await requireSession();
  const schluessel = str(fd.get("schluessel"));
  if (schluessel) {
    const set = await einstellung<Quittungen>(KEY, {});
    delete set[schluessel];
    await setEinstellung(KEY, set);
  }
  revalidatePath("/compliance");
  redirect("/compliance?erledigte=1");
}
