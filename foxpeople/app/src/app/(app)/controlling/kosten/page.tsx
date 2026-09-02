import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession, istZentrale } from "@/lib/auth";
import { db } from "@/lib/db";
import { eur, MONATE_LANG } from "@/lib/format";
import { PageHeader, Card, Field, Empty, Badge } from "@/components/ui";
import { kostenJahr, KOSTENKATEGORIEN } from "@/lib/kosten";
import { kostenSpeichern, kostenLoeschen, fixkostenWeiter } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Kosten je Monat erfassen – die Grundlage der Umlage, die vom DB1 abgezogen wird.
 * Bewusst eine eigene Seite: Auf dem Controlling-Dashboard war dafür nur ein einziges Feld
 * „Gesamtkosten“, und eine Zahl ohne Herkunft kann niemand prüfen.
 */
export default async function KostenSeite({ searchParams }: { searchParams: Promise<{ jahr?: string; monat?: string; edit?: string; ok?: string; fehler?: string; uebernommen?: string }> }) {
  const s = await requireSession();
  if (!istZentrale(s)) redirect("/controlling?fehler=berechtigung");
  const sp = await searchParams;
  const heute = new Date();
  const jahr = Number(sp.jahr) || heute.getFullYear();
  const monat = Math.min(12, Math.max(1, Number(sp.monat) || heute.getMonth() + 1));

  const [positionen, jahresbild] = await Promise.all([
    db.kostenposition.findMany({ where: { jahr, monat, kostenstelleId: "" }, orderBy: [{ fix: "desc" }, { kategorie: "asc" }, { bezeichnung: "asc" }] }),
    kostenJahr(jahr),
  ]);
  const edit = positionen.find((p) => p.id === sp.edit);
  const m = jahresbild.monate[monat - 1];
  const q = (j: number, mo: number) => `/controlling/kosten?jahr=${j}&monat=${mo}`;

  return (
    <>
      <PageHeader title="Kosten" sub="Was monatlich anfällt – getrennt nach Fixkosten und variablen Kosten. Die Summe ist die Basis der Umlage, die im Controlling vom DB1 abgezogen wird."
        crumbs={[{ href: "/controlling", label: "Controlling" }, { label: "Kosten" }]} />

      {sp.ok && <div className="alert alert-teal mb-4">Gespeichert.</div>}
      {sp.fehler === "pflicht" && <div className="alert alert-red mb-4">Bezeichnung und Betrag sind nötig.</div>}
      {sp.uebernommen && <div className={`alert ${Number(sp.uebernommen) > 0 ? "alert-teal" : "alert-amber"} mb-4`}>{Number(sp.uebernommen) > 0 ? `${sp.uebernommen} Fixkosten übernommen.` : "Nichts zu übernehmen – die Fixkosten stehen im Folgemonat bereits."}</div>}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <div className="kpi reveal"><div className="label">Fixkosten {MONATE_LANG[monat - 1]}</div><div className="value">{eur(m.fix, 0)}</div><div className="sub">jeden Monat gleich</div></div>
        <div className="kpi reveal reveal-2"><div className="label">Variable Kosten</div><div className="value">{eur(m.variabel, 0)}</div><div className="sub">nur dieser Monat</div></div>
        <div className="kpi reveal reveal-3"><div className="label">Summe {MONATE_LANG[monat - 1]}</div><div className="value">{eur(m.summe, 0)}</div></div>
        <div className="kpi reveal reveal-4"><div className="label">Jahr {jahr}</div><div className="value">{eur(jahresbild.summeJahr, 0)}</div><div className="sub">{eur(jahresbild.fixJahr, 0)} fix · {eur(jahresbild.variabelJahr, 0)} variabel</div></div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4 reveal">
        <div className="flex items-center gap-1 bg-surface border border-line rounded-xl p-1">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((mo) => (
            <Link key={mo} href={q(jahr, mo)} className={`px-2 py-1 rounded-lg text-[12.5px] ${mo === monat ? "bg-brand-soft text-brand font-bold" : "hover:bg-surface-2"}`}>{MONATE_LANG[mo - 1].slice(0, 3)}</Link>
          ))}
        </div>
        <Link href={q(jahr - 1, monat)} className="btn btn-ghost btn-sm">{jahr - 1}</Link>
        <span className="font-display font-bold px-1">{jahr}</span>
        <Link href={q(jahr + 1, monat)} className="btn btn-ghost btn-sm">{jahr + 1}</Link>
        <form action={fixkostenWeiter.bind(null, jahr, monat)} className="ml-auto">
          <button className="btn btn-secondary btn-sm">Fixkosten in den Folgemonat übernehmen</button>
        </form>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card title={`Kosten ${MONATE_LANG[monat - 1]} ${jahr}`} pad={false} className="lg:col-span-2 reveal">
          {positionen.length ? (
            <table className="table">
              <thead><tr><th>Bezeichnung</th><th>Kategorie</th><th>Art</th><th className="r">Betrag</th><th></th></tr></thead>
              <tbody>
                {positionen.map((p) => (
                  <tr key={p.id}>
                    <td className="font-semibold">{p.bezeichnung}{p.notiz && <div className="text-[12.5px] text-muted font-normal">{p.notiz}</div>}</td>
                    <td className="text-[12.5px]">{p.kategorie}</td>
                    <td>{p.fix ? <Badge tone="brand">fix</Badge> : <Badge tone="amber">variabel</Badge>}</td>
                    <td className="r num font-semibold">{eur(p.betrag)}</td>
                    <td className="r whitespace-nowrap">
                      <Link href={`${q(jahr, monat)}&edit=${p.id}`} className="btn btn-ghost btn-sm">Bearbeiten</Link>
                      <form action={kostenLoeschen.bind(null, p.id, jahr, monat)} className="inline"><button className="btn btn-ghost btn-sm text-red">Entfernen</button></form>
                    </td>
                  </tr>
                ))}
                <tr className="font-bold"><td colSpan={3}>Summe</td><td className="r num">{eur(m.summe)}</td><td /></tr>
              </tbody>
            </table>
          ) : <Empty title="Noch keine Kosten erfasst" text="Trag ein, was in diesem Monat angefallen ist. Fixkosten übernimmst du danach mit einem Klick in den Folgemonat." />}
        </Card>

        <div className="space-y-4">
          <Card title={edit ? "Position bearbeiten" : "Position hinzufügen"} className="reveal reveal-2">
            <form action={kostenSpeichern} className="space-y-3">
              {edit && <input type="hidden" name="id" value={edit.id} />}
              <input type="hidden" name="jahr" value={jahr} />
              <input type="hidden" name="monat" value={monat} />
              <Field label="Bezeichnung" required><input name="bezeichnung" required defaultValue={edit?.bezeichnung ?? ""} className="input" placeholder="z. B. Miete Büro Kilb" /></Field>
              <Field label="Kategorie"><select name="kategorie" defaultValue={edit?.kategorie ?? "Sonstiges"} className="select">{KOSTENKATEGORIEN.map((k) => <option key={k}>{k}</option>)}</select></Field>
              <Field label="Betrag €"><input name="betrag" defaultValue={edit?.betrag ?? ""} className="input num" inputMode="decimal" /></Field>
              <Field label="Art" help="Fixkosten werden auf Knopfdruck in den Folgemonat übernommen, variable nicht.">
                <select name="fix" defaultValue={edit && !edit.fix ? "variabel" : "fix"} className="select"><option value="fix">Fixkosten</option><option value="variabel">Variable Kosten</option></select>
              </Field>
              <Field label="Notiz"><input name="notiz" defaultValue={edit?.notiz ?? ""} className="input" /></Field>
              <div className="flex gap-2"><button className="btn btn-primary flex-1 justify-center">{edit ? "Speichern" : "Hinzufügen"}</button>{edit && <Link href={q(jahr, monat)} className="btn btn-secondary">Neu</Link>}</div>
            </form>
          </Card>

          <Card title={`Jahr ${jahr} nach Kategorie`} pad={false} className="reveal reveal-3">
            {jahresbild.jeKategorie.length ? (
              <table className="table"><tbody>
                {jahresbild.jeKategorie.map((k) => (
                  <tr key={k.kategorie}><td>{k.kategorie}</td><td className="r num">{eur(k.betrag, 0)}</td><td className="r text-[12.5px] text-muted">{jahresbild.summeJahr ? Math.round((k.betrag / jahresbild.summeJahr) * 100) : 0} %</td></tr>
                ))}
                <tr className="font-bold"><td>Summe</td><td className="r num">{eur(jahresbild.summeJahr, 0)}</td><td /></tr>
              </tbody></table>
            ) : <p className="p-5 text-[12.5px] text-muted">Noch nichts erfasst.</p>}
          </Card>

          <Card title="Monatsverlauf" pad={false} className="reveal reveal-4">
            <table className="table text-[12.5px]">
              <thead><tr><th>Monat</th><th className="r">fix</th><th className="r">variabel</th><th className="r">Summe</th></tr></thead>
              <tbody>{jahresbild.monate.map((x) => (
                <tr key={x.monat} className={x.monat === monat ? "bg-brand-soft" : ""}>
                  <td><Link href={q(jahr, x.monat)} className="row-link">{MONATE_LANG[x.monat - 1]}</Link></td>
                  <td className="r num">{x.fix ? eur(x.fix, 0) : "–"}</td>
                  <td className="r num">{x.variabel ? eur(x.variabel, 0) : "–"}</td>
                  <td className="r num font-semibold">{x.summe ? eur(x.summe, 0) : "–"}</td>
                </tr>
              ))}</tbody>
            </table>
          </Card>
        </div>
      </div>
    </>
  );
}
