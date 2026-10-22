// Fund picker helpers (no DOM): Turkish-aware search, type groups and the cumulative return curve.

/** Lower case without Turkish accents, so "para piyasasi" finds "PARA PİYASASI". */
export function normalizeTr(s) {
  return String(s ?? "")
    .toLocaleLowerCase("tr-TR")
    .replace(/[ıi̇]/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Short labels for the type filter. `match` is tested against the TEFAS type text. */
export const FUND_TYPES = [
  { id: "all", label: "Tümü" },
  { id: "pp", label: "Para piyasası", match: "para piyasasi" },
  { id: "debt", label: "Borçlanma", match: "borclanma" },
  { id: "equity", label: "Hisse", match: "hisse" },
  { id: "metal", label: "Altın / maden", match: "kiymetli maden" },
  { id: "participation", label: "Katılım", match: "katilim" },
  { id: "mixed", label: "Değişken / karma", match: ["degisken", "karma", "fon sepeti"] },
  { id: "free", label: "Serbest", match: "serbest" },
];

export function typeMatches(fund, typeId) {
  const t = FUND_TYPES.find((x) => x.id === typeId);
  if (!t || !t.match) return true;
  const type = normalizeTr(fund.type);
  return [].concat(t.match).some((m) => type.includes(m));
}

/** Search index: build once per list. */
export function indexFunds(funds) {
  return funds.map((f) => ({ fund: f, code: f.code.toLowerCase(), text: normalizeTr(`${f.code} ${f.name}`) }));
}

/**
 * Funds that contain every word of `query`, best first: exact code, code prefix, then by portfolio size.
 * An empty query lists the largest funds.
 */
export function searchFunds(index, query, { typeId = "all", limit = 60 } = {}) {
  const words = normalizeTr(query).split(/\s+/).filter(Boolean);
  const q = words.join(" ");
  const hits = [];
  for (const row of index) {
    if (!typeMatches(row.fund, typeId)) continue;
    if (words.length && !words.every((w) => row.text.includes(w))) continue;
    const rank = !q ? 2 : row.code === q ? 0 : row.code.startsWith(q) ? 1 : 2;
    hits.push({ row, rank });
  }
  hits.sort((a, b) => a.rank - b.rank || (b.row.fund.size ?? 0) - (a.row.fund.size ?? 0));
  return { total: hits.length, items: hits.slice(0, limit).map((h) => h.row.fund) };
}

/** Total return in % from the first price, for each price point. */
export function cumulativeCurve(points) {
  if (!points.length) return [];
  const base = points[0].price;
  return points.map((p) => ({ date: p.date, pct: (p.price / base - 1) * 100 }));
}

/** Return in % over the last `days` calendar days, or null when the history is shorter. */
export function returnOverDays(points, days) {
  if (points.length < 2) return null;
  const last = points.at(-1);
  const target = Date.parse(last.date) - days * 86_400_000;
  let start = null;
  for (const p of points) {
    if (Date.parse(p.date) <= target) start = p;
    else break;
  }
  if (!start) return null;
  return (last.price / start.price - 1) * 100;
}

/**
 * Total return curves of several funds on one date axis (the union of their price dates).
 * A fund without a price on a date gets null there; Chart.js can span the gap.
 */
export function alignCurves(histories) {
  const dates = [...new Set(histories.flatMap((h) => h.points.map((p) => p.date)))].sort();
  const series = histories.map((h) => {
    const byDate = new Map(cumulativeCurve(h.points).map((p) => [p.date, p.pct]));
    return dates.map((d) => byDate.get(d) ?? null);
  });
  return { dates, series };
}

/** Monthly returns of several funds on one month axis; `months` are YYYY-MM keys, newest last. */
export function alignMonths(histories) {
  const months = [...new Set(histories.flatMap((h) => h.months.map((m) => m.month)))].sort();
  const rows = histories.map((h) => {
    const byMonth = new Map(h.months.map((m) => [m.month, m]));
    return months.map((k) => byMonth.get(k) ?? null);
  });
  return { months, rows };
}

/** Summary numbers for one fund's 12-month history. */
export function fundSummary(history) {
  const pts = history.points;
  const last = pts.at(-1);
  const full = history.months.filter((m) => !m.partial);
  return {
    total: pts.length > 1 ? (last.price / pts[0].price - 1) * 100 : null,
    r3m: returnOverDays(pts, 91),
    r1m: returnOverDays(pts, 30),
    avgAnnual: full.length ? full.reduce((s, m) => s + m.annualized, 0) / full.length : null,
    first: pts[0] ?? null,
    last: last ?? null,
  };
}
