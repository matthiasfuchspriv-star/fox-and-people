export const eur = (n: number | null | undefined, digits = 2) =>
  n == null || Number.isNaN(n) ? "–" : new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
export const num = (n: number | null | undefined, digits = 2) =>
  n == null || Number.isNaN(n) ? "–" : new Intl.NumberFormat("de-AT", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
export const pct = (n: number | null | undefined, digits = 1) =>
  n == null || Number.isNaN(n) ? "–" : new Intl.NumberFormat("de-AT", { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
export const datum = (d: Date | string | null | undefined) =>
  d ? new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d)) : "–";
export const datumLang = (d: Date | string | null | undefined) =>
  d ? new Intl.DateTimeFormat("de-AT", { day: "numeric", month: "long", year: "numeric" }).format(new Date(d)) : "–";
export const MONATE = ["Jän", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
export const MONATE_LANG = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
export const isoDate = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");
export const parseDate = (s: FormDataEntryValue | null | undefined) => {
  const v = typeof s === "string" ? s.trim() : "";
  return v ? new Date(v) : null;
};
export const parseNum = (s: FormDataEntryValue | null | undefined) => {
  // Deutsch (1.234,56) und Englisch/HTML-Number-Input (38.5) akzeptieren: Punkt ist nur Tausendertrenner, wenn ein Komma folgt oder genau 3 Ziffern nach dem Punkt stehen
  let v = typeof s === "string" ? s.trim() : "";
  if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, "");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
export const str = (s: FormDataEntryValue | null | undefined) => (typeof s === "string" ? s.trim() : "");
export const strOrNull = (s: FormDataEntryValue | null | undefined) => str(s) || null;
