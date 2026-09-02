"use server";
import { db } from "@/lib/db";
import { requireApp } from "@/lib/app-auth";
import { vapidPublicKey, pushAn } from "@/lib/push";

/** Öffentlicher Schlüssel für das Abonnement im Browser. */
export async function pushSchluessel(): Promise<string> {
  await requireApp();
  return vapidPublicKey();
}

/** Gerät für Benachrichtigungen anmelden (ein Eintrag je Browser/Handy). */
export async function pushAnmelden(abo: { endpoint: string; p256dh: string; auth: string; geraet?: string }) {
  const s = await requireApp();
  await db.pushAbo.upsert({
    where: { endpoint: abo.endpoint },
    update: { personId: s.personId, p256dh: abo.p256dh, auth: abo.auth, geraet: abo.geraet ?? null, fehler: 0 },
    create: { personId: s.personId, endpoint: abo.endpoint, p256dh: abo.p256dh, auth: abo.auth, geraet: abo.geraet ?? null },
  });
  await pushAn(s.personId, { anlass: "ERINNERUNG", titel: "Benachrichtigungen sind an", text: "Wir melden uns hier, wenn deine Stunden bestätigt sind oder eine Nachricht da ist.", url: "/app" });
}

/** Gerät wieder abmelden. */
export async function pushAbmelden(endpoint: string) {
  const s = await requireApp();
  await db.pushAbo.deleteMany({ where: { endpoint, personId: s.personId } });
}
