import { requireApp } from "@/lib/app-auth";
import { db } from "@/lib/db";
import { einstellung } from "@/lib/einstellungen";
import { eur, datum } from "@/lib/format";
import { Gift } from "lucide-react";
import { AppShell, appMetadata, appViewport } from "../shell";
import { AppKopf } from "../kopf";
import { empfehlungAbgeben } from "../actions";
import { werbecodeFuer, werbeUrl, werbeText } from "@/lib/werbelink";
import { TeilenKnoepfe } from "./teilen";
import { EMPFEHLUNG_DEFAULT, empfehlungStand, type EmpfehlungConfig } from "@/lib/empfehlung";

export const metadata = appMetadata; export const viewport = appViewport; export const dynamic = "force-dynamic";

/** Freunde werben Freunde: Empfehlung abgeben, Status und Prämien sehen. */
export default async function AppEmpfehlen({ searchParams }: { searchParams: Promise<{ ok?: string; fehler?: string }> }) {
  const s = await requireApp();
  const sp = await searchParams;
  const cfg = { ...EMPFEHLUNG_DEFAULT, ...(await einstellung<Partial<EmpfehlungConfig>>("empfehlung", {})) };
  const meine = await db.empfehlung.findMany({ where: { werberId: s.personId }, orderBy: { erstelltAm: "desc" } });
  const ich = await db.person.findUniqueOrThrow({ where: { id: s.personId }, select: { vorname: true } });
  const code = cfg.aktiv ? await werbecodeFuer(s.personId) : null;
  const url = code ? werbeUrl(code) : null;
  const stand = empfehlungStand(meine, cfg);
  const STATUS: Record<string, [string, string]> = { NEU: ["eingegangen", "badge-grey"], KONTAKTIERT: ["wir haben Kontakt aufgenommen", "badge-brand"], EINGESTELLT: ["eingestellt – Prämie läuft", "badge-teal"], PRAEMIE_FAELLIG: ["Prämie fällig", "badge-fox"], AUSBEZAHLT: ["Prämie ausbezahlt", "badge-teal"], ABGELEHNT: ["leider nicht passend", "badge-grey"] };
  return (
    <AppShell>
      <AppKopf titel="Freunde werben Freunde" zurueck="/app" />
      <div className="px-4 pt-4 space-y-4">
        <section className="card card-pad" style={{ background: "linear-gradient(135deg, #10222a 0%, #1c3a45 100%)", color: "#fff" }}>
          <Gift size={26} className="text-fox" />
          <div className="font-display font-extrabold text-[22px] mt-2">{eur(cfg.praemieWerber, 0)} für dich, {eur(cfg.praemieGeworbener, 0)} für deinen Freund</div>
          <p className="text-[13.5px] text-white/80 mt-1">Sobald deine Empfehlung bei uns anfängt und {cfg.praemieNachMonaten} Monate dabei bleibt, bekommst du die Prämie.{cfg.bonusJeAnzahl > 0 ? ` Für je ${cfg.bonusJeAnzahl} erfolgreiche Empfehlungen gibt es zusätzlich ${eur(cfg.bonusBetrag, 0)}.` : ""}</p>
        </section>

        <section className="card card-pad">
          <div className="section-title mb-2">Dein Stand</div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div><div className="font-display font-extrabold text-[22px] leading-none">{stand.eingereicht}</div><div className="text-[11.5px] text-muted mt-1">empfohlen</div></div>
            <div><div className="font-display font-extrabold text-[22px] leading-none text-teal">{stand.erfolgreich}</div><div className="text-[11.5px] text-muted mt-1">eingestellt</div></div>
            <div><div className="font-display font-extrabold text-[22px] leading-none text-fox">{eur(stand.gesamt, 0)}</div><div className="text-[11.5px] text-muted mt-1">Prämie gesamt</div></div>
          </div>
          {(stand.ausbezahlt > 0 || stand.offen > 0 || stand.bonusBetrag > 0) && (
            <ul className="mt-3 space-y-1 text-[13px] border-t border-line pt-3">
              {stand.ausbezahlt > 0 && <li className="flex justify-between"><span>bereits ausbezahlt</span><span className="num font-semibold">{eur(stand.ausbezahlt, 0)}</span></li>}
              {stand.offen > 0 && <li className="flex justify-between"><span>zugesagt, in Auszahlung</span><span className="num font-semibold">{eur(stand.offen, 0)}</span></li>}
              {stand.bonusBetrag > 0 && <li className="flex justify-between"><span>{stand.bonusErreicht}× Bonus für je {cfg.bonusJeAnzahl} Empfehlungen</span><span className="num font-semibold">{eur(stand.bonusBetrag, 0)}</span></li>}
            </ul>
          )}
          {cfg.bonusJeAnzahl > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-[12px] text-muted mb-1"><span>Nächster Bonus</span><span>noch {stand.bisZumBonus} Empfehlung{stand.bisZumBonus === 1 ? "" : "en"} bis {eur(cfg.bonusBetrag, 0)}</span></div>
              <div className="h-2 rounded-full bg-surface-2 overflow-hidden"><div className="h-full bg-fox" style={{ width: `${((cfg.bonusJeAnzahl - stand.bisZumBonus) / cfg.bonusJeAnzahl) * 100}%` }} /></div>
            </div>
          )}
        </section>

        <section className="card card-pad">
          <div className="section-title mb-2">So läuft es ab</div>
          <ol className="space-y-2.5 text-[13.5px]">
            {[["Du empfiehlst", "Name und Telefonnummer genügen – wir melden uns innerhalb von zwei Werktagen."],
              ["Wir stellen ein", `Passt es, bekommt dein Freund ${eur(cfg.praemieGeworbener, 0)} Startbonus.`],
              [`${cfg.praemieNachMonaten} Monate später`, `Ist dein Freund noch dabei, bekommst du ${eur(cfg.praemieWerber, 0)} mit der nächsten Lohnabrechnung.`]].map(([t, x], i) => (
              <li key={i} className="flex gap-3"><span className="w-6 h-6 rounded-full bg-fox text-white font-bold text-[12px] flex items-center justify-center shrink-0">{i + 1}</span><span><b>{t}</b><span className="block text-muted text-[12.5px]">{x}</span></span></li>
            ))}
          </ol>
          <p className="help mt-3">Wichtig: Dein Freund darf in den letzten 12 Monaten noch nicht bei uns beschäftigt und auch nicht im Bewerber-Pool gemeldet gewesen sein.</p>
        </section>
        {!cfg.aktiv && <div className="alert alert-amber"><span>Das Empfehlungsprogramm ist derzeit pausiert.</span></div>}
        {sp.ok && <div className="alert alert-teal"><span>Danke! Wir melden uns bei deiner Empfehlung innerhalb von 2 Werktagen.</span></div>}
        {sp.fehler === "pflicht" && <div className="alert alert-red"><span>Bitte Name und Telefon oder E-Mail angeben.</span></div>}
        {sp.fehler === "einverstanden" && <div className="alert alert-red"><span>Bitte bestätige, dass die Person mit der Weitergabe einverstanden ist.</span></div>}
        {cfg.aktiv && url && (
          <section className="card card-pad space-y-3">
            <div className="section-title">Dein persönlicher Link</div>
            <p className="text-[13.5px] text-muted">Schick den Link deinem Freund – er bewirbt sich damit selbst in 30 Sekunden, und wir wissen sofort, dass er von dir kommt. Du musst nichts abtippen.</p>
            <TeilenKnoepfe url={url} text={werbeText(ich.vorname, url, cfg.praemieWerber, cfg.praemieGeworbener)} />
            <details className="border-t border-line pt-3">
              <summary className="text-[13.5px] font-semibold cursor-pointer">Dein QR-Code zum Herzeigen</summary>
              <p className="text-[13px] text-muted mt-2">In der Halle oder in der Pause: Handy hinhalten, Kollege scannt, fertig. Der Code gehört zu dir – die Prämie landet bei dir.</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/app/empfehlen/qr" alt="Mein Empfehlungs-QR-Code" className="w-52 h-52 mx-auto mt-3 rounded-xl border border-line bg-white" />
              <a href="/app/empfehlen/qr" download="Mein-Empfehlungscode.png" className="btn btn-secondary btn-sm w-full justify-center mt-3">Bild speichern</a>
            </details>
          </section>
        )}

        {cfg.aktiv && (
          <form action={empfehlungAbgeben} className="card card-pad space-y-3">
            <div className="section-title">Oder direkt eintragen</div>
            <div className="field"><label className="label">Name</label><input name="name" required className="input" /></div>
            <div className="field"><label className="label">Telefon</label><input name="telefon" inputMode="tel" className="input" /></div>
            <div className="field"><label className="label">E-Mail</label><input name="email" type="email" className="input" /></div>
            <div className="field"><label className="label">Was kann er/sie? Ab wann?</label><textarea name="notiz" rows={2} className="textarea" placeholder="z. B. Staplerschein, Schichtbereitschaft, ab sofort" /></div>
            <label className="flex items-start gap-2 text-[13px]"><input type="checkbox" name="einverstanden" className="mt-0.5" /> Die Person weiß, dass ich sie empfehle, und ist mit dem Kontakt durch Fox & People einverstanden.</label>
            <button className="btn btn-primary w-full justify-center">Empfehlung senden</button>
          </form>
        )}
        <section className="card">
          <div className="px-5 pt-4 pb-1 section-title">Deine Empfehlungen</div>
          {meine.length ? <ul className="divide-y divide-line">{meine.map((e) => <li key={e.id} className="px-5 py-2.5 text-[13.5px] flex items-center gap-3"><span className="flex-1"><b>{e.name}</b><div className="text-[12px] text-muted">{datum(e.erstelltAm)}{e.faelligAm && e.status === "EINGESTELLT" ? ` · Prämie fällig ab ${datum(e.faelligAm)}` : ""}{e.ausbezahltAm ? ` · ausbezahlt ${datum(e.ausbezahltAm)}` : ""}</div></span><span className={`badge ${STATUS[e.status][1]}`}>{STATUS[e.status][0]}</span></li>)}</ul> : <p className="text-muted text-[13px] px-5 pb-4">Noch keine Empfehlung – du kennst sicher jemanden, der Arbeit sucht.</p>}
        </section>
        <div className="card card-pad text-[12.5px] text-muted whitespace-pre-line">{cfg.bedingungen}</div>
      </div>
    </AppShell>
  );
}
