import type { VertragTyp } from "@/generated/prisma/enums";
export function titel(t: VertragTyp | string) {
  return ({ DIENSTVERTRAG: "Arbeitsvertrag", UEBERLASSUNGSMITTEILUNG: "Überlassungsmitteilung", ZUSATZVEREINBARUNG: "Zusatzvereinbarung", UEBERLASSUNGSVERTRAG: "Überlassungsvertrag", RAHMENVERTRAG: "Rahmenvertrag", VERMITTLUNGSVERTRAG: "Vermittlungsvertrag" } as Record<string, string>)[t] ?? t;
}

/**
 * Dateiname eines Arbeitspapiers – bewusst mit dem Namen aus den Word-Vorlagen als Präfix
 * (Arbeitsvertrag / Ueberlassungsmitteilung / Zusatzvereinbarung), damit keine Verwechslung
 * passiert, plus Mitarbeitername und Vertragsnummer.
 */
export function vertragDateiname(t: VertragTyp | string, nummer: string, person?: { vorname?: string | null; nachname?: string | null } | null) {
  const ascii = (x: string) => x.replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^A-Za-z0-9_-]+/g, "_");
  const teile = [ascii(titel(t)), person?.nachname ? ascii(person.nachname) : null, person?.vorname ? ascii(person.vorname) : null, ascii(nummer)].filter(Boolean);
  return `${teile.join("_")}.pdf`;
}
