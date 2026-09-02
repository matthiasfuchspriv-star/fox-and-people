"use server";
import { redirect } from "next/navigation";
import { login, verifyTotp } from "@/lib/auth";

export async function loginAction(_prev: { fehler?: string } | null, fd: FormData) {
  const email = String(fd.get("email") ?? "");
  const passwort = String(fd.get("passwort") ?? "");
  const r = await login(email, passwort);
  if (!r.ok) return { fehler: r.fehler };
  redirect(r.totp ? "/login/2fa" : "/");
}

export async function totpAction(_prev: { fehler?: string } | null, fd: FormData) {
  const ok = await verifyTotp(String(fd.get("code") ?? ""));
  if (!ok) return { fehler: "Code ungültig. Bitte erneut versuchen." };
  redirect("/");
}
