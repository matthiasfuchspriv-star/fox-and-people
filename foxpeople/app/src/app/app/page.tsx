import Link from "next/link";
import { Clock, FileText, MessageCircle, User, Gift, MapPin, Phone, ChevronRight, AlertTriangle, CheckCircle2, Wallet, Star, ListChecks, Route } from "lucide-react";
import { requireApp } from "@/lib/app-auth";
import { db } from "@/lib/db";
import { datum, eur } from "@/lib/format";
import { isoWoche } from "@/lib/wochen";
import { ONBOARDING } from "@/lib/onboarding";
import { einstellung, firma as ladeFirma } from "@/lib/einstellungen";
import { EMPFEHLUNG_DEFAULT, empfehlungStand, type EmpfehlungConfig } from "@/lib/empfehlung";
import { appT } from "@/lib/app-sprache";
import { navLabels } from "@/lib/app-nav-labels";
import { AppShell, appMetadata, appViewport } from "./shell";
import { AppKopf } from "./kopf";
import { MehrKacheln } from "./mehr";

export const metadata = appMetadata;
export const viewport = appViewport;
export const dynamic = "force-dynamic";

/**
 * Startseite. Aufbau nach der Regel „eine Sache zuerst“: ganz oben die eine Handlung, die gerade dran ist,
 * darunter der Einsatz, dann die Empfehlungskarte, dann vier Kacheln – der Rest hinter „Mehr“. Große Flächen,
 * wenig Text: die App wird in der Halle mit einer Hand bedient.
 */
export default async function AppHome() {
  const s = await requireApp();
  const heute = new Date();
  const w = isoWoche(heute);
  const { t } = await appT(s.personId);
  const p = await db.person.findUnique({ where: { id: s.personId }, include: {
    einsaetze: { where: { status: { in: ["AKTIV", "GEPLANT"] } }, include: { kunde: { include: { ansprechpartner: true } } }, orderBy: { von: "asc" }, take: 2 },
    qualifikationen: { where: { gultigBis: { not: null } } },
    stundennachweise: { where: { jahr: w.jahr }, orderBy: { kw: "desc" }, take: 3 },
    nachrichten: { where: { vonMitarbeiter: false, gelesenAm: null } },
    abwesenheiten: { where: { bis: { gte: heute } }, orderBy: { von: "asc" }, take: 3 },
    dokumente: { where: { sichtbarImPortal: true, kategorie: "Lohnzettel" }, orderBy: { hochgeladenAm: "desc" }, take: 1 },
    empfehlungen: { orderBy: { erstelltAm: "desc" } },
    kostenstelle: { select: { name: true, telefon: true, email: true } },
  } });
  if (!p) return null;
  const f = await ladeFirma();
  const einsatz = p.einsaetze.find((e) => e.status === "AKTIV") ?? p.einsaetze[0];
  const cfg = { ...EMPFEHLUNG_DEFAULT, ...(await einstellung<Partial<EmpfehlungConfig>>("empfehlung", {})) };
  const werbung = empfehlungStand(p.empfehlungen, cfg);
  const ob = (p.onboarding as Record<string, string> | null) ?? {};
  const offeneCheckliste = ONBOARDING.filter((o) => ["ausweis", "meldezettel", "ecard", "iban", "zeugnisse", "notfallkontakt", "kleidergroesse"].includes(o.key) && !ob[o.key]).length;
  const dispo = einsatz?.kunde.ansprechpartner.find((a) => a.rollen.includes("DISPOSITION")) ?? einsatz?.kunde.ansprechpartner.find((a) => a.istHaupt);
  const vorwoche = isoWoche(new Date(heute.getTime() - 7 * 86400000));
  const nachweisVorwoche = p.stundennachweise.find((n) => n.jahr === vorwoche.jahr && n.kw === vorwoche.kw);
  // Stundenzettel nur, wenn er für den laufenden Einsatz freigeschaltet ist (Standard: aus)
  const stundenApp = einsatz?.status === "AKTIV" && einsatz.stundenerfassungApp;
  const telefon = p.kostenstelle.telefon ?? f.telefon ?? "+43 676 4574096";
  const mail = p.kostenstelle.email ?? f.email ?? "office@foxandpeople.at";

  // Die eine Handlung, die gerade dran ist – nach Dringlichkeit
  const jetzt = (() => {
    if (stundenApp && !nachweisVorwoche && heute.getDay() >= 1)
      return { titel: t("start.stundenEintragen", { kw: vorwoche.kw }), text: t("start.stundenEintragenText"), href: `/app/stunden?jahr=${vorwoche.jahr}&kw=${vorwoche.kw}`, icon: <Clock size={22} /> };
    if (!p.datenschutzAkzeptiertAm)
      return { titel: "Datenschutzinformation bestätigen", text: "Einmal lesen, einmal antippen – dann ist alles erledigt.", href: "/app/profil", icon: <FileText size={22} /> };
    if (!p.profilBestaetigtAm)
      return { titel: "Kontaktdaten bestätigen", text: "Damit wir dich immer erreichen.", href: "/app/profil", icon: <User size={22} /> };
    if (offeneCheckliste > 0)
      return { titel: `${offeneCheckliste} Unterlage${offeneCheckliste > 1 ? "n fehlen" : " fehlt"} noch`, text: "Sobald alles da ist, kann es losgehen.", href: "/app/checkliste", icon: <ListChecks size={22} /> };
    if (p.nachrichten.length)
      return { titel: `${p.nachrichten.length} neue Nachricht${p.nachrichten.length > 1 ? "en" : ""}`, text: "von Fox & People", href: "/app/chat", icon: <MessageCircle size={22} /> };
    return null;
  })();

  // Alles Weitere als kurze Liste – höchstens drei Zeilen, sonst wird die Startseite zur Mahnliste
  const weitere: { text: string; href: string; warn?: boolean }[] = [];
  if (!p.fotoDokumentId) weitere.push({ text: "Profilfoto hochladen (für dein Kundenprofil)", href: "/app/profil" });
  for (const q of p.qualifikationen) {
    const tage = (q.gultigBis!.getTime() - heute.getTime()) / 86400000;
    if (tage < 60) weitere.push({ text: `${q.typ} ${tage < 0 ? "ist abgelaufen" : `läuft am ${datum(q.gultigBis)} ab`} – neuen Nachweis hochladen`, href: "/app/profil", warn: tage < 14 });
  }
  const stunde = heute.getHours();
  const gruss = stunde < 11 ? t("start.gruss.morgen") : stunde < 18 ? t("start.gruss.tag") : t("start.gruss.abend");

  return (
    <AppShell navLabels={navLabels(t)}>
      <AppKopf rechts={<Link href="/app/profil" className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center text-[13px] font-bold">{p.vorname[0]}{p.nachname[0]}</Link>} />
      <div className="px-4 pt-5 space-y-4">
        <div>
          <h1 className="font-display font-extrabold text-[24px] leading-tight">{gruss}, {p.vorname}!</h1>
          <p className="text-muted text-[13.5px]">{p.status === "SUCHT" ? t("start.pool") : `KW ${w.kw} · ${datum(heute)}`}</p>
        </div>

        {jetzt ? (
          <Link href={jetzt.href} className="block card card-pad !border-fox !border-2">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-fox/10 text-fox flex items-center justify-center shrink-0">{jetzt.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-bold tracking-widest uppercase text-fox">{t("start.jetzt")}</div>
                <div className="font-display font-bold text-[16.5px] leading-tight">{jetzt.titel}</div>
                <div className="text-[12.5px] text-muted">{jetzt.text}</div>
              </div>
              <ChevronRight size={20} className="text-muted shrink-0" />
            </div>
          </Link>
        ) : (
          <div className="card card-pad flex items-center gap-3">
            <CheckCircle2 size={22} className="text-teal shrink-0" />
            <div><div className="font-semibold text-[14.5px]">{t("start.allesErledigt")}</div><div className="text-[12.5px] text-muted">{t("start.allesErledigtText")}</div></div>
          </div>
        )}

        {einsatz ? (
          <section className="card card-pad">
            <div className="section-title mb-1">{einsatz.status === "AKTIV" ? t("start.einsatz") : t("start.naechsterEinsatz")}</div>
            <div className="font-display font-bold text-[18px]">{einsatz.kunde.firmenname}</div>
            <div className="text-[13.5px] text-muted">{einsatz.rolleImEinsatz} · seit {datum(einsatz.von)}{einsatz.bis ? ` bis ${datum(einsatz.bis)}` : ""}</div>
            <div className="mt-3 space-y-1.5 text-[13.5px]">
              <div className="flex items-start gap-2"><MapPin size={15} className="mt-0.5 text-fox shrink-0" /><span>{einsatz.einsatzort ?? ([einsatz.kunde.strasse, [einsatz.kunde.plz, einsatz.kunde.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "Adresse folgt")}</span></div>
              {dispo && <div className="flex items-start gap-2"><Phone size={15} className="mt-0.5 text-fox shrink-0" /><span>{t("einsatz.vorOrt")}: {dispo.name}{dispo.telefon ? <> · <a href={`tel:${dispo.telefon}`} className="text-brand font-semibold">{dispo.telefon}</a></> : ""}</span></div>}
              <div className="flex items-start gap-2"><Clock size={15} className="mt-0.5 text-fox shrink-0" /><span>{einsatz.wochenstunden} h/Woche · {({ TAG: "Tagschicht", ZWEI_SCHICHT: "2-Schicht", DREI_SCHICHT: "3-Schicht", FREI: "nach Bedarf" })[einsatz.schichtmodell]}</span></div>
            </div>
            <div className="mt-3 flex gap-2">
              <a href={`https://maps.google.com/?q=${encodeURIComponent(einsatz.einsatzort ?? `${einsatz.kunde.strasse ?? ""} ${einsatz.kunde.plz ?? ""} ${einsatz.kunde.ort ?? ""}`)}`} target="_blank" className="btn btn-secondary btn-sm"><Route size={15} /> {t("start.route")}</a>
              <Link href="/app/einsatz" className="btn btn-secondary btn-sm">{t("start.details")}</Link>
              {stundenApp && <Link href="/app/stunden" className="btn btn-primary btn-sm ml-auto">{t("kachel.stunden")}</Link>}
            </div>
          </section>
        ) : (
          <section className="card card-pad text-[13.5px] text-muted">{t("start.keinEinsatz")}</section>
        )}

        {cfg.aktiv && (
          <Link href="/app/empfehlen" className="block rounded-xl overflow-hidden" style={{ background: "linear-gradient(135deg, #10222a 0%, #1c3a45 100%)" }}>
            <div className="p-5 text-white">
              <div className="flex items-center gap-2">
                <Gift size={20} className="text-fox" />
                <span className="text-[11.5px] font-bold tracking-widest uppercase text-white/60">{t("werben.titel")}</span>
                <ChevronRight size={16} className="ml-auto text-white/50" />
              </div>
              {werbung.eingereicht > 0 ? (
                <>
                  <div className="mt-3 flex items-end gap-5">
                    <div><div className="font-display font-extrabold text-[28px] leading-none">{werbung.erfolgreich}</div><div className="text-[11.5px] text-white/70 mt-0.5">{t("werben.geworben")}</div></div>
                    <div><div className="font-display font-extrabold text-[28px] leading-none text-fox">{eur(werbung.gesamt, 0)}</div><div className="text-[11.5px] text-white/70 mt-0.5">{t("werben.verdient")}</div></div>
                  </div>
                  {werbung.offen > 0 && <div className="text-[12.5px] text-white/70 mt-2">{t("werben.inAuszahlung", { betrag: eur(werbung.offen, 0) })}</div>}
                  {cfg.bonusJeAnzahl > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[12px] text-white/70 mb-1">
                        <span>{werbung.bonusErreicht > 0 ? t("werben.bonusErreicht", { n: werbung.bonusErreicht }) : t("werben.bonusFortschritt")}</span>
                        <span>{t("werben.nochBis", { n: werbung.bisZumBonus, betrag: eur(cfg.bonusBetrag, 0) })}</span>
                      </div>
                      <div className="h-2 rounded-full bg-white/15 overflow-hidden"><div className="h-full bg-fox" style={{ width: `${((cfg.bonusJeAnzahl - werbung.bisZumBonus) / cfg.bonusJeAnzahl) * 100}%` }} /></div>
                    </div>
                  )}
                  {werbung.eingereicht > werbung.erfolgreich && <div className="text-[12.5px] text-white/70 mt-2">{t("werben.inBearbeitung", { n: werbung.eingereicht - werbung.erfolgreich })}</div>}
                </>
              ) : (
                <>
                  <div className="font-display font-extrabold text-[24px] mt-2 leading-tight">{t("werben.pitch", { praemie: eur(cfg.praemieWerber, 0), bonus: eur(cfg.praemieGeworbener, 0) })}</div>
                  <p className="text-[13px] text-white/75 mt-1.5">{t("werben.pitchText", { n: cfg.bonusJeAnzahl, betrag: eur(cfg.bonusBetrag, 0) })}</p>
                </>
              )}
              <div className="text-[11.5px] text-white/55 mt-3 leading-snug">{t("werben.bedingung", { monate: cfg.praemieNachMonaten })}</div>
            </div>
          </Link>
        )}

        {weitere.length > 0 && (
          <section className="card">
            <div className="px-5 pt-4 pb-1 section-title">{t("start.zuErledigen")}</div>
            <ul className="divide-y divide-line">{weitere.slice(0, 3).map((o, i) => (
              <li key={i}><Link href={o.href} className="flex items-center gap-3 px-5 py-3 text-[13.5px]">{o.warn ? <AlertTriangle size={16} className="text-red shrink-0" /> : <CheckCircle2 size={16} className="text-amber shrink-0" />}<span className="flex-1">{o.text}</span><ChevronRight size={16} className="text-muted" /></Link></li>
            ))}</ul>
          </section>
        )}

        <div className="grid grid-cols-2 gap-3">
          {stundenApp && <Kachel href="/app/stunden" icon={<Clock size={20} />} label={t("kachel.stunden")} sub={nachweisVorwoche ? `KW ${vorwoche.kw}: ${nachweisVorwoche.status === "BESTAETIGT" ? "bestätigt" : nachweisVorwoche.status === "ABGELEHNT" ? "bitte korrigieren" : "eingereicht"}` : t("kachel.stunden.sub")} />}
          <Kachel href="/app/lohn" icon={<Wallet size={20} />} label={t("kachel.lohn")} sub={p.dokumente[0] ? `${t("lohn.lohnzettel")} ${datum(p.dokumente[0].hochgeladenAm)}` : t("kachel.lohn.sub")} />
          <Kachel href="/app/chat" icon={<MessageCircle size={20} />} label={t("kachel.chat")} sub={p.nachrichten.length ? `${p.nachrichten.length} neu` : t("kachel.chat.sub")} badge={p.nachrichten.length} />
          <Kachel href="/app/weg" icon={<Star size={20} />} label={t("kachel.weg")} sub={t("kachel.weg.sub")} />
          {!stundenApp && <Kachel href="/app/dokumente" icon={<FileText size={20} />} label={t("kachel.dokumente")} sub={t("kachel.dokumente.sub")} />}
        </div>

        <MehrKacheln
          label={t("start.mehr")}
          wenigerLabel={t("start.wenigerAnzeigen")}
          eintraege={[
            { href: "/app/abwesenheit", label: t("kachel.urlaub"), sub: p.abwesenheiten[0]?.typ === "URLAUB" ? datum(p.abwesenheiten[0].von) : t("kachel.urlaub.sub"), icon: "urlaub" },
            ...(stundenApp ? [{ href: "/app/dokumente", label: t("kachel.dokumente"), sub: t("kachel.dokumente.sub"), icon: "dokumente" as const }] : []),
            { href: "/app/einsatz", label: t("kachel.einsatz"), sub: einsatz ? einsatz.kunde.firmenname : t("kachel.einsatz.sub"), icon: "einsatz" },
            { href: "/app/checkliste", label: t("kachel.checkliste"), sub: offeneCheckliste ? `${offeneCheckliste} offen` : t("kachel.checkliste.sub"), icon: "checkliste", badge: offeneCheckliste },
            { href: "/app/bewerten", label: t("kachel.bewerten"), sub: t("kachel.bewerten.sub"), icon: "bewerten" },
            { href: "/app/empfehlen", label: t("kachel.empfehlen"), sub: t("kachel.empfehlen.sub"), icon: "empfehlen" },
          ]}
        />

        <section className="card card-pad text-[13px] text-muted">
          <div className="font-semibold text-ink mb-1 flex items-center gap-2"><User size={14} /> {t("start.ansprechpartner")}</div>
          {p.kostenstelle.name} · <a href={`tel:${telefon}`} className="text-brand font-semibold">{telefon}</a> · <a href={`mailto:${mail}`} className="text-brand font-semibold">{mail}</a>
          <p className="mt-1.5" dangerouslySetInnerHTML={{ __html: t("start.krankHinweis") }} />
        </section>
      </div>
    </AppShell>
  );
}

function Kachel({ href, icon, label, sub, badge }: { href: string; icon: React.ReactNode; label: string; sub: string; badge?: number }) {
  return (
    <Link href={href} className="card card-pad !p-4 relative">
      <div className="text-fox">{icon}</div>
      <div className="font-semibold text-[14px] mt-2">{label}</div>
      <div className="text-[12px] text-muted">{sub}</div>
      {badge ? <span className="absolute top-3 right-3 bg-fox text-white text-[11px] font-bold rounded-full px-1.5 min-w-[20px] text-center">{badge}</span> : null}
    </Link>
  );
}
