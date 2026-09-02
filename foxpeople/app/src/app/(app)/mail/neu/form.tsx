"use client";
import { useState } from "react";

/** Betreff/Text mit Textbausteinen – Client, damit ein Vorlagenwechsel das Formular sofort befüllt. */
export function MailForm({ vorlagen, start, signatur }: { vorlagen: { key: string; label: string; betreff: string; text: string }[]; start: string; signatur: string }) {
  const s0 = vorlagen.find((v) => v.key === start) ?? vorlagen[0];
  const [betreff, setBetreff] = useState(s0.betreff);
  const [text, setText] = useState(s0.text);
  return (
    <>
      <div className="field"><label className="label">Textbaustein</label><select name="vorlage" className="select" defaultValue={s0.key} onChange={(e) => { const v = vorlagen.find((x) => x.key === e.target.value); if (v) { setBetreff(v.betreff); setText(v.text); } }}>{vorlagen.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}</select></div>
      <div className="field"><label className="label">Betreff <span className="text-red">*</span></label><input name="betreff" required value={betreff} onChange={(e) => setBetreff(e.target.value)} className="input" /></div>
      <div className="field"><label className="label">Text <span className="text-red">*</span></label><textarea name="text" required value={text} onChange={(e) => setText(e.target.value)} rows={14} className="textarea" /><div className="mt-2 text-[12.5px] text-muted whitespace-pre-line border-l-2 border-line pl-3">{signatur}</div></div>
    </>
  );
}
