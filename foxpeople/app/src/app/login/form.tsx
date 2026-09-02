"use client";
import { useActionState } from "react";
import { loginAction, totpAction } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action} className="space-y-4 reveal">
      <div>
        <h2 className="font-display text-2xl font-extrabold tracking-tight">Anmelden</h2>
        <p className="text-muted text-[14px] mt-1">Mit deinem Kostenstellen-Zugang.</p>
      </div>
      {state?.fehler && <div className="alert alert-red">{state.fehler}</div>}
      <div className="field"><label className="label">E-Mail</label><input name="email" type="email" autoComplete="username" required className="input" placeholder="name@foxandpeople.at" /></div>
      <div className="field"><label className="label">Passwort</label><input name="passwort" type="password" autoComplete="current-password" required className="input" /></div>
      <button className="btn btn-primary w-full justify-center" disabled={pending}>{pending ? "Anmelden…" : "Anmelden"}</button>
      <p className="text-[12.5px] text-muted text-center">Verschlüsselte Verbindung · Zugriffe werden protokolliert</p>
    </form>
  );
}

export function TotpForm() {
  const [state, action, pending] = useActionState(totpAction, null);
  return (
    <form action={action} className="space-y-4 reveal">
      <div>
        <h2 className="font-display text-2xl font-extrabold tracking-tight">Zwei-Faktor-Code</h2>
        <p className="text-muted text-[14px] mt-1">Bitte den 6-stelligen Code aus deiner Authenticator-App eingeben.</p>
      </div>
      {state?.fehler && <div className="alert alert-red">{state.fehler}</div>}
      <input name="code" inputMode="numeric" autoComplete="one-time-code" required className="input text-center text-2xl tracking-[0.4em] num" maxLength={7} autoFocus />
      <button className="btn btn-primary w-full justify-center" disabled={pending}>Bestätigen</button>
    </form>
  );
}
