const cache = new Map<number, Intl.NumberFormat>();

/** Turkish number format with a fixed number of decimals. */
export function nf(digits: number) {
  let f = cache.get(digits);
  if (!f) {
    f = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    cache.set(digits, f);
  }
  return f;
}

export const fmtRate = (v: number) => nf(4).format(v);
export const fmtMoney = (v: number) => nf(2).format(v);
/** 0.123 → "+12,30%". */
export const fmtPct = (v: number, digits = 2) => `${v >= 0 ? '+' : ''}${nf(digits).format(v * 100)}%`;
/** "2026-10-21" → "21.10.2026". */
export const fmtDate = (iso: string) => iso.split('-').reverse().join('.');
/** "2026-10-01" → "10.2026". */
export const fmtMonth = (iso: string) => `${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/** "21.10.2026 14:05" from a timestamp. */
export function fmtTime(ms: number) {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
