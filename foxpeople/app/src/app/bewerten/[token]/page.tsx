import { db } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { Logo } from "@/components/login-shell";
import { bewertungAbgeben } from "./actions";
import { BewertungFelder } from "@/components/bewertung-felder";

export const dynamic = "force-dynamic";

/** Öffentliche Seite: Kunde bewertet einen überlassenen Mitarbeiter (Link aus E-Mail) */
export default async function BewertenPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ danke?: string }> }) {
  const { token } = await params;
  const { danke } = await searchParams;
  const a = await db.bewertungsAnfrage.findUnique({ where: { tokenHash: sha256(token) }, include: { person: true, kunde: true } });
  const gueltig = a && a.gultigBis > new Date();
  return (
    <main className="min-h-screen bg-bg">
      <header className="text-white px-6 py-4" style={{ background: "#10222a" }}><div className="flex items-center gap-3"><Logo size={32} /><span className="ml-auto text-white/60 text-[12px]">Rückmeldung</span></div></header>
      <div className="max-w-xl mx-auto p-6">
        {!gueltig ? <div className="card card-pad text-center"><h1 className="font-display font-bold text-xl mb-2">Link ungültig oder abgelaufen</h1><p className="text-muted text-[13.5px]">Bitte bei Fox & People einen neuen Bewertungslink anfordern.</p></div>
        : danke || a.erledigtAm ? <div className="card card-pad text-center"><h1 className="font-display font-bold text-xl mb-2">Vielen Dank!</h1><p className="text-muted text-[13.5px]">Ihre Rückmeldung zu {a.person.vorname} {a.person.nachname} ist bei uns angekommen.</p></div>
        : (
          <form action={bewertungAbgeben.bind(null, token)} className="card card-pad space-y-5">
            <div><div className="section-title mb-1">{a.kunde.firmenname}</div><h1 className="font-display font-bold text-2xl">Wie zufrieden sind Sie mit {a.person.vorname} {a.person.nachname}?</h1><p className="text-muted text-[13.5px] mt-1">Zwei Klicks genügen – Ihre Rückmeldung hilft uns, Ihnen passende Mitarbeiter zu stellen.</p></div>
            <BewertungFelder ziel="MITARBEITER" />
            <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" name="wiedereinsatz" defaultChecked /> Wir würden {a.person.vorname} {a.person.nachname} wieder einsetzen.</label>
            <button className="btn btn-primary w-full justify-center">Rückmeldung senden</button>
            <p className="text-[12px] text-muted">Ihre Angaben werden intern bei Fox & People gespeichert und nicht veröffentlicht.</p>
          </form>
        )}
      </div>
    </main>
  );
}
