import Link from "next/link";

/** 404 – auf Deutsch und mit Weg zurück, statt der englischen Standardseite. */
export default function NichtGefunden() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6" style={{ background: "#10222a" }}>
      <div className="text-center text-white max-w-sm">
        <div className="text-[13px] tracking-[2px] opacity-60 mb-2">FOX &amp; PEOPLE</div>
        <h1 className="font-display font-extrabold text-[22px] mb-2">Diese Seite gibt es nicht</h1>
        <p className="text-[14.5px] opacity-80 mb-5">Vielleicht ist der Link veraltet oder etwas abgeschnitten. Beides passiert – wir helfen gern weiter.</p>
        <div className="flex flex-col gap-2">
          <Link href="/app" className="btn btn-primary justify-center !h-12">Zur Mitarbeiter-App</Link>
          <a href="tel:+436764574096" className="text-white font-bold">+43 676 4574096</a>
        </div>
      </div>
    </main>
  );
}
