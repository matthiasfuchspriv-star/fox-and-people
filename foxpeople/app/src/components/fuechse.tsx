/** Bewertung als Fuchsköpfe (1–5) statt Sterne – einheitlich in Listen, Profil, Kundenvorschlag.
 *  Eigene Glyphe statt Emoji: sieht auf Mac, Windows, Android und in PDFs gleich aus. */
function Fuchs({ voll, px }: { voll: boolean; px: number }) {
  return (
    <svg width={px} height={px} viewBox="0 0 24 24" aria-hidden className={voll ? "text-fox" : "text-ink/20"}>
      <path d="M12 4.2 15.1 7.6 20 5.8l-1.4 6.6c0 4.3-2.9 7.4-6.6 7.4s-6.6-3.1-6.6-7.4L4 5.8l4.9 1.8Z" fill={voll ? "currentColor" : "none"} stroke="currentColor" strokeWidth={voll ? 0 : 1.6} strokeLinejoin="round" />
      {voll && <><circle cx="9.6" cy="12.2" r="1" fill="#fff" opacity=".9" /><circle cx="14.4" cy="12.2" r="1" fill="#fff" opacity=".9" /></>}
    </svg>
  );
}

export function Fuechse({ n, max = 5, size = "text-[14px]", zahl }: { n: number | null | undefined; max?: number; size?: string; zahl?: boolean }) {
  if (n == null) return <span className="text-muted">–</span>;
  const voll = Math.round(n);
  // Die bisherigen Aufrufer geben eine Tailwind-Textgröße mit; daraus wird die Glyphengröße abgeleitet
  const px = Number(size.match(/\d+/)?.[0] ?? 14) + 2;
  return (
    <span className="inline-flex items-center gap-px leading-none whitespace-nowrap" title={`${n.toFixed(1)} von ${max} Füchsen`} aria-label={`${n.toFixed(1)} von ${max}`}>
      {Array.from({ length: max }, (_, i) => <Fuchs key={i} voll={i < voll} px={px} />)}
      {zahl && <span className="ml-1.5 text-[12.5px] text-muted num">{n.toFixed(1)}</span>}
    </span>
  );
}
