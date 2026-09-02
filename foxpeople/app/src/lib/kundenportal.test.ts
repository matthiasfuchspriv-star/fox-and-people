import { describe, it, expect } from "vitest";
import { portalGueltig, PORTAL_GUELTIG_TAGE, PORTAL_NACHFRIST_STUNDEN } from "./kundenportal";

/**
 * Der Kundenportal-Link ist ein Schlüssel ohne Schloss: Wer ihn hat, kommt hinein – ganz bewusst, damit
 * der Beschäftiger kein Konto braucht. Umso wichtiger, dass er nicht wochenlang in einem Postfach
 * weiterlebt. Vorher galt er 21 Tage und blieb auch nach der Nutzung offen.
 */
const inTagen = (t: number) => new Date(Date.now() + t * 86400000);
const vorStunden = (h: number) => new Date(Date.now() - h * 3600000);

describe("Gültigkeit des Kundenportal-Links", () => {
  it("gilt eine Woche, nicht drei", () => {
    expect(PORTAL_GUELTIG_TAGE).toBe(7);
  });

  it("ist vor dem Ablaufdatum und ohne Nutzung gültig", () => {
    expect(portalGueltig({ gultigBis: inTagen(5), verwendetAm: null })).toBe(true);
  });

  it("ist nach dem Ablaufdatum ungültig", () => {
    expect(portalGueltig({ gultigBis: inTagen(-1), verwendetAm: null })).toBe(false);
  });

  it("bleibt am selben Tag nach dem Öffnen nutzbar", () => {
    expect(portalGueltig({ gultigBis: inTagen(5), verwendetAm: vorStunden(3) })).toBe(true);
  });

  it("ist nach der Nachfrist tot, auch wenn das Ablaufdatum noch offen ist", () => {
    expect(portalGueltig({ gultigBis: inTagen(5), verwendetAm: vorStunden(PORTAL_NACHFRIST_STUNDEN + 1) })).toBe(false);
  });
});
