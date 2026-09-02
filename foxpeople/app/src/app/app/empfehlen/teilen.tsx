"use client";
import { useState } from "react";
import { Share2, Copy, Check, MessageCircle } from "lucide-react";

/**
 * Teilen-Knöpfe für den persönlichen Empfehlungs-Link. Auf dem Handy öffnet „Teilen“ das native Menü
 * (WhatsApp, SMS, Signal); daneben ein direkter WhatsApp-Link und „Link kopieren“ als Rückfallebene.
 */
export function TeilenKnoepfe({ url, text }: { url: string; text: string }) {
  const [kopiert, setKopiert] = useState(false);

  const teilen = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: "Job bei Fox & People", text, url }); return; }
    } catch { /* Nutzer hat abgebrochen – kein Fehler */ }
    kopieren();
  };

  const kopieren = async () => {
    try { await navigator.clipboard.writeText(`${text}`); setKopiert(true); setTimeout(() => setKopiert(false), 2500); }
    catch { window.prompt("Link kopieren:", url); }
  };

  return (
    <div className="space-y-2">
      <button onClick={teilen} className="btn btn-primary w-full justify-center !h-12 !text-[15px]"><Share2 size={17} /> Link teilen</button>
      <div className="grid grid-cols-2 gap-2">
        <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener" className="btn btn-secondary justify-center"><MessageCircle size={16} /> WhatsApp</a>
        <button onClick={kopieren} className="btn btn-secondary justify-center">{kopiert ? <><Check size={16} /> Kopiert</> : <><Copy size={16} /> Kopieren</>}</button>
      </div>
      <div className="text-[12px] text-muted break-all bg-surface-2 rounded-md px-3 py-2">{url}</div>
    </div>
  );
}
