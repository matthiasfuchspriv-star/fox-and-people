"use client";
import { AlertTriangle, RotateCw, Phone } from "lucide-react";

/** Fehlerseite der Mitarbeiter-App – deutsch, mit Telefonnummer und einem Knopf, der wirklich hilft. */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="min-h-screen bg-bg flex items-center justify-center px-6 max-w-lg mx-auto">
      <div className="text-center">
        <AlertTriangle size={34} className="text-red mx-auto mb-3" />
        <h1 className="font-display font-extrabold text-[22px] mb-2">Das hat gerade nicht geklappt</h1>
        <p className="text-[14px] text-muted mb-5">Der Fehler liegt bei uns. Probier es noch einmal – wenn es wieder nicht geht, ruf uns einfach an.</p>
        <button onClick={() => reset()} className="btn btn-primary w-full justify-center !h-12"><RotateCw size={17} /> Nochmal versuchen</button>
        <a href="tel:+436764574096" className="btn btn-secondary w-full justify-center !h-12 mt-2"><Phone size={17} /> +43 676 4574096</a>
        <a href="/app" className="block text-[12.5px] text-brand font-semibold mt-4">Zur Startseite</a>
      </div>
    </main>
  );
}
