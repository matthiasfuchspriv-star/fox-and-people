"use client";
import { useEffect } from "react";

/**
 * Warnt, bevor eine Seite mit ungespeicherten Eingaben verlassen wird.
 *
 * Der Fall, um den es geht: Jemand füllt einen Bewerber aus, klickt links im Menü weiter – und alles
 * ist weg, ohne einen Hinweis. Das passiert genau dann, wenn man es am wenigsten brauchen kann.
 *
 * Zwei Wege verlassen eine Seite, und beide sind abgedeckt:
 * 1. Fenster schließen oder neu laden → `beforeunload`, das ist die eingebaute Browserabfrage.
 * 2. Ein Link innerhalb der Software → den fängt dieser Wächter selbst ab, weil `beforeunload` bei
 *    einem Wechsel innerhalb der Anwendung nicht auslöst.
 *
 * „Ungespeichert“ heißt: In dem Formular wurde etwas verändert und seither nicht abgeschickt.
 * Ein Klick auf einen Knopf innerhalb desselben Formulars gilt als Speichern.
 */
export function FormWaechter({ text = "Es gibt ungespeicherte Eingaben. Seite trotzdem verlassen?" }: { text?: string }) {
  useEffect(() => {
    let schmutzig = false;
    const merken = (e: Event) => {
      const ziel = e.target as HTMLElement | null;
      // Reine Filter- und Suchformulare (GET) zählen nicht – da geht nichts verloren
      const f = ziel?.closest("form");
      if (!f || f.method?.toLowerCase() === "get") return;
      schmutzig = true;
    };
    const sauber = () => { schmutzig = false; };

    document.addEventListener("input", merken, true);
    document.addEventListener("change", merken, true);
    // Auf dem Dokument lauschen, nicht auf den einzelnen Formularen: Nach dem Speichern baut die
    // Software die Seite neu auf, die alten Formulare sind weg. Wer sich nur an sie hängt, hält die
    // Seite für immer „ungespeichert“ und warnt nach jedem erfolgreichen Speichern grundlos.
    document.addEventListener("submit", sauber, true);

    const beimSchliessen = (e: BeforeUnloadEvent) => { if (schmutzig) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", beimSchliessen);

    // Wechsel innerhalb der Software: Link abfangen, solange etwas ungespeichert ist
    const beimKlick = (e: MouseEvent) => {
      if (!schmutzig || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as HTMLElement | null)?.closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const ziel = a.getAttribute("href");
      if (!ziel || ziel.startsWith("#") || ziel.startsWith("mailto:") || ziel.startsWith("tel:")) return;
      if (!window.confirm(text)) { e.preventDefault(); e.stopPropagation(); }
      else schmutzig = false;
    };
    document.addEventListener("click", beimKlick, true);

    return () => {
      document.removeEventListener("submit", sauber, true);
      document.removeEventListener("input", merken, true);
      document.removeEventListener("change", merken, true);
      document.removeEventListener("click", beimKlick, true);
      window.removeEventListener("beforeunload", beimSchliessen);
    };
  }, [text]);
  return null;
}
