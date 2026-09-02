import Link from "next/link";
import { requireSession, tenantWhere } from "@/lib/auth";
import { db } from "@/lib/db";
import { firma as ladeFirma } from "@/lib/einstellungen";
import { PageHeader, Card, Field } from "@/components/ui";
import { mailSenden } from "../actions";
import { MailForm } from "./form";

export const dynamic = "force-dynamic";

/** E-Mail direkt aus dem Programm – vorbelegt mit Empfänger aus Personal- oder Kundenstamm, Textbausteine, Anhang. */
export default async function NeueMail({ searchParams }: { searchParams: Promise<{ an?: string; name?: string; betreff?: string; personId?: string; kundeId?: string; fehler?: string; vorlage?: string; profil?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const f = await ladeFirma();
  const person = sp.personId ? await db.person.findUnique({ where: { id: sp.personId }, include: { einsaetze: { where: { status: { in: ["AKTIV", "GEPLANT"] } }, include: { kunde: true }, take: 1 } } }) : null;
  const kunde = sp.kundeId ? await db.kunde.findUnique({ where: { id: sp.kundeId }, include: { ansprechpartner: true } }) : null;
  const profil = sp.profil === "1" && !!person;
  const alleKunden = profil ? await db.kunde.findMany({ where: { ...tenantWhere(s), status: "AKTIV" }, orderBy: { firmenname: "asc" }, include: { ansprechpartner: { where: { email: { not: null } } } } }) : [];
  const an = sp.an ?? (profil ? (kunde?.ansprechpartner.find((a) => a.rollen.includes("DISPOSITION"))?.email ?? kunde?.ansprechpartner.find((a) => a.istHaupt)?.email ?? kunde?.email ?? "") : (person?.email ?? kunde?.ansprechpartner.find((a) => a.istHaupt)?.email ?? kunde?.email ?? ""));
  const apName = profil ? (kunde?.ansprechpartner.find((a) => a.email === an)?.name ?? null) : null;
  const anrede = profil ? (apName ? `Sehr geehrte/r ${apName},` : "Sehr geehrte Damen und Herren,") : person ? `${person.geschlecht === "W" ? "Liebe" : person.geschlecht === "M" ? "Lieber" : "Hallo"} ${person.vorname},` : sp.name ? `Sehr geehrte/r ${sp.name},` : "Sehr geehrte Damen und Herren,";
  const einsatz = person?.einsaetze[0];
  const vorlagen: { key: string; label: string; betreff: string; text: string }[] = [
    { key: "frei", label: "Freier Text", betreff: sp.betreff ?? "", text: `${anrede}\n\n` },
    ...(profil ? [{ key: "profil", label: "Kandidatenvorschlag (Kundenprofil im Anhang)", betreff: `Personalvorschlag: ${person!.standardrolle ?? "Mitarbeiter/in"} – ${f.name}`, text: `${anrede}\n\nanbei erhalten Sie das Profil von ${person!.vorname} ${person!.nachname.charAt(0)}. (${person!.standardrolle ?? "Mitarbeiter/in"}${person!.ort ? `, ${person!.ort}` : ""}) für Ihren Personalbedarf.\n\nVerfügbar: ${person!.verfuegbarSofort ? "sofort" : person!.verfuegbarAb ? `ab ${person!.verfuegbarAb.toLocaleDateString("de-AT")}` : "nach Vereinbarung"}\nQualifikationen und bisherige Einsätze finden Sie im angehängten Kundenprofil.\n\nGerne stelle ich Ihnen den Kandidaten persönlich vor oder organisiere einen Probetag. Wann passt Ihnen ein kurzes Telefonat?` }] : []),
    { key: "gespraech", label: "Einladung Vorstellungsgespräch", betreff: `Einladung zum Gespräch – ${f.name}`, text: `${anrede}\n\nvielen Dank für Ihre Bewerbung. Wir möchten Sie gerne persönlich kennenlernen und laden Sie zu einem Gespräch ein:\n\nTermin: ________\nOrt: ${f.strasse}, ${f.plz} ${f.ort} (oder telefonisch/online)\n\nBitte bringen Sie Ausweis, Sozialversicherungsnummer, Nachweise (Führerschein, Staplerschein o. Ä.) und Ihre Bankverbindung mit.\n\nBitte bestätigen Sie den Termin kurz per Antwort auf diese E-Mail.` },
    { key: "einsatzinfo", label: "Einsatzinfo an Mitarbeiter", betreff: `Ihr Einsatz${einsatz ? ` bei ${einsatz.kunde.firmenname}` : ""} – ${f.name}`, text: `${anrede}\n\nhier die Informationen zu Ihrem Einsatz:\n\nBeschäftiger: ${einsatz?.kunde.firmenname ?? "________"}\nAdresse: ${einsatz ? [einsatz.einsatzort ?? einsatz.kunde.strasse, [einsatz.kunde.plz, einsatz.kunde.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "________"}\nBeginn: ${einsatz ? einsatz.von.toLocaleDateString("de-AT") : "________"}, Arbeitsbeginn ______ Uhr\nTätigkeit: ${einsatz?.rolleImEinsatz ?? "________"}\nAnsprechperson vor Ort: ________\nMitzubringen: Sicherheitsschuhe, Ausweis, ________\n\nBei Krankheit oder Verhinderung bitte sofort bei uns melden (Tel. ${f.telefon}) – nicht nur beim Beschäftiger.\n\nWir wünschen einen guten Start!` },
    { key: "absage", label: "Absage an Bewerber", betreff: `Ihre Bewerbung bei ${f.name}`, text: `${anrede}\n\nvielen Dank für Ihr Interesse an einer Tätigkeit bei ${f.name}. Leider können wir Ihnen derzeit keinen passenden Einsatz anbieten.\n\nGerne behalten wir Ihre Unterlagen – mit Ihrem Einverständnis – für sechs Monate in Evidenz und melden uns, sobald sich eine passende Stelle ergibt. Wenn Sie das nicht möchten, genügt eine kurze Antwort, dann löschen wir Ihre Daten.\n\nWir wünschen Ihnen alles Gute.` },
    { key: "kunde_termin", label: "Terminbestätigung Kunde", betreff: `Terminbestätigung – ${f.name}`, text: `${anrede}\n\nvielen Dank für das Gespräch. Wie besprochen bestätige ich unseren Termin am ________ um ______ Uhr.\n\nThemen: Personalbedarf, Anforderungsprofil, Konditionen.\n\nIch freue mich auf das Gespräch.` },
    { key: "kunde_stunden", label: "Stundennachweis anfordern", betreff: `Stundennachweis KW __ – ${f.name}`, text: `${anrede}\n\ndürfen wir Sie um die Bestätigung des Stundennachweises für die vergangene Woche bitten? Bitte senden Sie uns den unterschriebenen Nachweis (Foto oder Scan) bis ________ zurück, damit wir die Abrechnung erstellen können.\n\nVielen Dank!` },
    { key: "kunde_nachfass", label: "Nachfassen Angebot", betreff: `Unser Angebot – ${f.name}`, text: `${anrede}\n\nhaben Sie unser Angebot schon prüfen können? Gerne bespreche ich offene Fragen oder passe den Umfang an Ihren Bedarf an.\n\nWann passt Ihnen ein kurzes Telefonat?` },
  ];
  const signatur = `--\n${s.name}\n${f.name} · ${f.rechtstraeger}\n${f.strasse}, ${f.plz} ${f.ort}\nTel. ${f.telefon} · ${f.email}`;
  const zurueck = person ? `/personen/${person.id}` : kunde ? `/kunden/${kunde.id}` : "/";
  return (
    <>
      <PageHeader crumbs={[person ? { href: `/personen/${person.id}`, label: `${person.vorname} ${person.nachname}` } : kunde ? { href: `/kunden/${kunde.id}`, label: kunde.firmenname } : { href: "/", label: "Dashboard" }, { label: "E-Mail schreiben" }]} title="E-Mail schreiben" sub={`Versand über ${f.email}${process.env.MAIL_MODE === "live" ? "" : " · Testmodus: Mails werden nur protokolliert, bis SMTP hinterlegt ist"} – jede Mail landet in der Historie.`} />
      {sp.fehler && <div className="alert alert-red mb-4">{sp.fehler === "bezug" ? "E-Mails aus dem Programm brauchen einen Bezug zu einer Person oder einem Kunden – bitte über den Akt der Person bzw. des Kunden schreiben." : sp.fehler === "zuoft" ? "Zu viele E-Mails in kurzer Zeit – bitte kurz warten." : "Empfänger, Betreff und Text sind Pflicht."}</div>}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 reveal">
          <form action={mailSenden} className="space-y-4">
            {person && <input type="hidden" name="personId" value={person.id} />}
            {kunde && <input type="hidden" name="kundeId" value={kunde.id} />}
            {profil && <input type="hidden" name="profilPersonId" value={person!.id} />}
            {profil && <div className="alert alert-brand"><span>Das <b>Kundenprofil von {person!.vorname} {person!.nachname}</b> wird als PDF automatisch angehängt, als Kopie unter „Dokumente“ abgelegt und im Verlauf der Person vermerkt.{!kunde && " Empfänger aus der Kundenliste wählen oder eintippen."}</span></div>}
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="An" required><input name="an" type="email" required defaultValue={an} className="input" list="empf" /><datalist id="empf">{alleKunden.flatMap((k) => k.ansprechpartner.map((a) => <option key={a.id} value={a.email!}>{k.firmenname} – {a.name}</option>))}{!profil && kunde?.ansprechpartner.filter((a) => a.email).map((a) => <option key={a.id} value={a.email!}>{a.name}</option>)}{person?.email && <option value={person.email}>{person.vorname} {person.nachname}</option>}</datalist></Field>
              <Field label="CC"><input name="cc" defaultValue="" className="input" placeholder="optional" /></Field>
            </div>
            <MailForm vorlagen={vorlagen} start={sp.vorlage ?? (profil ? "profil" : sp.betreff ? "frei" : person?.status === "SUCHT" ? "gespraech" : "frei")} signatur={signatur} />
            {!profil && <Field label="Anhang" help="PDF, Bild oder Dokument – max. 10 MB."><input type="file" name="anhang" className="input" /></Field>}
            <div className="flex gap-2"><button className="btn btn-primary">Senden</button><Link href={zurueck} className="btn btn-secondary">Abbrechen</Link></div>
          </form>
        </Card>
        <Card title="Empfänger" className="reveal reveal-2">
          {person && <div className="text-[13.5px] space-y-1"><div className="font-semibold">{person.vorname} {person.nachname}</div><div className="text-muted">{person.standardrolle ?? ""}{person.ort ? ` · ${person.ort}` : ""}</div><div>{person.email ?? <span className="text-red">keine E-Mail hinterlegt</span>}</div><div>{person.telefon}</div>{einsatz && <div className="text-muted">Im Einsatz bei {einsatz.kunde.firmenname}</div>}</div>}
          {kunde && <div className="text-[13.5px] space-y-2"><div className="font-semibold">{kunde.firmenname}</div>{kunde.ansprechpartner.map((a) => <div key={a.id}><div>{a.name}{a.istHaupt && " (Haupt)"}{a.funktion ? ` – ${a.funktion}` : ""}</div><div className="text-muted">{a.email ?? "keine E-Mail"}{a.telefon ? ` · ${a.telefon}` : ""}</div></div>)}</div>}
          {!person && !kunde && <p className="text-muted text-[13px]">Freie E-Mail ohne Bezug – wird nur im Mail-Protokoll gespeichert.</p>}
          <p className="help mt-4">Die Signatur wird automatisch angehängt. Der Versand wird im Audit-Log und in der Historie der Person bzw. des Kunden vermerkt.</p>
        </Card>
      </div>
    </>
  );
}
