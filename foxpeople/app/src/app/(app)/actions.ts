"use server";
import { redirect } from "next/navigation";
import { requireSession, createSession, istZentrale } from "@/lib/auth";

export async function wechsleKostenstelle(fd: FormData) {
  const s = await requireSession();
  if (!istZentrale(s)) return;
  const id = String(fd.get("kostenstelleId") ?? "") || null;
  await createSession({ ...s, aktiveKostenstelleId: id });
  redirect("/");
}
