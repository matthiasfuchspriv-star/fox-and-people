"use server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { str, strOrNull } from "@/lib/format";
import { werberZuCode } from "@/lib/werbelink";
import { pushAn, PUSH_TEXTE } from "@/lib/push";
import { darfZugreifen, absenderIp, LIMITS } from "@/lib/bremse";

/**
 * Kurzbewerbung ohne Login – aus dem persönlichen Empfehlungs-Link oder dem allgemeinen QR-Code.
 * Legt einen Bewerber im Pool an (Recruiting-Stufe NEU) und, wenn ein Werbercode dabei war, gleich die
 * Empfehlung mit Zuordnung zum Werber. Die Dispo bekommt eine Wiedervorlage, der Werber eine Nachricht.
 */
export async function bewerbungAbsenden(fd: FormData) {
  const code = str(fd.get("code"));
  const zurueck = code ? `/w/${code}` : "/bewerben";
  const name = str(fd.get("name"));
  const telefon = str(fd.get("telefon"));
  if (!name || !telefon) redirect(`${zurueck}?fehler=pflicht`);
  if (fd.get("einverstanden") !== "on") redirect(`${zurueck}?fehler=einverstanden`);

  // Bremse: das Formular ist ohne Anmeldung erreichbar und legt Personen samt Aufgabe an
  const ip = await absenderIp();
  if (!(await darfZugreifen(`bewerbung:ip:${ip}`, LIMITS.bewerbungIp))) redirect(`${zurueck}?fehler=zuoft`);

  // Doppelte Bewerbung derselben Nummer: nicht nochmal anlegen, sonst füllt ein Doppelklick oder ein
  // Skript den Pool. Verglichen werden die letzten sieben Ziffern – damit ist die Schreibweise egal.
  const ziffern = telefon.replace(/[^\d]/g, "");
  const endung = ziffern.slice(-7);
  const doppelt = endung.length === 7
    ? await db.person.findFirst({
        where: { telefon: { endsWith: endung }, erstelltAm: { gte: new Date(Date.now() - 90 * 86400000) } },
        select: { id: true },
      })
    : null;
  if (doppelt) {
    await db.aktivitaet.create({ data: { typ: "STATUS", text: "Kurzbewerbung erneut abgeschickt (gleiche Telefonnummer innerhalb von 90 Tagen)", nutzerName: "Website", personId: doppelt.id } });
    // Kam die Dublette über einen Empfehlungslink, erfährt der Werber davon – sonst verliert er
    // seine Prämienzuordnung, ohne es je zu merken, und fragt irgendwann verärgert nach.
    if (code) {
      const werberDoppelt = await werberZuCode(code);
      if (werberDoppelt) await db.nachricht.create({ data: { personId: werberDoppelt.id, vonMitarbeiter: false, nutzerName: "Fox & People", text: "Über deinen Empfehlungs-Link ist eine Bewerbung eingegangen, die Person ist bei uns aber schon gemeldet (Bewerbung innerhalb der letzten 90 Tage). Eine Prämie ist dafür leider nicht möglich – melde dich bei Fragen gern bei uns." } }).catch(() => undefined);
    }
    redirect(`${zurueck}?ok=1`);
  }

  const werber = code ? await werberZuCode(code) : null;
  // Ohne Werber landet die Bewerbung in der Zentrale, mit Werber in dessen Kostenstelle
  const zentrale = await db.kostenstelle.findFirst({ where: { isZentrale: true }, select: { id: true } });
  const kostenstelleId = werber?.kostenstelleId ?? zentrale?.id;
  if (!kostenstelleId) redirect(`${zurueck}?fehler=pflicht`);

  const teile = name.trim().split(/\s+/);
  const nachname = teile.length > 1 ? teile.slice(1).join(" ") : teile[0];
  const vorname = teile.length > 1 ? teile[0] : "";
  const quelle = werber ? `Empfehlung ${werber.vorname} ${werber.nachname}` : (strOrNull(fd.get("quelle")) ?? "Kurzbewerbung (QR-Code)");
  const verf = str(fd.get("verfuegbar"));
  const verfuegbarAb = verf === "2wochen" ? new Date(Date.now() + 14 * 86400000)
    : verf === "1monat" ? new Date(Date.now() + 30 * 86400000)
    : verf === "spaeter" ? new Date(Date.now() + 90 * 86400000) : null;

  const notiz = [strOrNull(fd.get("notiz")), strOrNull(fd.get("email")) ? null : "keine E-Mail angegeben"].filter(Boolean).join(" · ") || null;
  const p = await db.person.create({
    data: {
      kostenstelleId, status: "SUCHT",
      vorname, nachname,
      telefon, email: strOrNull(fd.get("email")),
      standardrolle: strOrNull(fd.get("rolle")),
      verfuegbarSofort: verf === "sofort", verfuegbarAb,
      quelle, pipelineStufe: "NEU", pipelineAm: new Date(),
      notizen: notiz,
      importQuelle: werber ? "WERBELINK" : "KURZBEWERBUNG",
    },
  });

  const titel = werber
    ? `Empfehlung von ${werber.vorname} ${werber.nachname}: ${name} (${telefon}) anrufen`
    : `Neue Kurzbewerbung: ${name} (${telefon}) anrufen`;
  await db.aufgabe.upsert({
    where: { typ_referenzTyp_referenzId: { typ: "MANUELL", referenzTyp: "Person", referenzId: p.id } },
    update: { titel, erledigt: false },
    create: { kostenstelleId, typ: "MANUELL", titel, faelligAm: new Date(Date.now() + 2 * 86400000), personId: p.id, referenzTyp: "Person", referenzId: p.id },
  });
  await db.aktivitaet.create({ data: { typ: "STATUS", text: `Bewerbung über ${werber ? `den Empfehlungs-Link von ${werber.vorname} ${werber.nachname}` : "die Kurzbewerbung (QR-Code)"} eingegangen`, nutzerName: "Website", personId: p.id } });

  if (werber) {
    await db.empfehlung.create({
      data: { werberId: werber.id, name, telefon, email: strOrNull(fd.get("email")), notiz: strOrNull(fd.get("notiz")), status: "NEU", empfohlenePersonId: p.id, ueberLink: true },
    });
    await db.nachricht.create({ data: { personId: werber.id, vonMitarbeiter: false, nutzerName: "Fox & People", text: `${name} hat sich über deinen Link beworben – danke! Wir melden uns dort innerhalb von zwei Werktagen. Den Stand siehst du unter „Freunde werben Freunde“.` } });
    await pushAn(werber.id, { anlass: "ERINNERUNG", titel: "Deine Empfehlung ist da", text: `${name} hat sich über deinen Link beworben. Danke!`, url: "/app/empfehlen" }).catch(() => undefined);
  }

  // Benachrichtigung ins Büro: Eine Wiedervorlage sieht nur, wer die Software offen hat.
  // Eine Bewerbung, die zwei Tage liegen bleibt, ist in dieser Branche meist verloren.
  try {
    const { sendeMail } = await import("@/lib/mail");
    const { firma } = await import("@/lib/einstellungen");
    const f = await firma();
    if (f.email) {
      await sendeMail({
        an: f.email,
        betreff: werber ? `Empfehlung von ${werber.vorname} ${werber.nachname}: ${name}` : `Neue Kurzbewerbung: ${name}`,
        text: [
          werber ? `${werber.vorname} ${werber.nachname} hat ${name} empfohlen.` : `Über den QR-Code hat sich ${name} beworben.`,
          "",
          `Telefon: ${telefon}`,
          strOrNull(fd.get("email")) ? `E-Mail: ${str(fd.get("email"))}` : "E-Mail: keine angegeben",
          strOrNull(fd.get("rolle")) ? `Gesucht: ${str(fd.get("rolle"))}` : null,
          `Verfügbar: ${verf === "sofort" ? "sofort" : verf || "keine Angabe"}`,
          quelle ? `Quelle: ${quelle}` : null,
          "",
          "Im Programm liegt dazu eine Wiedervorlage – bitte innerhalb von zwei Werktagen anrufen.",
        ].filter(Boolean).join("\n"),
        referenzTyp: "Person", referenzId: p.id,
      });
    }
  } catch { /* Der Bewerber darf nie eine Fehlerseite sehen, weil unser Postfach klemmt */ }

  redirect(`${zurueck}?ok=1`);
}
