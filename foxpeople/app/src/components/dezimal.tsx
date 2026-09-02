"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Zahlenfeld mit Komma.
 *
 * Warum es das braucht: Ein Eingabefeld, dessen Wert direkt an die geparste Zahl gebunden ist,
 * frisst das Komma. Tippt jemand „13,“, wird daraus die Zahl 13, das Feld zeigt wieder „13“ – das
 * Komma ist weg, bevor die Nachkommastelle kommt. Deshalb hält dieses Feld den **Text** selbst und
 * meldet nur die geparste Zahl nach oben. Von außen wird der Text nur dann neu gesetzt, wenn das Feld
 * nicht gerade bearbeitet wird; sonst würde einem beim Tippen die eigene Eingabe umgeschrieben.
 *
 * Akzeptiert Komma und Punkt, beim Verlassen wird auf die deutsche Schreibweise vereinheitlicht.
 */
/** 13,5 statt 13,50 – aber 13,50 bleibt bei zwei geforderten Nachkommastellen stehen, wenn dort etwas steht. */
function huebsch(n: number, nachkomma: number): string {
  const s = n.toFixed(nachkomma);
  if (!s.includes(".")) return s;
  return s.replace(/0+$/, "").replace(/\.$/, "").replace(".", ",");
}

export function Dezimal({ wert, aendern, disabled, className, nachkomma = 2, placeholder }: {
  wert: number | null;
  aendern: (n: number | null) => void;
  disabled?: boolean;
  className?: string;
  /** Nachkommastellen beim Verlassen des Feldes; 1 z. B. für 38,5 Wochenstunden */
  nachkomma?: number;
  placeholder?: string;
}) {
  const alsText = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));
  const [text, setText] = useState(alsText(wert));
  const fokus = useRef(false);

  useEffect(() => { if (!fokus.current) setText(alsText(wert)); }, [wert]);

  const parse = (v: string): number | null => {
    const t = v.trim().replace(/\s/g, "").replace(",", ".");
    if (t === "" || t === "-" || t === "." || t === "-.") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  return (
    <input
      className={className ?? "input num"}
      inputMode="decimal"
      disabled={disabled}
      placeholder={placeholder}
      value={text}
      onFocus={() => { fokus.current = true; }}
      onChange={(e) => {
        // nur Ziffern, ein Trennzeichen und ein führendes Minus zulassen – sonst bleibt der Rest stehen
        const roh = e.target.value.replace(/[^\d,.\-]/g, "");
        setText(roh);
        aendern(parse(roh));
      }}
      onBlur={() => {
        fokus.current = false;
        const n = parse(text);
        setText(n == null ? "" : huebsch(n, nachkomma));
        aendern(n);
      }}
    />
  );
}
