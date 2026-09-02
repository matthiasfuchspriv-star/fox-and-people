"use client";
import { useEffect, useState } from "react";

/**
 * Letzte Auffanglinie. Ohne sie zeigt Next.js bei einem Serverfehler eine englische Standardseite
 * ohne Telefonnummer und ohne Weg zurück – für einen Mitarbeiter am Handy das Ende des Vorgangs.
 *
 * Der häufigste Fall ist harmlos und hat nichts mit einem kaputten Server zu tun: Nach einem Update
 * hat der Browser noch die alte Seite offen. Deren Formulare zeigen auf Server-Aktionen, die es im
 * neuen Stand nicht mehr gibt ("Failed to find Server Action") – und die Anmeldung endet auf dieser
 * Seite, obwohl alles in Ordnung ist. Ein Neuladen behebt das.
 *
 * Genau das passiert jetzt von selbst, und zwar **einmal** je Sitzung: Beim ersten Fehler wird die
 * Seite frisch vom Server geholt. Wiederholt sich der Fehler danach, ist es ein echter, und die
 * Seite bleibt stehen, statt in eine Endlosschleife zu laufen. Auch der Knopf lädt jetzt neu, statt
 * denselben veralteten Stand noch einmal zu zeichnen – das half nämlich nie.
 *
 * Der Merker wird bewusst nicht wieder gelöscht. Ein Aufräumen beim Verlassen der Seite liefe genau
 * dann, wenn neu geladen wird – der Merker wäre weg, der Fehler käme wieder, und die Seite lüde sich
 * bis in alle Ewigkeit neu. Er gilt für diesen Tab, und das genügt.
 */
const SCHLUESSEL = "fp-fehler-neuladen";

export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  const [wartet, setWartet] = useState(true);

  useEffect(() => {
    let schonVersucht = false;
    try { schonVersucht = sessionStorage.getItem(SCHLUESSEL) === "1"; } catch { schonVersucht = true; }
    if (schonVersucht) { setWartet(false); return; }
    try { sessionStorage.setItem(SCHLUESSEL, "1"); } catch { /* privates Fenster – dann eben ohne Merker */ }
    window.location.reload();
  }, []);

  return (
    <html lang="de">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", background: "#10222a", color: "#fff", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 440, textAlign: "center" }}>
          <div style={{ fontSize: 15, letterSpacing: 2, opacity: 0.6, marginBottom: 8 }}>FOX &amp; PEOPLE</div>
          {wartet ? (
            <p style={{ fontSize: 15, opacity: 0.85 }}>Einen Moment – die Seite wird neu geladen …</p>
          ) : (
            <>
              <h1 style={{ fontSize: 22, margin: "0 0 10px" }}>Da ist etwas schiefgegangen</h1>
              <p style={{ fontSize: 15, lineHeight: 1.5, opacity: 0.85, margin: "0 0 20px" }}>
                Der Fehler liegt bei uns, nicht bei dir. Lade die Seite neu – wenn es wieder nicht geht, ruf uns bitte an.
              </p>
              <button onClick={() => window.location.reload()} style={{ background: "#b4522c", color: "#fff", border: 0, borderRadius: 10, padding: "13px 22px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                Seite neu laden
              </button>
              <p style={{ marginTop: 18, fontSize: 15 }}>
                <a href="tel:+436764574096" style={{ color: "#fff", fontWeight: 700 }}>+43 676 4574096</a>
              </p>
              {error.digest && <p style={{ marginTop: 14, fontSize: 12, opacity: 0.45 }}>Kennung für die Fehlersuche: {error.digest}</p>}
            </>
          )}
        </div>
      </body>
    </html>
  );
}
