"use client";
import { useState, useTransition, useRef, useEffect } from "react";
import { Send, Sparkles, BookOpen } from "lucide-react";
import { frageStellen } from "./actions";

type Msg = { rolle: "user" | "assistant"; text: string; quellen?: { titel: string; text: string; kategorie: string }[]; modus?: string };

function md(t: string) {
  // sehr leichte Markdown-Darstellung: **fett**, Zeilen, Listen
  const esc = t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return esc.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/^### (.*)$/gm, "<h4 class='font-bold mt-2'>$1</h4>").replace(/^## (.*)$/gm, "<h3 class='font-bold mt-3'>$1</h3>").replace(/^# (.*)$/gm, "<h2 class='font-display font-extrabold text-lg mt-2'>$1</h2>").replace(/^- (.*)$/gm, "<li class='ml-4 list-disc'>$1</li>").replace(/\n/g, "<br/>").replace(/<br\/>(<li)/g, "$1").replace(/(<\/li>)<br\/>/g, "$1");
}

export function Chat({ beispiele }: { beispiele: string[] }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [uid, setUid] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [msgs]);
  const senden = (f: string) => {
    if (!f.trim()) return;
    setMsgs((m) => [...m, { rolle: "user", text: f }]);
    setText("");
    start(async () => {
      const r = await frageStellen(uid, f);
      setUid(r.unterhaltungId);
      setMsgs((m) => [...m, { rolle: "assistant", text: r.fehler ? `Fehler: ${r.fehler}` : r.antwort, quellen: r.quellen, modus: r.modus }]);
    });
  };
  return (
    <div className="grid lg:grid-cols-[1fr_300px] gap-4">
      <section className="card flex flex-col min-h-[560px] reveal">
        <div className="flex-1 p-5 space-y-4 overflow-y-auto">
          {msgs.length === 0 && <div className="text-center py-10"><div className="mx-auto w-12 h-12 rounded-2xl bg-brand-soft text-brand flex items-center justify-center mb-3"><Sparkles size={20} /></div><h3 className="font-display font-bold">Frag mich etwas</h3><p className="text-muted text-[12.5px] max-w-md mx-auto mt-1">Arbeitsrecht, AÜG, Kollektivvertrag, Kalkulation, unsere Vorlagen – oder Fragen zu den aktuellen Zahlen.</p></div>}
          {msgs.map((m, i) => (
            <div key={i} className={`flex ${m.rolle === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-[14px] leading-relaxed ${m.rolle === "user" ? "bg-brand text-white" : "bg-surface-2 border border-line"}`}>
                <div dangerouslySetInnerHTML={{ __html: md(m.text) }} />
                {m.quellen && m.quellen.length > 0 && <details className="mt-2 text-[12.5px] text-muted"><summary className="cursor-pointer flex items-center gap-1"><BookOpen size={12} /> {m.quellen.length} Quellen</summary><ol className="mt-1 space-y-1 list-decimal ml-4">{m.quellen.map((q, j) => <li key={j}><b>{q.titel}</b> ({q.kategorie}): {q.text}…</li>)}</ol></details>}
                {m.modus === "extraktiv" && <div className="text-[11px] text-amber mt-1">extraktiver Modus</div>}
              </div>
            </div>
          ))}
          {pending && <div className="text-muted text-[12.5px] animate-pulse">Der Assistent denkt nach …</div>}
          <div ref={end} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); senden(text); }} className="border-t border-line p-3 flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Frage eingeben …" className="input flex-1" disabled={pending} />
          <button className="btn btn-primary" disabled={pending || !text.trim()}><Send size={15} /></button>
        </form>
      </section>
      <aside className="space-y-2 reveal reveal-2">
        <div className="section-title mb-2">Beispiele</div>
        {beispiele.map((b) => <button key={b} type="button" onClick={() => senden(b)} className="block w-full text-left card px-4 py-3 text-[12.5px] hover:border-brand/50 transition-colors">{b}</button>)}
      </aside>
    </div>
  );
}
