import React from "react";
import { db } from "./db";
import { firma as ladeFirma } from "./einstellungen";
import { pdfBuffer, TextPdf } from "./pdf";
import { agbText, AGB_TITEL, AGB_VERSION, type AgbArt } from "./agb";

/** AGB als PDF im Briefkopf-Layout – mit den beim Kunden hinterlegten Honorarsätzen, sonst mit den Standardwerten. */
export async function agbPdf(art: AgbArt, kundeId?: string | null): Promise<{ buf: Buffer; dateiname: string }> {
  const f = await ladeFirma();
  const k = kundeId ? await db.kunde.findUnique({ where: { id: kundeId } }) : null;
  const text = await agbText(art, { uebernahmeProzent: k?.uebernahmeProzent, uebernahmeMindest: k?.uebernahmeMindest, vermittlungProzent: k?.vermittlungProzent }, f);
  const titel = AGB_TITEL[art];
  const buf = await pdfBuffer(React.createElement(TextPdf, { firma: f, titel, inhalt: text }));
  return { buf, dateiname: `AGB_${art === "VERMITTLUNG" ? "Arbeitskraeftevermittlung" : "Arbeitskraefteueberlassung"}_${AGB_VERSION}.pdf` };
}
