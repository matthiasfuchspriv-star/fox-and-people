/** Bewertung als Fuchsköpfe (1–5) statt Sterne – einheitlich in Listen, Profil, Kundenvorschlag. */
export function Fuechse({ n, max = 5, size = "text-[14px]", zahl }: { n: number | null | undefined; max?: number; size?: string; zahl?: boolean }) {
  if (n == null) return <span className="text-muted">–</span>;
  const voll = Math.round(n);
  return (
    <span className={`inline-flex items-center gap-0.5 ${size} leading-none whitespace-nowrap`} title={`${n.toFixed(1)} von ${max} Füchsen`} aria-label={`${n.toFixed(1)} von ${max}`}>
      {Array.from({ length: max }, (_, i) => <span key={i} className={i < voll ? "" : "opacity-20 grayscale"}>🦊</span>)}
      {zahl && <span className="ml-1 text-[12px] text-muted num">{n.toFixed(1)}</span>}
    </span>
  );
}
