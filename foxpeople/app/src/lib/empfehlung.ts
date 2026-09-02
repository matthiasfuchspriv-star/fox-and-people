/** Konfiguration „Freunde werben Freunde“ (Einstellung `empfehlung`, änderbar unter Einstellungen → Firma) */
export interface EmpfehlungConfig {
  aktiv: boolean;
  praemieWerber: number;
  praemieGeworbener: number;
  praemieNachMonaten: number;
  /** Zusatzbonus: je so vielen erfolgreich geworbenen Freunden gibt es einen Extrabetrag */
  bonusJeAnzahl: number;
  bonusBetrag: number;
  bedingungen: string;
}

export const EMPFEHLUNG_DEFAULT: EmpfehlungConfig = {
  aktiv: true,
  praemieWerber: 100,
  praemieGeworbener: 100,
  praemieNachMonaten: 3,
  bonusJeAnzahl: 5,
  bonusBetrag: 100,
  bedingungen:
    "Bedingungen: Die empfohlene Person darf in den letzten 12 Monaten nicht bei Fox & People beschäftigt und auch nicht im Bewerber-Pool gemeldet gewesen sein. Die Prämie wird ausbezahlt, sobald die empfohlene Person 3 Monate durchgehend beschäftigt ist – beide müssen zu diesem Zeitpunkt in einem aufrechten Dienstverhältnis stehen. Für je 5 erfolgreich geworbene Freunde gibt es zusätzlich 100 € Bonus. Die Prämie ist lohnsteuer- und sozialversicherungspflichtig. Kein Rechtsanspruch; das Programm kann jederzeit beendet werden.",
};

export interface EmpfehlungStand {
  eingereicht: number;
  /** eingestellt, Prämie fällig oder bereits ausbezahlt */
  erfolgreich: number;
  /** bereits ausbezahlte Prämien in € */
  ausbezahlt: number;
  /** zugesagte, noch nicht ausbezahlte Prämien in € */
  offen: number;
  /** Anzahl der bereits erreichten Bonusstufen */
  bonusErreicht: number;
  bonusBetrag: number;
  /** wie viele erfolgreiche Empfehlungen noch bis zum nächsten Bonus fehlen */
  bisZumBonus: number;
  gesamt: number;
}

const ERFOLG = ["EINGESTELLT", "PRAEMIE_FAELLIG", "AUSBEZAHLT"];

/** Rechnet den Prämienstand eines Werbers aus – Grundlage für die Übersicht in der App. */
export function empfehlungStand(
  empfehlungen: { status: string; praemieBetrag?: number | null }[],
  cfg: EmpfehlungConfig,
): EmpfehlungStand {
  const erfolgreich = empfehlungen.filter((e) => ERFOLG.includes(e.status)).length;
  const ausbezahlt = empfehlungen.filter((e) => e.status === "AUSBEZAHLT").reduce((a, e) => a + (e.praemieBetrag ?? cfg.praemieWerber), 0);
  const offen = empfehlungen.filter((e) => e.status === "EINGESTELLT" || e.status === "PRAEMIE_FAELLIG").reduce((a, e) => a + (e.praemieBetrag ?? cfg.praemieWerber), 0);
  const bonusErreicht = cfg.bonusJeAnzahl > 0 ? Math.floor(erfolgreich / cfg.bonusJeAnzahl) : 0;
  const bonusBetrag = bonusErreicht * cfg.bonusBetrag;
  const rest = cfg.bonusJeAnzahl > 0 ? (cfg.bonusJeAnzahl - (erfolgreich % cfg.bonusJeAnzahl)) % cfg.bonusJeAnzahl : 0;
  return {
    eingereicht: empfehlungen.length,
    erfolgreich,
    ausbezahlt,
    offen,
    bonusErreicht,
    bonusBetrag,
    bisZumBonus: rest === 0 && cfg.bonusJeAnzahl > 0 ? cfg.bonusJeAnzahl : rest,
    gesamt: ausbezahlt + offen + bonusBetrag,
  };
}
