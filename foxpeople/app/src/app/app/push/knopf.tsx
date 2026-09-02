"use client";
import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { pushSchluessel, pushAnmelden, pushAbmelden } from "./actions";

const b64 = (s: string) => {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

/**
 * Ein-Klick-Anmeldung für Benachrichtigungen. Auf dem iPhone funktioniert das erst, wenn die App über
 * „Zum Home-Bildschirm“ installiert wurde – darauf weisen wir hin, statt einen Fehler zu zeigen.
 */
export function PushKnopf() {
  const [status, setStatus] = useState<"laden" | "aus" | "an" | "geht-nicht" | "abgelehnt" | "ios">("laden");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (typeof window === "undefined") return;
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) { setStatus(ios && !standalone ? "ios" : "geht-nicht"); return; }
      if (Notification.permission === "denied") { setStatus("abgelehnt"); return; }
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      const abo = await reg?.pushManager.getSubscription();
      setStatus(abo ? "an" : "aus");
    })();
  }, []);

  const anmelden = async () => {
    setBusy(true);
    try {
      const erlaubt = await Notification.requestPermission();
      if (erlaubt !== "granted") { setStatus("abgelehnt"); return; }
      const reg = await navigator.serviceWorker.ready;
      const key = await pushSchluessel();
      const abo = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) });
      const j = abo.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      await pushAnmelden({ endpoint: j.endpoint ?? abo.endpoint, p256dh: j.keys?.p256dh ?? "", auth: j.keys?.auth ?? "", geraet: navigator.userAgent.slice(0, 120) });
      setStatus("an");
    } catch { setStatus("geht-nicht"); } finally { setBusy(false); }
  };

  const abmelden = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const abo = await reg.pushManager.getSubscription();
      if (abo) { await pushAbmelden(abo.endpoint); await abo.unsubscribe(); }
      setStatus("aus");
    } finally { setBusy(false); }
  };

  if (status === "laden") return null;
  if (status === "ios") return <p className="text-[12.5px] text-muted">Für Benachrichtigungen die App einmal über „Teilen → Zum Home-Bildschirm“ installieren und von dort öffnen.</p>;
  if (status === "geht-nicht") return <p className="text-[12.5px] text-muted">Dein Browser unterstützt keine Benachrichtigungen.</p>;
  if (status === "abgelehnt") return <p className="text-[12.5px] text-muted">Benachrichtigungen sind im Browser blockiert. In den Einstellungen der Website wieder erlauben, dann hier neu laden.</p>;
  return status === "an"
    ? <button onClick={abmelden} disabled={busy} className="btn btn-secondary w-full justify-center"><BellOff size={16} /> Benachrichtigungen ausschalten</button>
    : <button onClick={anmelden} disabled={busy} className="btn btn-primary w-full justify-center"><Bell size={16} /> Benachrichtigungen einschalten</button>;
}
