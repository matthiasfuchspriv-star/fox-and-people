import { Logo } from "@/components/login-shell";
import { codeAnfordern, codePruefen } from "./actions";

export const dynamic = "force-dynamic";

/** Login der Mitarbeiter-App: E-Mail (oder Telefon zum Finden) → 6-stelliger Code per E-Mail. Kein Passwort, nichts zu merken. */
export default async function AppLogin({ searchParams }: { searchParams: Promise<{ schritt?: string; e?: string; an?: string; test?: string; fehler?: string }> }) {
  const sp = await searchParams;
  const codeSchritt = sp.schritt === "code";
  return (
    <main className="min-h-screen flex flex-col" style={{ background: "#10222a" }}>
      <div className="px-6 pt-14 pb-8 text-white"><Logo size={40} /><div className="text-white/60 text-[13px] mt-2">Mitarbeiter-App</div></div>
      <div className="flex-1 bg-bg rounded-t-[18px] px-6 pt-7 pb-10">
        {!codeSchritt ? (
          <form action={codeAnfordern} className="space-y-4">
            <h1 className="font-display font-extrabold text-[22px]">Willkommen!</h1>
            {sp.fehler === "gesperrt" && <div className="alert alert-red"><span>Dein Zugang ist derzeit gesperrt. Bitte melde dich bei uns: +43 676 4574096</span></div>}
            <p className="text-[14px] text-muted">Gib deine E-Mail-Adresse ein, die bei Fox & People hinterlegt ist. Du bekommst den Anmeldecode per E-Mail – kein Passwort nötig.</p>
            {sp.fehler === "keinemail" && <div className="alert alert-amber"><span>Für dich ist noch keine E-Mail-Adresse hinterlegt. Ruf uns kurz an, dann tragen wir sie ein: +43 676 4574096</span></div>}
            {sp.fehler === "zuoft" && <div className="alert alert-amber"><span>Du hast gerade mehrere Codes angefordert. Warte bitte ein paar Minuten – oder ruf uns an: +43 676 4574096</span></div>}
            <input name="eingabe" required autoFocus inputMode="email" autoComplete="username" placeholder="E-Mail-Adresse" className="input !py-3 !text-[16px]" defaultValue={sp.e ?? ""} />
            <button className="btn btn-primary w-full justify-center !h-12 !text-[15px]">Code anfordern</button>
            <p className="text-[12px] text-muted">Keine E-Mail hinterlegt oder Adresse geändert? Ruf uns an: +43 676 4574096</p>
          </form>
        ) : (
          <form action={codePruefen} className="space-y-4">
            <input type="hidden" name="eingabe" value={sp.e ?? ""} />
            <h1 className="font-display font-extrabold text-[22px]">Code eingeben</h1>
            <p className="text-[14px] text-muted">{sp.an ? `Wir haben einen 6-stelligen Code an ${sp.an} geschickt.` : "Wenn deine Angaben bei uns hinterlegt sind, hast du einen 6-stelligen Code per E-Mail bekommen."} Er ist 10 Minuten gültig – schau notfalls im Spam-Ordner nach.</p>
            {sp.test && <div className="alert alert-amber"><span>Testmodus (kein SMTP): dein Code ist <b className="num text-[16px]">{sp.test}</b></span></div>}
            {sp.fehler === "gesperrt" ? <div className="alert alert-red"><span>Dein Zugang ist derzeit gesperrt. Bitte melde dich bei uns: +43 676 4574096</span></div> : sp.fehler ? <div className="alert alert-red"><span>Code falsch oder abgelaufen – bitte erneut anfordern.</span></div> : null}
            <input name="code" required autoFocus inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" placeholder="123456" className="input !py-3 !text-[24px] text-center tracking-[0.4em] num" />
            <button className="btn btn-primary w-full justify-center !h-12 !text-[15px]">Anmelden</button>
            <a href="/app/login" className="block text-center text-[13px] text-brand font-semibold">Neuen Code anfordern</a>
          </form>
        )}
      </div>
    </main>
  );
}
