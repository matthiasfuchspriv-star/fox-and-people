/**
 * Läuft einmal beim Start des Servers.
 *
 * Hier stehen Dinge, die stimmen müssen, bevor der erste Mensch etwas anlegt – und die niemand
 * händisch anstoßen soll. Der Referenzlohn ist genau so ein Fall: Fehlt die Lohntafel des
 * Beschäftigers, rechnet die Einsatzplanung mit dem Grundlohn nach KV AKÜ statt mit dem
 * Referenzlohn. Das ist Lohndumping, und es passiert lautlos.
 *
 * Vorher hing das an einem Knopf in den Einstellungen. Ein Knopf, den jemand nach jedem Update
 * drücken muss, ist keine Absicherung, sondern eine Fehlerquelle mit Ansage.
 *
 * Der Abgleich ist idempotent: Er legt fehlende Kollektivverträge und Lohnstufen an und bringt
 * vorhandene auf den Stand des Codes. Nichts wird gelöscht, eigene Einträge bleiben unberührt.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { referenzKvSynchronisieren } = await import("@/lib/referenzlohn");
    const erg = await referenzKvSynchronisieren();
    console.log(`[Start] Referenz-KV abgeglichen: ${erg.angelegt} angelegt, ${erg.aktualisiert} aktualisiert, ${erg.stufen} Lohnstufen.`);
  } catch (e) {
    // Der Start darf daran nicht scheitern – ohne Datenbank (Build, Prüfcontainer) ist das normal.
    console.warn("[Start] Referenz-KV konnte nicht abgeglichen werden:", e instanceof Error ? e.message : e);
  }
}
