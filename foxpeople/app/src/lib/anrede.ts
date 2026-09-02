/**
 * Briefanrede für E-Mails an Beschäftiger.
 *
 * Ob geduzt oder gesiezt wird, hängt an der Person, nicht an der Firma: Beim selben Kunden duzt man
 * oft den Disponenten und siezt die Buchhaltung. Deshalb entscheidet der Ansprechpartner, und nur
 * wenn dort nichts hinterlegt ist, gilt die Voreinstellung des Kunden.
 */
export interface AnredeQuelle {
  name?: string | null;
  anrede?: string | null; // "Herr" | "Frau"
  anredeDu?: boolean | null;
}

/** Vorname aus „Maria Huber“ bzw. „Huber Maria“ ist nicht sicher unterscheidbar – für „Hallo“ genügt der erste Teil. */
const rufname = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** Nachname für die förmliche Anrede: der letzte Namensteil ohne Titel. */
const nachname = (name: string) =>
  name.trim().replace(/\b(Dr|Mag|Ing|DI|MSc|BSc|MBA|Prof)\.?\s*/gi, "").trim().split(/\s+/).slice(-1)[0] ?? name;

export function anredeZeile(p: AnredeQuelle | null | undefined, kundeDuzen = false): string {
  const duzen = p?.anredeDu ?? kundeDuzen;
  const name = (p?.name ?? "").trim();
  if (!name) return duzen ? "Hallo," : "Sehr geehrte Damen und Herren,";
  if (duzen) return `Hallo ${rufname(name)},`;
  if (p?.anrede === "Herr") return `Sehr geehrter Herr ${nachname(name)},`;
  if (p?.anrede === "Frau") return `Sehr geehrte Frau ${nachname(name)},`;
  return `Sehr geehrte Damen und Herren,`;
}

/** Grußformel passend zur Anrede. */
export const grussformel = (p: AnredeQuelle | null | undefined, kundeDuzen = false): string =>
  (p?.anredeDu ?? kundeDuzen) ? "Liebe Grüße" : "Mit freundlichen Grüßen";

/** „du“/„Sie“ im Fließtext – damit der Rest der Mail zur Anrede passt. */
export function duSie(p: AnredeQuelle | null | undefined, kundeDuzen = false) {
  const duzen = p?.anredeDu ?? kundeDuzen;
  return duzen
    ? { du: "du", dir: "dir", dich: "dich", dein: "dein", deine: "deine", ihr: "ihr", haben: "hast" }
    : { du: "Sie", dir: "Ihnen", dich: "Sie", dein: "Ihr", deine: "Ihre", ihr: "Ihr", haben: "haben" };
}
