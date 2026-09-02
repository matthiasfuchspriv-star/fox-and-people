"use server";
import { redirect } from "next/navigation";
import { personFuerLogin, loginCodeSenden, loginCodePruefen, appSessionErstellen } from "@/lib/app-auth";
import { db } from "@/lib/db";
import { str } from "@/lib/format";
import { darfZugreifen, absenderIp, LIMITS } from "@/lib/bremse";

/** Schritt 1: E-Mail oder Telefon eingeben → 6-stelliger Code geht per E-Mail raus */
export async function codeAnfordern(fd: FormData) {
  const eingabe = str(fd.get("eingabe"));
  // Bremse gegen Massenanfragen: sonst sind 1000 Aufrufe 1000 E-Mails aus unserem Postfach
  const ip = await absenderIp();
  if (!(await darfZugreifen(`appcode:ip:${ip}`, LIMITS.appCodeIp))) redirect(`/app/login?fehler=zuoft`);
  const p = eingabe ? await personFuerLogin(eingabe) : null;
  if (p && !(await darfZugreifen(`appcode:p:${p.id}`, LIMITS.appCodePerson))) redirect(`/app/login?fehler=zuoft`);
  // Kein Hinweis, ob die Adresse existiert (Datenschutz) – Code-Schritt wird immer angezeigt
  if (!p) redirect(`/app/login?schritt=code&e=${encodeURIComponent(eingabe)}`);
  const r = await loginCodeSenden(p.id);
  // Ohne hinterlegte E-Mail kann kein Code zugestellt werden – dann hilft nur der Anruf im Büro
  if (r.keineMail) redirect(`/app/login?e=${encodeURIComponent(eingabe)}&fehler=keinemail`);
  redirect(`/app/login?schritt=code&e=${encodeURIComponent(eingabe)}&an=${encodeURIComponent(r.zugestelltAn ?? "")}${r.testCode ? `&test=${r.testCode}` : ""}`);
}

/** Schritt 2: Code prüfen → Session */
export async function codePruefen(fd: FormData) {
  const eingabe = str(fd.get("eingabe")); const code = str(fd.get("code"));
  // Auch das Prüfen wird gebremst – der Zähler am Code-Datensatz allein lässt sich durch
  // Neuanfordern zurücksetzen, die IP-Bremse nicht.
  const ip = await absenderIp();
  if (!(await darfZugreifen(`appcode:pruef:${ip}`, { anzahl: 30, fensterMinuten: 15 }))) redirect(`/app/login?schritt=code&e=${encodeURIComponent(eingabe)}&fehler=code`);
  const p = eingabe ? await personFuerLogin(eingabe) : null;
  if (!p || !(await loginCodePruefen(p.id, code))) redirect(`/app/login?schritt=code&e=${encodeURIComponent(eingabe)}&fehler=code`);
  await appSessionErstellen(p.id, `${p.vorname} ${p.nachname}`);
  await db.aktivitaet.create({ data: { typ: "STATUS", text: "Anmeldung in der Mitarbeiter-App", nutzerName: `${p.vorname} ${p.nachname}`, personId: p.id } });
  redirect("/app");
}
