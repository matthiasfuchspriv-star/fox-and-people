/** Hausregel Fox & People: absoluter Mindeststundenlohn (bis 31.12.2026: 13,90 € = KV AKÜ A/B 2026). Ohne DB-Zugriff, auch im Browser nutzbar. */
export const MINDESTLOHN_ABSOLUT: { bis: string; wert: number }[] = [{ bis: "2026-12-31", wert: 13.9 }];
export function mindestlohnAbsolut(am = new Date()): number {
  const iso = am.toISOString().slice(0, 10);
  const r = MINDESTLOHN_ABSOLUT.filter((x) => iso <= x.bis).sort((a, b) => (a.bis < b.bis ? -1 : 1))[0];
  return r?.wert ?? MINDESTLOHN_ABSOLUT[MINDESTLOHN_ABSOLUT.length - 1].wert;
}
