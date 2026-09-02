import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LoginShell } from "@/components/login-shell";
import { TotpForm } from "../form";

export default async function TotpPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!s.totpPending) redirect("/");
  return <LoginShell><TotpForm /></LoginShell>;
}
