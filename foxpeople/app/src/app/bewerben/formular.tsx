import { Logo } from "@/components/login-shell";
import { bewerbungAbsenden } from "./actions";

export const ROLLEN = [
  "Lagerlogistik / Kommissionierung",
  "Staplerfahrer",
  "Produktionshelfer",
  "Schlosser / Metallbau",
  "Schweißer",
  "Elektriker",
  "Tischler",
  "Monteur",
  "Reinigung",
  "Bürokraft",
  "Sonstiges / weiß ich noch nicht",
];

/**
 * Kurzbewerbung ohne Login – dieselbe Strecke für den persönlichen Empfehlungs-Link (/w/<code>) und für
 * den allgemeinen QR-Code (/bewerben). Bewusst kurz: Name, Handynummer, was du kannst, ab wann. Alles
 * andere klären wir im Rückruf; jede zusätzliche Pflichtfrage kostet Bewerbungen.
 */
export function BewerbungsFormular({
  werber, code, quelle, ok, fehler, praemieGeworbener,
}: {
  werber?: { vorname: string; nachname: string } | null;
  code?: string;
  quelle?: string;
  ok?: boolean;
  fehler?: string;
  praemieGeworbener?: number;
}) {
  const eur = (n: number) => `${n.toLocaleString("de-AT")} €`;
  return (
    <main className="min-h-screen flex flex-col" style={{ background: "#10222a" }}>
      <div className="px-6 pt-12 pb-7 text-white">
        <Logo size={38} />
        {werber ? (
          <>
            <h1 className="font-display font-extrabold text-[26px] mt-5 leading-tight">{werber.vorname} empfiehlt dich für einen Job bei uns.</h1>
            <p className="text-white/75 text-[14.5px] mt-2">
              Wir sind Fox &amp; People aus Kilb – wir bringen Leute und Betriebe in Niederösterreich zusammen.
              {praemieGeworbener ? ` Wenn es passt, bekommst du ${eur(praemieGeworbener)} Startbonus.` : ""}
            </p>
          </>
        ) : (
          <>
            <h1 className="font-display font-extrabold text-[26px] mt-5 leading-tight">In 30 Sekunden bewerben.</h1>
            <p className="text-white/75 text-[14.5px] mt-2">Kein Lebenslauf, kein Anschreiben. Name, Handynummer, was du kannst – wir rufen dich zurück.</p>
          </>
        )}
      </div>

      <div className="flex-1 bg-bg rounded-t-[18px] px-6 pt-7 pb-12">
        {ok ? (
          <div className="space-y-4">
            <div className="card card-pad text-center">
              <div className="font-display font-extrabold text-[22px] mb-2">Danke – wir melden uns!</div>
              <p className="text-[14px] text-muted">Wir rufen dich innerhalb von zwei Werktagen an. Wenn es eilig ist: <a href="tel:+436764574096" className="text-brand font-semibold">+43 676 4574096</a></p>
            </div>
            <p className="text-[12.5px] text-muted text-center">Du bekommst keine Werbung von uns. Deine Daten verwenden wir nur, um dich zu einem Job zu kontaktieren.</p>
          </div>
        ) : (
          <form action={bewerbungAbsenden} className="space-y-4">
            <input type="hidden" name="code" value={code ?? ""} />
            <input type="hidden" name="quelle" value={quelle ?? ""} />
            {fehler === "pflicht" && <div className="alert alert-red"><span>Bitte gib deinen Namen und deine Handynummer an.</span></div>}
            {fehler === "einverstanden" && <div className="alert alert-red"><span>Ohne dein Einverständnis dürfen wir dich leider nicht kontaktieren.</span></div>}
            {fehler === "zuoft" && <div className="alert alert-amber"><span>Es sind gerade sehr viele Bewerbungen von diesem Anschluss gekommen. Bitte ruf uns einfach an: +43 676 4574096</span></div>}

            <div className="field"><label className="label">Wie heißt du?</label><input name="name" required autoFocus autoComplete="name" placeholder="Vor- und Nachname" className="input !py-3 !text-[16px]" /></div>
            <div className="field"><label className="label">Handynummer</label><input name="telefon" required inputMode="tel" autoComplete="tel" placeholder="0664 1234567" className="input !py-3 !text-[16px]" /></div>
            <div className="field"><label className="label">E-Mail <span className="text-muted font-normal">(freiwillig)</span></label><input name="email" type="email" inputMode="email" autoComplete="email" className="input !py-3 !text-[16px]" /></div>
            <div className="field"><label className="label">Was kannst du?</label>
              <select name="rolle" className="select !py-3 !text-[16px]"><option value="">– bitte wählen –</option>{ROLLEN.map((r) => <option key={r} value={r}>{r}</option>)}</select>
            </div>
            <div className="field"><label className="label">Ab wann?</label>
              <select name="verfuegbar" defaultValue="sofort" className="select !py-3 !text-[16px]">
                <option value="sofort">sofort</option>
                <option value="2wochen">in 2 Wochen</option>
                <option value="1monat">in einem Monat</option>
                <option value="spaeter">später / erst mal unverbindlich</option>
              </select>
            </div>
            <div className="field"><label className="label">Noch etwas, das wir wissen sollen? <span className="text-muted font-normal">(freiwillig)</span></label><textarea name="notiz" rows={2} className="textarea" placeholder="z. B. Staplerschein, Führerschein B, Schichtbereitschaft, wo du wohnst" /></div>

            <label className="flex items-start gap-2.5 text-[13.5px]">
              <input type="checkbox" name="einverstanden" required className="mt-1 w-5 h-5" />
              <span>Ihr dürft mich zu passenden Jobs kontaktieren und meine Angaben dafür speichern. Ich kann das jederzeit widerrufen.</span>
            </label>

            <button className="btn btn-primary w-full justify-center !h-13 !text-[16px]">Absenden</button>
            <p className="text-[12.5px] text-muted text-center">Lieber telefonisch? <a href="tel:+436764574096" className="text-brand font-semibold">+43 676 4574096</a></p>
          </form>
        )}
      </div>
    </main>
  );
}
