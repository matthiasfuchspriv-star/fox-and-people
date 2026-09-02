"use client";
import { useState, useTransition } from "react";
import { totpEinrichten } from "./actions";

export function TotpSetup({ aktivieren }: { aktivieren: (fd: FormData) => Promise<void> }) {
  const [data, setData] = useState<{ secret: string; qr: string } | null>(null);
  const [pending, start] = useTransition();
  if (!data) return <div><p className="text-[14px] mb-3">Schütze deinen Zugang zusätzlich mit einem Einmalcode (Google Authenticator, Microsoft Authenticator, 1Password …).</p><button className="btn btn-primary" disabled={pending} onClick={() => start(async () => setData(await totpEinrichten()))}>{pending ? "…" : "2FA einrichten"}</button></div>;
  return (
    <form action={aktivieren} className="space-y-3">
      <p className="text-[14px]">1. QR-Code in der Authenticator-App scannen (oder Schlüssel manuell eingeben):</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={data.qr} alt="QR-Code" width={180} height={180} className="rounded-xl border border-line" />
      <code className="block text-[12.5px] bg-surface-2 rounded-lg p-2 break-all">{data.secret}</code>
      <p className="text-[14px]">2. Code aus der App eingeben:</p>
      <input name="code" inputMode="numeric" required className="input num text-center text-xl tracking-[0.3em] !w-48" maxLength={7} />
      <div><button className="btn btn-primary">2FA aktivieren</button></div>
    </form>
  );
}
