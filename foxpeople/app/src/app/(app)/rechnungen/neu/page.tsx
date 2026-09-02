import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession, istZentrale, tenantWhere } from "@/lib/auth";
import { db } from "@/lib/db";
import { firma as ladeFirma } from "@/lib/einstellungen";
import { PageHeader, Card, Field } from "@/components/ui";
import { freieRechnungAnlegen } from "../actions";
import { PersonSuche } from "@/components/person-suche";

export const dynamic = "force-dynamic";

/**
 * Freie Rechnung.
 *
 * Nicht jede Rechnung kommt aus der Monatsabrechnung: eine Direktvermittlung, eine Nachverrechnung,
 * eine Storno-Gutschrift, eine vereinbarte Pauschale. Bisher gab es dafür keinen Weg – solche
 * Rechnungen wären an der Software vorbei geschrieben worden, mit eigener Nummer, und der
 * Nummernkreis nach § 11 UStG hätte Löcher bekommen.
 */
export default async function FreieRechnung({ searchParams }: { searchParams: Promise<{ kundeId?: string; fehler?: string }> }) {
  const s = await requireSession();
  if (!istZentrale(s)) redirect("/?fehler=keine-berechtigung");
  const sp = await searchParams;
  const [kunden, f, kostenstellen] = await Promise.all([
    db.kunde.findMany({ where: { ...tenantWhere(s), status: "AKTIV" }, orderBy: { firmenname: "asc" }, select: { id: true, firmenname: true, zahlungszielTage: true, vermittlungProzent: true } }),
    ladeFirma(),
    db.kostenstelle.findMany({ where: { aktiv: true }, orderBy: [{ isZentrale: "desc" }, { name: "asc" }], select: { id: true, name: true } }),
  ]);
  const heute = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader title="Freie Rechnung" sub="Für alles, was nicht aus der Monatsabrechnung kommt – Direktvermittlung, Nachverrechnung, Pauschale. Nummer und Fälligkeit vergibt die Software wie bei jeder anderen Rechnung." crumbs={[{ href: "/rechnungen", label: "Rechnungen" }, { label: "Neu" }]} />
      {sp.fehler === "kunde" && <div className="alert alert-red mb-4">Bitte einen Kunden wählen.</div>}
      {sp.fehler === "positionen" && <div className="alert alert-red mb-4">Mindestens eine Position mit Bezeichnung und Betrag angeben.</div>}
      {sp.fehler === "person" && <div className="alert alert-red mb-4">Bitte den Mitarbeiter angeben, um den es geht – sonst landet der Erlös in keinem Deckungsbeitrag.</div>}
      {sp.fehler === "belegt" && <div className="alert alert-red mb-4"><span><b>Für diesen Mitarbeiter, diesen Kunden und diesen Monat gibt es bereits eine Abrechnungszeile.</b> Es kann pro Monat nur eine geben – sonst ließe sich der Umsatz später nicht mehr auseinanderhalten. Wähle einen anderen Leistungsmonat, oder trag das Honorar direkt in der Monatsabrechnung bei dieser Zeile ein. Die Rechnungsnummer wurde nicht verbraucht.</span></div>}

      <form action={freieRechnungAnlegen} className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card title="Rechnungsempfänger">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Kunde" required>
                <select name="kundeId" required defaultValue={sp.kundeId ?? ""} className="select"><option value="">– wählen –</option>{kunden.map((k) => <option key={k.id} value={k.id}>{k.firmenname}</option>)}</select>
              </Field>
              <Field label="Leistungszeitraum" help="Monat und Jahr, die auf der Rechnung stehen."><input type="month" name="leistung" defaultValue={heute.slice(0, 7)} className="input" /></Field>
              <Field label="Betrifft Mitarbeiter" required help="Namen eintippen – gesucht wird im gesamten Bestand, Mitarbeiter zuerst. Bei einer Direktvermittlung: wer vermittelt wurde. Ohne Zuordnung könnte der Erlös in keinem Deckungsbeitrag auftauchen – das Honorar wäre auf dem Konto, im DB1 aber unsichtbar.">
                <PersonSuche name="personId" pflicht />
              </Field>
              <Field label="Zahlungsziel (Tage)" help="Leer = wie beim Kunden hinterlegt."><input name="zahlungszielTage" className="input num" inputMode="numeric" placeholder="0 = sofort" /></Field>
              <Field label="Umsatz zählt zu Kostenstelle" help="Legt fest, welcher Kostenstelle Umsatz und Provision zugeordnet werden. Leer = die des Kunden.">
                <select name="kostenstelleId" className="select" defaultValue=""><option value="">– wie beim Kunden –</option>{kostenstellen.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select>
              </Field>
              <Field label="Art der Leistung" required help="Bestimmt den Provisionsschlüssel der Kostenstelle: Überlassung 20 %, Direktvermittlung 50 % (vom DB2).">
                <select name="art" className="select" defaultValue="UEBERLASSUNG">
                  <option value="UEBERLASSUNG">Überlassung / Nachverrechnung / Pauschale</option>
                  <option value="DIREKTVERMITTLUNG">Direktvermittlung (Honorar)</option>
                </select>
              </Field>
            </div>
          </Card>

          <Card title="Positionen" >
            <p className="help mb-3">Menge × Einzelpreis ergibt den Betrag – so, wie es § 11 UStG für eine in sich stimmige Rechnung verlangt. Für eine Pauschale: Menge 1, Einheit „pauschal“.</p>
            <table className="table">
              <thead><tr><th>Bezeichnung</th><th className="r">Menge</th><th>Einheit</th><th className="r">Einzelpreis €</th></tr></thead>
              <tbody>
                {Array.from({ length: 6 }, (_, i) => (
                  <tr key={i}>
                    <td><input name={`bez_${i}`} className="input" placeholder={i === 0 ? "z. B. Vermittlungshonorar Herr Muster" : ""} /></td>
                    <td className="r"><input name={`menge_${i}`} className="input num !w-20 !py-1.5 text-right" inputMode="decimal" placeholder={i === 0 ? "1" : ""} /></td>
                    <td><input name={`einheit_${i}`} className="input !w-28 !py-1.5" placeholder={i === 0 ? "pauschal" : ""} /></td>
                    <td className="r"><input name={`preis_${i}`} className="input num !w-28 !py-1.5 text-right" inputMode="decimal" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Hinweise">
            <Field label="Vermerk zur Rechnung" help="Landet in der Notiz der Rechnung – z. B. der Bezug auf Angebot oder Vereinbarung."><textarea name="kopftext" rows={4} className="textarea" placeholder="Direktvermittlung Herr Muster, Vereinbarung vom …" /></Field>
            <p className="help mt-3">Umsatzsteuer {f.ustProzent} % wird automatisch gerechnet. Die Rechnung entsteht als <b>Entwurf</b> – Nummer, PDF und Versand wie bei jeder anderen.</p>
            <p className="help mt-2">Der Nettobetrag geht als abgerechnete Zeile in die Monatsabrechnung und damit in den <b>DB1</b>. Ein Honorar hat keine Lohnkosten – der Deckungsbeitrag entspricht dem Nettobetrag.</p>
          </Card>
          <div className="flex gap-2">
            <button className="btn btn-primary flex-1 justify-center">Rechnung erzeugen</button>
            <Link href="/rechnungen" className="btn btn-secondary">Abbrechen</Link>
          </div>
        </div>
      </form>
    </>
  );
}
