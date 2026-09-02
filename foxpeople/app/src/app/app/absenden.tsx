"use client";
import { useFormStatus } from "react-dom";

/**
 * Absende-Knopf mit Ladezustand. Auf schlechtem Netz passierte nach dem Tippen sekundenlang sichtbar
 * nichts – also tippte man nochmal, und Urlaubsantrag, Chat-Nachricht oder Upload landeten doppelt
 * bei der Dispo. Der Knopf sperrt sich jetzt, solange gesendet wird, und sagt das auch.
 */
export function AbsendenKnopf({ label, laueft, klasse }: { label: string; laueft: string; klasse?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={klasse ?? "btn btn-primary w-full justify-center !h-12 disabled:opacity-60"}>
      {pending ? (
        <>
          <span className="inline-block h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />
          {laueft}
        </>
      ) : label}
    </button>
  );
}
