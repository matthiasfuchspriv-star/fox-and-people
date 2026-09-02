/**
 * Zweisprachigkeit der Mitarbeiter-App: Deutsch und Englisch (Entscheidung Matthias, 30.08.2026).
 *
 * Bewusst ohne Bibliothek – ein Wörterbuch, eine Funktion. Fehlt ein Schlüssel in der englischen Fassung,
 * kommt der deutsche Text zurück; die App bleibt dadurch immer benutzbar, auch wenn eine Übersetzung
 * noch fehlt. Die Sprache steht am Mitarbeiter (`Person.appSprache`) und ist im Profil umschaltbar.
 */
export type Sprache = "de" | "en";
export const SPRACHEN: { code: Sprache; label: string }[] = [
  { code: "de", label: "Deutsch" },
  { code: "en", label: "English" },
];

export function istSprache(x: string | null | undefined): Sprache {
  return x === "en" ? "en" : "de";
}

/** Deutsch ist die Leitfassung – jeder Schlüssel steht hier, Englisch kann Lücken haben. */
const DE = {
  // Navigation und Rahmen
  "nav.start": "Start",
  "nav.stunden": "Stunden",
  "nav.lohn": "Lohn",
  "nav.chat": "Chat",
  "nav.profil": "Profil",
  "app.abmelden": "Abmelden",
  "app.zurueck": "Zurück",

  // Startseite
  "start.gruss.morgen": "Guten Morgen",
  "start.gruss.tag": "Hallo",
  "start.gruss.abend": "Guten Abend",
  "start.pool": "Du bist im Bewerber-Pool – wir melden uns, sobald ein passender Einsatz da ist.",
  "start.jetzt": "Jetzt dran",
  "start.allesErledigt": "Alles erledigt",
  "start.allesErledigtText": "Nichts offen – schönen Feierabend.",
  "start.stundenEintragen": "Stunden für KW {kw} eintragen",
  "start.stundenEintragenText": "Zwei Minuten – dann passt deine Abrechnung.",
  "start.einsatz": "Dein Einsatz",
  "start.naechsterEinsatz": "Nächster Einsatz",
  "start.keinEinsatz": "Derzeit kein Einsatz geplant. Wenn du kurzfristig verfügbar bist, schreib uns im Chat.",
  "start.route": "Route",
  "start.details": "Details",
  "start.zuErledigen": "Zu erledigen",
  "start.mehr": "Mehr",
  "start.wenigerAnzeigen": "Weniger anzeigen",
  "start.ansprechpartner": "Deine Ansprechpartner",
  "start.krankHinweis": "Krankmeldung bitte immer <b>telefonisch vor Arbeitsbeginn</b> bei uns – nicht nur beim Beschäftiger und nicht über die App.",

  // Kacheln
  "kachel.stunden": "Stundennachweis",
  "kachel.stunden.sub": "wöchentlich einreichen",
  "kachel.lohn": "Mein Lohn",
  "kachel.lohn.sub": "Lohnzettel & Zeitkonto",
  "kachel.urlaub": "Urlaub",
  "kachel.urlaub.sub": "beantragen",
  "kachel.chat": "Chat",
  "kachel.chat.sub": "Frage an die Dispo",
  "kachel.dokumente": "Meine Unterlagen",
  "kachel.dokumente.sub": "Verträge, Nachweise",
  "kachel.einsatz": "Mein Einsatz",
  "kachel.einsatz.sub": "kein Einsatz",
  "kachel.checkliste": "Was noch fehlt",
  "kachel.checkliste.sub": "alles erledigt",
  "kachel.bewerten": "Beschäftiger bewerten",
  "kachel.bewerten.sub": "deine Rückmeldung",
  "kachel.weg": "Dein Weg bei uns",
  "kachel.weg.sub": "was du geleistet hast",
  "kachel.empfehlen": "Freunde werben",
  "kachel.empfehlen.sub": "Prämie sichern",

  // Freunde werben Freunde
  "werben.titel": "Freunde werben Freunde",
  "werben.geworben": "Freunde geworben",
  "werben.verdient": "Prämie verdient",
  "werben.inAuszahlung": "davon {betrag} noch in Auszahlung",
  "werben.bonusFortschritt": "Bonus-Fortschritt",
  "werben.nochBis": "noch {n} bis {betrag} extra",
  "werben.bonusErreicht": "{n}× Bonus erreicht",
  "werben.inBearbeitung": "{n} Empfehlung(en) noch in Bearbeitung.",
  "werben.pitch": "{praemie} für dich, {bonus} für deinen Freund",
  "werben.pitchText": "Du kennst jemanden, der zu uns passt? Empfiehl ihn – und für je {n} erfolgreiche Empfehlungen gibt es {betrag} obendrauf.",
  "werben.bedingung": "Prämie nach {monate} Monaten Beschäftigung. Dein Freund darf in den letzten 12 Monaten noch nicht bei uns gemeldet gewesen sein.",

  // Stundennachweis
  "stunden.titel": "Stundennachweis",
  "stunden.beginn": "Beginn",
  "stunden.ende": "Ende",
  "stunden.pause": "Pause min",
  "stunden.stunden": "Stunden",
  "stunden.vorlagen": "Schichtvorlage für die ganze Woche",
  "stunden.notiz": "Notiz (Überstunden, Zulagen, Besonderheiten)",
  "stunden.foto": "Foto des unterschriebenen Stundenzettels",
  "stunden.einreichen": "Stunden einreichen",
  "stunden.wochensumme": "Summe der Woche",
  "form.sendet": "Wird gesendet …",
  "stunden.aendern": "Änderung einreichen",
  "stunden.letzteWochen": "Letzte Wochen",
  "stunden.hilfe": "Trag Beginn, Ende und Pause ein – die Stundenzahl rechnet die App selbst und zeigt sie sofort an. Nur wenn du keine Uhrzeiten hast, kannst du die Stunden direkt eintippen. Überstunden erkennt das Programm automatisch: über der Normalarbeitszeit 50 %, an Sonn- und Feiertagen 100 %.",

  // Lohn
  "lohn.titel": "Lohn",
  "lohn.lohnzettel": "Lohnzettel",
  "lohn.keineLohnzettel": "Noch kein Lohnzettel hinterlegt. Lohnzettel werden nach der Lohnverrechnung (Mitte des Folgemonats) hier abgelegt – du bekommst eine Benachrichtigung, sobald einer da ist.",
  "lohn.zeitkonto": "Zeitkonto",
  "lohn.abgerechnetBis": "abgerechnet bis heute",
  "lohn.fragen": "Fragen zum Lohn oder zum Zeitkonto? Schreib uns im Chat – wir antworten werktags innerhalb eines Tages.",

  // Urlaub / Krankheit
  "abw.titel": "Urlaub",
  "abw.krankTitel": "Krankmeldung",
  "abw.krankText": "Bitte melde dich <b>vor Arbeitsbeginn telefonisch</b> bei uns. Eine Krankmeldung über die App gilt nicht.",
  "abw.anrufen": "Jetzt anrufen",
  "abw.mail": "E-Mail schreiben",
  "abw.urlaubBeantragen": "Urlaub beantragen",
  "abw.resturlaub": "Resturlaub",
  "abw.von": "von",
  "abw.bis": "bis",

  // Einsatz
  "einsatz.titel": "Mein Einsatz",
  "einsatz.aktuell": "Aktueller Einsatz",
  "einsatz.geplant": "Geplanter Einsatz",
  "einsatz.route": "Route öffnen",
  "einsatz.vorOrt": "Vor Ort",
  "einsatz.mitbringen": "Was du mitbringen musst",
  "einsatz.psa": "Schutzausrüstung und die Sicherheitsunterweisung stellt der Beschäftiger vor Ort (§ 6 AÜG). Wenn etwas fehlt oder unklar ist: sofort bei uns melden, nicht einfach anfangen.",
  "einsatz.wichtig": "Wichtig",
  "einsatz.krank": "Krankmeldung immer telefonisch vor Arbeitsbeginn bei uns – nicht nur beim Beschäftiger.",

  // Weg
  "weg.titel": "Dein Weg bei uns",
  "weg.dabeiSeit": "dabei seit",
  "weg.einsaetze": "Einsätze",
  "weg.stunden": "Stunden geleistet",
  "weg.betriebe": "Betriebe",
  "weg.bewertungen": "Das sagen deine Beschäftiger",
  "weg.keineBewertungen": "Noch keine Rückmeldung – nach deinem nächsten Einsatz fragen wir beim Betrieb nach.",
  "weg.nachweise": "Deine Nachweise",
  "weg.naechsterSchritt": "Dein nächster Schritt",
  "weg.praemien": "Verdiente Prämien",

  // Profil
  "profil.titel": "Mein Profil",
  "profil.sprache": "Sprache / Language",
  "profil.benachrichtigungen": "Benachrichtigungen",
  "profil.speichern": "Änderungen speichern",
  "profil.bestaetigen": "Daten bestätigen",
} as const;

export type SchluesselT = keyof typeof DE;

const EN: Partial<Record<SchluesselT, string>> = {
  "nav.start": "Home",
  "nav.stunden": "Hours",
  "nav.lohn": "Pay",
  "nav.chat": "Chat",
  "nav.profil": "Profile",
  "app.abmelden": "Sign out",
  "app.zurueck": "Back",

  "start.gruss.morgen": "Good morning",
  "start.gruss.tag": "Hello",
  "start.gruss.abend": "Good evening",
  "start.pool": "You are in our applicant pool – we will get in touch as soon as a suitable job comes up.",
  "start.jetzt": "Next up",
  "start.allesErledigt": "All done",
  "start.allesErledigtText": "Nothing open – enjoy your evening.",
  "start.stundenEintragen": "Enter your hours for week {kw}",
  "start.stundenEintragenText": "Two minutes – then your payslip is right.",
  "start.einsatz": "Your assignment",
  "start.naechsterEinsatz": "Next assignment",
  "start.keinEinsatz": "No assignment planned at the moment. If you are available at short notice, send us a message.",
  "start.route": "Route",
  "start.details": "Details",
  "start.zuErledigen": "To do",
  "start.mehr": "More",
  "start.wenigerAnzeigen": "Show less",
  "start.ansprechpartner": "Your contacts",
  "start.krankHinweis": "If you are ill, always <b>call us before your shift starts</b> – not only the company you work at, and not through the app.",

  "kachel.stunden": "Timesheet",
  "kachel.stunden.sub": "submit every week",
  "kachel.lohn": "My pay",
  "kachel.lohn.sub": "payslips & hours balance",
  "kachel.urlaub": "Holiday",
  "kachel.urlaub.sub": "request",
  "kachel.chat": "Chat",
  "kachel.chat.sub": "ask the office",
  "kachel.dokumente": "My documents",
  "kachel.dokumente.sub": "contracts, certificates",
  "kachel.einsatz": "My assignment",
  "kachel.einsatz.sub": "no assignment",
  "kachel.checkliste": "What is still missing",
  "kachel.checkliste.sub": "all done",
  "kachel.bewerten": "Rate the company",
  "kachel.bewerten.sub": "your feedback",
  "kachel.weg": "Your journey with us",
  "kachel.weg.sub": "what you have achieved",
  "kachel.empfehlen": "Refer a friend",
  "kachel.empfehlen.sub": "earn a bonus",

  "werben.titel": "Refer a friend",
  "werben.geworben": "friends referred",
  "werben.verdient": "bonus earned",
  "werben.inAuszahlung": "of which {betrag} is still being paid out",
  "werben.bonusFortschritt": "Bonus progress",
  "werben.nochBis": "{n} more for {betrag} extra",
  "werben.bonusErreicht": "{n}× bonus reached",
  "werben.inBearbeitung": "{n} referral(s) still in progress.",
  "werben.pitch": "{praemie} for you, {bonus} for your friend",
  "werben.pitchText": "Do you know someone who would fit in? Refer them – and for every {n} successful referrals you get {betrag} on top.",
  "werben.bedingung": "Bonus after {monate} months of employment. Your friend must not have been registered with us in the last 12 months.",

  "stunden.titel": "Timesheet",
  "stunden.beginn": "Start",
  "stunden.ende": "End",
  "stunden.pause": "Break min",
  "stunden.stunden": "Hours",
  "stunden.vorlagen": "Shift template for the whole week",
  "stunden.notiz": "Note (overtime, allowances, anything unusual)",
  "stunden.foto": "Photo of the signed timesheet",
  "stunden.einreichen": "Submit hours",
  "stunden.wochensumme": "Total for the week",
  "form.sendet": "Sending …",
  "stunden.aendern": "Submit change",
  "stunden.letzteWochen": "Recent weeks",
  "stunden.hilfe": "Enter start, end and break – the app calculates the hours and shows them straight away. Only if you have no times can you type the hours in directly. Overtime is recognised automatically: 50 % above normal working time, 100 % on Sundays and public holidays.",

  "lohn.titel": "Pay",
  "lohn.lohnzettel": "Payslips",
  "lohn.keineLohnzettel": "No payslip yet. Payslips appear here after payroll (around the middle of the following month) – you will get a notification as soon as one arrives.",
  "lohn.zeitkonto": "Hours balance",
  "lohn.abgerechnetBis": "settled up to today",
  "lohn.fragen": "Questions about your pay or hours balance? Send us a message – we reply within one working day.",

  "abw.titel": "Holiday",
  "abw.krankTitel": "Sick leave",
  "abw.krankText": "Please <b>call us before your shift starts</b>. Reporting sick through the app does not count.",
  "abw.anrufen": "Call now",
  "abw.mail": "Send an email",
  "abw.urlaubBeantragen": "Request holiday",
  "abw.resturlaub": "Holiday left",
  "abw.von": "from",
  "abw.bis": "to",

  "einsatz.titel": "My assignment",
  "einsatz.aktuell": "Current assignment",
  "einsatz.geplant": "Planned assignment",
  "einsatz.route": "Open route",
  "einsatz.vorOrt": "On site",
  "einsatz.mitbringen": "What you need to bring",
  "einsatz.psa": "Protective equipment and the safety briefing are provided on site by the company you work at (§ 6 AÜG). If anything is missing or unclear, contact us straight away – do not simply start.",
  "einsatz.wichtig": "Important",
  "einsatz.krank": "If you are ill, always call us before your shift starts – not only the company you work at.",

  "weg.titel": "Your journey with us",
  "weg.dabeiSeit": "with us since",
  "weg.einsaetze": "assignments",
  "weg.stunden": "hours worked",
  "weg.betriebe": "companies",
  "weg.bewertungen": "What the companies say about you",
  "weg.keineBewertungen": "No feedback yet – after your next assignment we will ask the company.",
  "weg.nachweise": "Your certificates",
  "weg.naechsterSchritt": "Your next step",
  "weg.praemien": "Bonuses earned",

  "profil.titel": "My profile",
  "profil.sprache": "Language / Sprache",
  "profil.benachrichtigungen": "Notifications",
  "profil.speichern": "Save changes",
  "profil.bestaetigen": "Confirm details",
};

const WOERTER: Record<Sprache, Partial<Record<SchluesselT, string>>> = { de: DE, en: EN };

/**
 * Übersetzt einen Schlüssel. Platzhalter in geschweiften Klammern werden ersetzt:
 *   t("de")("start.stundenEintragen", { kw: 35 })  →  "Stunden für KW 35 eintragen"
 */
export function uebersetzer(sprache: Sprache) {
  return (schluessel: SchluesselT, werte?: Record<string, string | number>): string => {
    const text = WOERTER[sprache][schluessel] ?? DE[schluessel] ?? String(schluessel);
    if (!werte) return text;
    return text.replace(/\{(\w+)\}/g, (_, k) => String(werte[k] ?? `{${k}}`));
  };
}
export type T = ReturnType<typeof uebersetzer>;
