import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown, Send, PenLine } from "lucide-react";
import { requireSession, darfKostenstelle } from "@/lib/auth";
import { db } from "@/lib/db";
import { mailFuer } from "@/lib/kontakte";
import { datum } from "@/lib/format";
import { PageHeader, Card, Field, vertragStatusBadge } from "@/components/ui";
import { vertragSpeichern, vertragVersenden, vertragUnterschrieben, vertragStatus, vertragLoeschen } from "../actions";
import { titel } from "../titel";

export const dynamic = "force-dynamic";

export default async function VertragDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ gesendet?: string; fehler?: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  const v = await db.vertrag.findUnique({ where: { id }, include: { person: true, kunde: { include: { ansprechpartner: true } }, einsatz: true, kostenstelle: true, dokumente: true } });
  if (!v || !darfKostenstelle(s, v.kostenstelleId)) notFound();
  const offen = /\[[\w.]+\]/.test(v.inhalt);
  // Die drei Arbeitspapiere entstehen strukturiert aus den Stammdaten (Layout der Word-Vorlagen) –
  // der Freitext-Editor gilt für sie nicht, sonst verpuffen Korrekturen im Text, ohne im PDF zu landen.
  const istArbeitspapier = v.typ === "DIENSTVERTRAG" || v.typ === "UEBERLASSUNGSMITTEILUNG" || v.typ === "ZUSATZVEREINBARUNG";
  const empf = v.typ === "RAHMENVERTRAG" || v.typ === "UEBERLASSUNGSVERTRAG" ? (v.kunde ? mailFuer(v.kunde, "GESCHAEFTSFUEHRUNG") : "") : v.person?.email ?? "";
  return (
    <>
      <PageHeader crumbs={[{ href: "/vertraege", label: "Verträge" }, { label: v.nummer }]}
        title={<span className="flex items-center gap-3 flex-wrap">{titel(v.typ)} {v.nummer} {vertragStatusBadge(v.status)}</span>}
        sub={<span>{v.person && <Link href={`/personen/${v.personId}`} className="font-semibold text-ink hover:text-brand">{v.person.vorname} {v.person.nachname}</Link>}{v.person && v.kunde && " · "}{v.kunde && <Link href={`/kunden/${v.kundeId}`} className="font-semibold text-ink hover:text-brand">{v.kunde.firmenname}</Link>} · erstellt {datum(v.erstelltAm)}{v.versendetAm && ` · versendet ${datum(v.versendetAm)}`}{v.unterschriebenAm && ` · unterschrieben ${datum(v.unterschriebenAm)}`}</span>}
        actions={<a href={`/vertraege/${id}/pdf`} target="_blank" className="btn btn-secondary"><FileDown size={15} /> PDF</a>} />
      {sp.gesendet && <div className={`alert ${sp.gesendet === "TEST" ? "alert-amber" : sp.gesendet === "FEHLER" ? "alert-red" : "alert-teal"} mb-4`}>{sp.gesendet === "TEST" ? "Testmodus: E-Mail protokolliert, nicht zugestellt (SMTP noch nicht konfiguriert)." : sp.gesendet === "FEHLER" ? "Versand fehlgeschlagen." : "Vertrag per E-Mail versendet."}</div>}
      {offen && v.status === "ENTWURF" && !istArbeitspapier && <div className="alert alert-amber mb-4">Im Text sind noch offene Platzhalter in eckigen Klammern – bitte vor dem Versand ergänzen.</div>}
      <div className="grid lg:grid-cols-[1fr_340px] gap-4">
        <Card title={istArbeitspapier ? "Inhalt" : "Vertragstext"} className="reveal">
          {istArbeitspapier ? (
            <div>
              <div className="alert alert-brand mb-3"><span><b>Dieses Papier wird direkt aus den Stammdaten erzeugt</b> – im Layout der Word-Vorlage, mit Ausfüllfeldern für alles, was die Software nicht weiß. Änderungen gehören in den Einsatz bzw. die Stammdaten (Person, Kunde, Firma) – ein hier bearbeiteter Text würde <u>nicht</u> im PDF landen, deshalb gibt es den Text-Editor für Arbeitspapiere nicht. Das fertige PDF: Knopf „PDF“ oben rechts.</span></div>
              <div className="prose-contract whitespace-pre-wrap text-[12.5px] text-muted">{v.inhalt ? v.inhalt.replace(/^# .*\n/, "").replace(/\*\*/g, "") : "–"}</div>
            </div>
          ) : v.status === "ENTWURF" ? (
            <form action={vertragSpeichern.bind(null, id)} className="space-y-3">
              <textarea name="inhalt" defaultValue={v.inhalt} rows={32} className="textarea font-mono text-[12.5px] leading-relaxed" />
              <div className="flex gap-2"><button className="btn btn-primary">Text speichern</button><span className="help self-center">Markdown-light: # Titel, ## Abschnitt, **fett**, Tabellen mit |</span></div>
            </form>
          ) : <div className="prose-contract whitespace-pre-wrap text-[14px]">{v.inhalt.replace(/^# .*\n/, "").replace(/\*\*/g, "")}</div>}
        </Card>
        <div className="space-y-4">
          {v.status !== "UNTERSCHRIEBEN" && (
            <Card title={<span className="flex items-center gap-2"><Send size={15} /> Zur Unterschrift senden</span>} className="reveal reveal-2">
              <form action={vertragVersenden.bind(null, id)} className="space-y-3">
                <Field label="Empfänger" required><input name="an" type="email" required defaultValue={empf} className="input" /></Field>
                <Field label="Nachricht (optional)"><textarea name="text" rows={3} className="textarea" /></Field>
                <button className="btn btn-primary w-full justify-center">PDF erzeugen & senden</button>
              </form>
            </Card>
          )}
          <Card title={<span className="flex items-center gap-2"><PenLine size={15} /> Unterschriebene Fassung ablegen</span>} className="reveal reveal-3">
            <form action={vertragUnterschrieben.bind(null, id)} className="space-y-3" encType="multipart/form-data">
              <Field label="Scan / Foto (PDF, JPG)"><input type="file" name="datei" className="input" accept=".pdf,image/*" /></Field>
              <button className="btn btn-secondary w-full justify-center">Als unterschrieben markieren</button>
              <p className="help">E-Signatur (z. B. Dropbox Sign / DocuSign) ist vorbereitet und kann später angebunden werden.</p>
            </form>
          </Card>
          {v.dokumente.length > 0 && <Card title="Abgelegte Dokumente" className="reveal reveal-4"><ul className="divide-y divide-line">{v.dokumente.map((d) => <li key={d.id} className="py-2 flex justify-between text-[12.5px]"><span>{d.dateiname}</span><a href={`/dokumente/${d.id}`} className="text-brand font-semibold">Öffnen</a></li>)}</ul></Card>}
          {s.rolle === "SYSTEMADMIN" && <Card title="Löschen (nur Systemadmin)" className="reveal reveal-4"><form action={vertragLoeschen.bind(null, id)}><button className="btn btn-ghost btn-sm w-full justify-center text-red">Vertrag endgültig löschen</button></form><p className="help mt-2">Abgelegte PDFs bleiben bei Mitarbeiter/Kunde unter Dokumente erhalten.</p></Card>}
          <Card title="Status" className="reveal reveal-4"><form action={vertragStatus.bind(null, id)} className="flex flex-wrap gap-2">{v.status !== "ENTWURF" && <button name="status" value="ENTWURF" className="btn btn-secondary btn-sm">Entwurf</button>}{v.status !== "BEENDET" && <button name="status" value="BEENDET" className="btn btn-secondary btn-sm">Beendet</button>}</form></Card>
        </div>
      </div>
    </>
  );
}
