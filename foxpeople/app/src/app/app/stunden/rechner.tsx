"use client";
import { useEffect } from "react";

/**
 * Rechnet die Stunden je Tag live aus Beginn, Ende und Pause und schreibt sie in das Stundenfeld.
 *
 * Vorher war das Feld mit 8 vorbelegt und hatte Vorrang vor den Uhrzeiten – wer 06:00 bis 17:30 eintrug
 * und die 8 stehen ließ, bekam 8 Stunden statt 11 abgerechnet. Jetzt gilt: sobald Beginn und Ende
 * ausgefüllt sind, steht die richtige Zahl im Feld und der Mitarbeiter sieht sofort, was gezählt wird.
 * Ohne Uhrzeiten bleibt das Feld frei von Hand befüllbar (z. B. für einen halben Tag ohne genaue Zeiten).
 */
const FELDER = ["mo", "di", "mi", "do", "fr", "sa", "so"];

function minuten(v: string): number | null {
  const m = v.trim().replace(".", ":").match(/^(\d{1,2}):?(\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function StundenRechner() {
  useEffect(() => {
    const form = document.querySelector<HTMLFormElement>("form");
    if (!form) return;
    const feld = (n: string) => form.querySelector<HTMLInputElement>(`input[name="${n}"]`);

    const rechne = (tag: string) => {
      const b = feld(`${tag}_beginn`), e = feld(`${tag}_ende`), pa = feld(`${tag}_pause`), st = feld(tag);
      if (!b || !e || !st || st.readOnly) return;
      const a = minuten(b.value), z = minuten(e.value);
      if (a == null || z == null) return;
      let d = z - a;
      if (d < 0) d += 24 * 60; // über Mitternacht
      d -= Number(pa?.value || 0);
      st.value = d > 0 ? String(Math.round((d / 60) * 100) / 100) : "0";
      summe();
    };

    const summe = () => {
      const ziel = document.getElementById("wochensumme");
      if (!ziel) return;
      const s = FELDER.reduce((a, f) => a + (Number(feld(f)?.value.replace(",", ".") || 0) || 0), 0);
      ziel.textContent = s.toLocaleString("de-AT", { maximumFractionDigits: 2 });
    };

    const handler = (ev: Event) => {
      const name = (ev.target as HTMLInputElement)?.name ?? "";
      const tag = FELDER.find((f) => name === `${f}_beginn` || name === `${f}_ende` || name === `${f}_pause`);
      if (tag) rechne(tag);
      else if (FELDER.includes(name)) summe();
    };

    form.addEventListener("input", handler);
    FELDER.forEach(rechne);
    summe();
    return () => form.removeEventListener("input", handler);
  }, []);
  return null;
}
