import { db } from "./db";

/** Geokodierung über OpenStreetMap Nominatim (mit DB-Cache). Fallback: PLZ-Näherung für Österreich. */
export async function geocode(strasse: string | null | undefined, plz: string | null | undefined, ort: string | null | undefined, opts: { nurEcht?: boolean } = {}): Promise<{ lat: number; lon: number } | null> {
  const key = [strasse, plz, ort].map((x) => (x ?? "").trim().toLowerCase()).filter(Boolean).join(", ");
  if (!plz && !ort) return null;
  const cached = await db.geocode.findUnique({ where: { key } });
  // Eine gespeicherte PLZ-Näherung ist kein Geocoding-Treffer. Wer echte Koordinaten braucht, soll
  // es beim nächsten Lauf noch einmal versuchen dürfen, statt die Näherung ewig weiterzureichen.
  if (cached && !(opts.nurEcht && cached.quelle === "plz-naeherung")) return { lat: cached.lat, lon: cached.lon };
  try {
    const q = new URLSearchParams({ format: "json", limit: "1", countrycodes: "at", q: [strasse, plz, ort].filter(Boolean).join(", ") });
    const r = await fetch(`https://nominatim.openstreetmap.org/search?${q}`, { headers: { "User-Agent": "FoxPeople-Verwaltung/1.0 (office@foxandpeople.at)" }, signal: AbortSignal.timeout(6000) });
    if (r.ok) {
      const j = (await r.json()) as { lat: string; lon: string }[];
      if (j[0]) { const res = { lat: Number(j[0].lat), lon: Number(j[0].lon) }; await db.geocode.create({ data: { key, ...res } }); return res; }
    }
  } catch { /* offline → Fallback */ }
  const fb = plzNaeherung(plz);
  if (fb) {
    await db.geocode.upsert({ where: { key }, update: {}, create: { key, ...fb, quelle: "plz-naeherung" } }).catch(() => {});
    return opts.nurEcht ? null : fb;
  }
  return null;
}

/** Grobe Zentren der österreichischen PLZ-Regionen (erste zwei Ziffern) – nur Fallback ohne Internet */
const PLZ2: Record<string, [number, number]> = {
  "10": [48.21, 16.37], "11": [48.19, 16.40], "12": [48.18, 16.33], "13": [48.20, 16.28], "14": [48.19, 16.30], "15": [48.20, 16.32], "16": [48.22, 16.33], "17": [48.22, 16.32], "18": [48.23, 16.33], "19": [48.25, 16.36],
  "20": [48.35, 16.42], "21": [48.30, 16.30], "22": [48.40, 16.75], "23": [48.10, 16.40], "24": [48.00, 16.50], "25": [47.95, 16.30], "26": [47.85, 16.35], "27": [47.80, 16.20], "28": [47.70, 16.10], "29": [47.60, 16.00],
  "30": [48.15, 15.70], "31": [48.20, 15.63], "32": [48.10, 15.50], "33": [48.10, 14.90], "34": [48.30, 15.70], "35": [48.40, 15.60], "36": [48.60, 15.70], "37": [48.60, 15.30], "38": [48.75, 15.30], "39": [48.70, 15.05],
  "40": [48.30, 14.29], "41": [48.35, 14.20], "42": [48.30, 14.35], "43": [48.10, 14.40], "44": [48.05, 14.50], "45": [48.00, 14.40], "46": [48.05, 13.95], "47": [48.20, 13.80], "48": [48.30, 13.60], "49": [48.35, 13.45],
  "50": [47.80, 13.05], "51": [47.85, 13.15], "52": [47.95, 13.00], "53": [47.75, 13.30], "54": [47.70, 13.05], "55": [47.40, 13.20], "56": [47.30, 13.00], "57": [47.25, 12.80],
  "60": [47.27, 11.40], "61": [47.30, 11.50], "62": [47.35, 11.70], "63": [47.45, 12.00], "64": [47.50, 12.30], "65": [47.30, 10.95], "66": [47.30, 10.70], "67": [47.15, 10.50], "68": [47.40, 9.75], "69": [47.50, 9.75],
  "70": [47.85, 16.55], "71": [47.95, 16.60], "72": [47.75, 16.45], "73": [47.55, 16.45], "74": [47.30, 16.35], "75": [47.15, 16.30], "76": [47.05, 16.30],
  "80": [47.07, 15.44], "81": [47.05, 15.40], "82": [47.10, 15.70], "83": [47.00, 15.90], "84": [46.90, 15.60], "85": [46.80, 15.40], "86": [47.30, 15.40], "87": [47.40, 15.30], "88": [47.50, 14.80], "89": [47.50, 14.10],
  "90": [46.62, 14.31], "91": [46.60, 14.00], "92": [46.70, 13.80], "93": [46.70, 13.60], "94": [46.70, 13.30], "95": [46.60, 13.00], "96": [46.80, 12.90], "97": [46.90, 13.10], "98": [46.90, 13.40], "99": [46.80, 12.70],
};
export function plzNaeherung(plz: string | null | undefined) {
  const k = (plz ?? "").trim().slice(0, 2);
  const c = PLZ2[k];
  return c ? { lat: c[0], lon: c[1] } : null;
}

export function distanzKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 1.25); // ×1,25 ≈ Straßenkilometer
}

/**
 * Koordinaten **ohne Netzwerk**: entweder schon gespeichert oder aus der Postleitzahl genähert.
 *
 * Das ist die einzige Variante, die beim Aufbau einer Seite verwendet werden darf. Vorher rief das
 * Matching für jeden Kandidaten die Geokodierung auf – bei fehlender Internetverbindung wartet jeder
 * Aufruf sechs Sekunden in einen Zeitablauf. Bei 450 Personen sind das 45 Minuten, und die Seite
 * „Passende Mitarbeiter“ lädt nie fertig. Genau die Falle: eine Funktion, die lokal in Millisekunden
 * antwortet und am Server hängt.
 */
export function koordinatenOffline(p: { lat: number | null; lon: number | null; plz: string | null }): { lat: number; lon: number; genau: boolean } | null {
  if (p.lat != null && p.lon != null) return { lat: p.lat, lon: p.lon, genau: true };
  const fb = plzNaeherung(p.plz);
  return fb ? { ...fb, genau: false } : null;
}

/**
 * Fehlende Koordinaten im stündlichen Hintergrundlauf nachtragen.
 *
 * Statt einer festen Stückzahl gilt ein Zeitbudget: Der Lauf arbeitet, bis es aufgebraucht ist, und
 * hört dann auf. 90 Sekunden passen unter die Wartezeit, die der Cron-Dienst dem Aufruf zugesteht,
 * und ergeben rund 80 Adressen je Stunde. Nach dem Import von 1.579 Bewerbern ist der Bestand damit
 * in etwa einem Tag durch – bis dahin rechnet das Matching mit der PLZ-Näherung und schreibt „≈".
 *
 * Wichtig: gespeichert werden **nur echte Treffer** (`nurEcht`). Früher landete die PLZ-Näherung als
 * Koordinate in der Person – sie galt damit als exakt, die Person wurde nie wieder nachgeschlagen,
 * und alle Adressen mit denselben ersten beiden Ziffern lagen für immer auf demselben Punkt. Die
 * Entfernungen im Matching wären dauerhaft falsch geblieben, ohne dass es jemandem auffällt.
 */
export async function koordinatenNachtragen(budgetMs = 90_000): Promise<number> {
  const schluss = Date.now() + budgetMs;
  let n = 0;

  // Der Kunde zuerst: ohne seine Koordinaten nützt die genaueste Mitarbeiteradresse nichts.
  const kunden = await db.kunde.findMany({ where: { lat: null, OR: [{ plz: { not: null } }, { ort: { not: null } }] }, take: 20, select: { id: true, strasse: true, plz: true, ort: true } });
  for (const k of kunden) {
    if (Date.now() > schluss) return n;
    const g = await geocode(k.strasse, k.plz, k.ort, { nurEcht: true });
    if (g) { await db.kunde.update({ where: { id: k.id }, data: g }); n++; }
    // Höchstens ein Aufruf je Sekunde – so verlangen es die Nutzungsbedingungen von Nominatim.
    await new Promise((r) => setTimeout(r, 1100));
  }

  const personen = await db.person.findMany({ where: { lat: null, OR: [{ plz: { not: null } }, { ort: { not: null } }], status: { not: "AUSGESCHIEDEN" } }, take: 500, select: { id: true, strasse: true, plz: true, ort: true } });
  for (const p of personen) {
    if (Date.now() > schluss) break;
    const g = await geocode(p.strasse, p.plz, p.ort, { nurEcht: true });
    if (g) { await db.person.update({ where: { id: p.id }, data: g }); n++; }
    await new Promise((r) => setTimeout(r, 1100));
  }
  return n;
}

/** Koordinaten einer Person/eines Kunden sicherstellen (lazy) – nur im Hintergrundlauf verwenden, nie beim Seitenaufbau. */
export async function koordinatenPerson(p: { id: string; lat: number | null; lon: number | null; strasse: string | null; plz: string | null; ort: string | null }) {
  if (p.lat != null && p.lon != null) return { lat: p.lat, lon: p.lon };
  const g = await geocode(p.strasse, p.plz, p.ort);
  if (g) await db.person.update({ where: { id: p.id }, data: g });
  return g;
}
export async function koordinatenKunde(k: { id: string; lat: number | null; lon: number | null; strasse: string | null; plz: string | null; ort: string | null }) {
  if (k.lat != null && k.lon != null) return { lat: k.lat, lon: k.lon };
  const g = await geocode(k.strasse, k.plz, k.ort);
  if (g) await db.kunde.update({ where: { id: k.id }, data: g });
  return g;
}
