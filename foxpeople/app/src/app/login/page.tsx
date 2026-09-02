import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LoginForm } from "./form";
import { LoginShell } from "@/components/login-shell";

export const metadata = { title: "Anmelden" };

export default async function LoginPage() {
  const s = await getSession();
  if (s && !s.totpPending) redirect("/");
  return <LoginShell><LoginForm /></LoginShell>;
}

