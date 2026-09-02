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
      <AppKopf rechts={<Link href="/app/profil" aria-label={t("nav.profil")} className="avatar w-9 h-9 text-[13px] bg-brand text-white">{p.vorname[0]}{p.nachname[0]}</Link>} />
      <div className="px-4 pt-3 space-y-4">
        <div>
          <h1 className="app-title">{gruss}, {p.vorname}!</h1>
          <p className="text-muted text-[14px] mt-1">{p.status === "SUCHT" ? t("start.pool") : `KW ${w.kw} · ${datum(heute)}`}</p>
        </div>

        {jetzt ? (
          <Link href={jetzt.href} className="app-hero block px-4 py-4 active:scale-[.985] transition-transform">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/12 text-white flex items-center justify-center shrink-0">{jetzt.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="text-[11.5px] font-semibold tracking-wide uppercase text-[#e6a98c]">{t("start.jetzt")}</div>
                <div className="font-display font-semibold text-[16px] leading-snug mt-0.5">{jetzt.titel}</div>
                <div className="text-[12.5px] text-white/70 mt-0.5">{jetzt.text}</div>
              </div>
              <ChevronRight size={20} className="text-white/50 shrink-0" />
            </div>
          </Link>
        ) : (
          <div className="card card-pad flex items-center gap-3">
            <CheckCircle2 size={22} className="text-teal shrink-0" />
            <div><div className="font-semibold text-[14.5px]">{t("start.allesErledigt")}</div><div className="text-[12.5px] text-muted">{t("start.allesErledigtText")}</div></div>
          </div>
        )}

        {einsatz ? (
          <section className="app-list">
            <div className="px-4 pt-3.5 pb-3">
              <div className="section-title">{einsatz.status === "AKTIV" ? t("start.einsatz") : t("start.naechsterEinsatz")}</div>
              <div className="font-display font-semibold text-[18px] tracking-[-0.01em] mt-0.5">{einsatz.kunde.firmenname}</div>
              <div className="text-[13.5px] text-muted">{einsatz.rolleImEinsatz} · seit {datum(einsatz.von)}{einsatz.bis ? ` bis ${datum(einsatz.bis)}` : ""}</div>
            </div>
            <a href={`https://maps.google.com/?q=${encodeURIComponent(einsatz.einsatzort ?? `${einsatz.kunde.strasse ?? ""} ${einsatz.kunde.plz ?? ""} ${einsatz.kunde.ort ?? ""}`)}`} target="_blank" className="app-row border-t border-line">
              <span className="app-row-icon"><MapPin size={15} /></span>
              <span className="flex-1 min-w-0 text-[14px]">{einsatz.einsatzort ?? ([einsatz.kunde.strasse, [einsatz.kunde.plz, einsatz.kunde.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "Adresse folgt")}</span>
              <span className="text-[12.5px] text-muted flex items-center gap-1 shrink-0"><Route size={13} /> {t("start.route")}</span>
              <ChevronRight size={16} className="app-row-chev" />
            </a>
            {dispo && (dispo.telefon ? (
              <a href={`tel:${dispo.telefon}`} className="app-row">
                <span className="app-row-icon"><Phone size={15} /></span>
                <span className="flex-1 min-w-0 text-[14px]">{t("einsatz.vorOrt")}: {dispo.name}<span className="block text-[12.5px] text-muted num">{dispo.telefon}</span></span>
                <ChevronRight size={16} className="app-row-chev" />
              </a>
            ) : (
              <div className="app-row"><span className="app-row-icon"><Phone size={15} /></span><span className="flex-1 text-[14px]">{t("einsatz.vorOrt")}: {dispo.name}</span></div>
            ))}
            <div className="app-row"><span className="app-row-icon"><Clock size={15} /></span><span className="flex-1 text-[14px]">{einsatz.wochenstunden} h/Woche · {({ TAG: "Tagschicht", ZWEI_SCHICHT: "2-Schicht", DREI_SCHICHT: "3-Schicht", FREI: "nach Bedarf" })[einsatz.schichtmodell]}</span></div>
            <div className="flex gap-2 px-4 py-3 border-t border-line bg-surface">
              <Link href="/app/einsatz" className="btn btn-secondary flex-1">{t("start.details")}</Link>
              {stundenApp && <Link href="/app/stunden" className="btn btn-primary flex-1">{t("kachel.stunden")}</Link>}
            </div>
          </section>
        ) : (
          <section className="card card-pad text-[13.5px] text-muted">{t("start.keinEinsatz")}</section>
        )}

        {cfg.aktiv && (
          <Link href="/app/empfehlen" className="block rounded-[14px] overflow-hidden bg-fox-soft border border-fox/15 active:scale-[.985] transition-transform">
            <div className="p-5 text-fox-ink">
              <div className="flex items-center gap-2">
                <Gift size={18} className="text-fox" />
                <span className="text-[12.5px] font-semibold text-fox-ink/80">{t("werben.titel")}</span>
                <ChevronRight size={16} className="ml-auto text-fox-ink/50" />
              </div>
              {werbung.eingereicht > 0 ? (
                <>
                  <div className="mt-3 flex items-end gap-5">
                    <div><div className="font-display font-bold text-[28px] leading-none num tracking-[-0.03em] text-ink">{werbung.erfolgreich}</div><div className="text-[12px] text-fox-ink/80 mt-1">{t("werben.geworben")}</div></div>
                    <div><div className="font-display font-bold text-[28px] leading-none num tracking-[-0.03em] text-fox">{eur(werbung.gesamt, 0)}</div><div className="text-[12px] text-fox-ink/80 mt-1">{t("werben.verdient")}</div></div>
                  </div>
                  {werbung.offen > 0 && <div className="text-[12.5px] text-fox-ink/80 mt-2">{t("werben.inAuszahlung", { betrag: eur(werbung.offen, 0) })}</div>}
                  {cfg.bonusJeAnzahl > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[12px] text-fox-ink/80 mb-1">
                        <span>{werbung.bonusErreicht > 0 ? t("werben.bonusErreicht", { n: werbung.bonusErreicht }) : t("werben.bonusFortschritt")}</span>
                        <span>{t("werben.nochBis", { n: werbung.bisZumBonus, betrag: eur(cfg.bonusBetrag, 0) })}</span>
                      </div>
                      <div className="h-2 rounded-full bg-fox/15 overflow-hidden"><div className="h-full bg-fox rounded-full" style={{ width: `${((cfg.bonusJeAnzahl - werbung.bisZumBonus) / cfg.bonusJeAnzahl) * 100}%` }} /></div>
                    </div>
                  )}
                  {werbung.eingereicht > werbung.erfolgreich && <div className="text-[12.5px] text-fox-ink/80 mt-2">{t("werben.inBearbeitung", { n: werbung.eingereicht - werbung.erfolgreich })}</div>}
                </>
              ) : (
                <>
                  <div className="font-display font-bold text-[22px] tracking-[-0.02em] mt-2 leading-tight text-ink">{t("werben.pitch", { praemie: eur(cfg.praemieWerber, 0), bonus: eur(cfg.praemieGeworbener, 0) })}</div>
                  <p className="text-[13.5px] text-fox-ink/85 mt-1.5">{t("werben.pitchText", { n: cfg.bonusJeAnzahl, betrag: eur(cfg.bonusBetrag, 0) })}</p>
                </>
              )}
              <div className="text-[12px] text-fox-ink/65 mt-3 leading-snug">{t("werben.bedingung", { monate: cfg.praemieNachMonaten })}</div>
            </div>
          </Link>
        )}

        {weitere.length > 0 && (
          <section className="app-list">
            <div className="px-4 pt-3.5 pb-1 section-title">{t("start.zuErledigen")}</div>
            <ul>{weitere.slice(0, 3).map((o, i) => (
              <li key={i}><Link href={o.href} className="app-row">{o.warn ? <span className="app-row-icon !bg-red-soft !text-red"><AlertTriangle size={15} /></span> : <span className="app-row-icon !bg-amber-soft !text-amber"><CheckCircle2 size={15} /></span>}<span className="flex-1 text-[14px]">{o.text}</span><ChevronRight size={16} className="app-row-chev" /></Link></li>
            ))}</ul>
          </section>
        )}

        <div className="grid grid-cols-2 gap-3">
          {stundenApp && <Kachel href="/app/stunden" icon={<Clock size={16} />} label={t("kachel.stunden")} sub={nachweisVorwoche ? `KW ${vorwoche.kw}: ${nachweisVorwoche.status === "BESTAETIGT" ? "bestätigt" : nachweisVorwoche.status === "ABGELEHNT" ? "bitte korrigieren" : "eingereicht"}` : t("kachel.stunden.sub")} />}
          <Kachel href="/app/lohn" icon={<Wallet size={16} />} label={t("kachel.lohn")} sub={p.dokumente[0] ? `${t("lohn.lohnzettel")} ${datum(p.dokumente[0].hochgeladenAm)}` : t("kachel.lohn.sub")} />
          <Kachel href="/app/chat" icon={<MessageCircle size={16} />} label={t("kachel.chat")} sub={p.nachrichten.length ? `${p.nachrichten.length} neu` : t("kachel.chat.sub")} badge={p.nachrichten.length} />
          <Kachel href="/app/weg" icon={<Star size={16} />} label={t("kachel.weg")} sub={t("kachel.weg.sub")} />
          {!stundenApp && <Kachel href="/app/dokumente" icon={<FileText size={16} />} label={t("kachel.dokumente")} sub={t("kachel.dokumente.sub")} />}
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

        <section className="card card-pad text-[13.5px] text-muted">
          <div className="font-semibold text-ink mb-1.5 flex items-center gap-2"><User size={14} /> {t("start.ansprechpartner")}</div>
          {p.kostenstelle.name} · <a href={`tel:${telefon}`} className="text-brand font-semibold">{telefon}</a> · <a href={`mailto:${mail}`} className="text-brand font-semibold">{mail}</a>
          <p className="mt-1.5" dangerouslySetInnerHTML={{ __html: t("start.krankHinweis") }} />
        </section>
      </div>
    </AppShell>
  );
}

function Kachel({ href, icon, label, sub, badge }: { href: string; icon: React.ReactNode; label: string; sub: string; badge?: number }) {
  return (
    <Link href={href} className="app-tile">
      <div className="app-row-icon">{icon}</div>
      <div className="font-semibold text-[14.5px] mt-3 leading-tight">{label}</div>
      <div className="text-[12.5px] text-muted mt-0.5">{sub}</div>
      {badge ? <span className="nav-count absolute top-3 right-3 !ml-0">{badge}</span> : null}
    </Link>
  );
}
