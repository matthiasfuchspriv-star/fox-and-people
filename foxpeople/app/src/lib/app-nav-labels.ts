import type { T } from "./i18n";

/** Beschriftungen der unteren Navigationsleiste – als einfaches Objekt an die Client-Komponente. */
export const navLabels = (t: T): Record<string, string> => ({
  "nav.start": t("nav.start"),
  "nav.stunden": t("nav.stunden"),
  "nav.lohn": t("nav.lohn"),
  "nav.chat": t("nav.chat"),
  "nav.profil": t("nav.profil"),
});
