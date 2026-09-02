/** Vorschlags-Merkmale für Bewertungen – werden als Chips angeboten, Mehrfachauswahl, plus Freitext. */
export const MERKMALE_MITARBEITER = {
  positiv: ["Zuverlässig", "Pünktlich", "Fleißig", "Selbstständig", "Teamfähig", "Sorgfältig", "Sicherheitsbewusst", "Lernbereit", "Freundlich", "Gute Deutschkenntnisse", "Flexibel (Schichten)"],
  negativ: ["Unpünktlich", "Unzuverlässig", "Oft krank", "Wenig Eigeninitiative", "Konflikte im Team", "Sicherheitsverstöße", "Sprachbarriere"],
};
export const MERKMALE_BESCHAEFTIGER = {
  positiv: ["Gutes Arbeitsklima", "Faire Behandlung", "Gute Einschulung", "Sicherheit passt", "Klare Ansagen", "Pünktliche Stundenbestätigung", "Kollegiales Team", "Gute Ausstattung"],
  negativ: ["Schlechtes Klima", "Überstunden-Druck", "Mangelnde Einschulung", "Sicherheitsmängel", "Unklare Zuständigkeit", "Respektloser Umgang"],
};
export const merkmaleAusForm = (fd: FormData) => [...new Set(fd.getAll("merkmal").map(String).map((m) => m.trim()).filter(Boolean))].slice(0, 20);
