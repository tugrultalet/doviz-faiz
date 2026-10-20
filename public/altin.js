import { monthsBetween, periodReturn } from "./calc.js";

const $ = (id) => document.getElementById(id);
const nf = (digits) => new Intl.NumberFormat("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const fmtPct = (v, digits = 1) => `${v >= 0 ? "+" : ""}${nf(digits).format(v * 100)}%`;
const compact = new Intl.NumberFormat("tr-TR", { notation: "compact", compactDisplay: "long", maximumFractionDigits: 1 });
/** Very large rises read better as "N kat" (times) than as a percentage. */
const fmtGrowth = (v) => (v >= 99 ? `${compact.format(1 + v)} kat` : fmtPct(v));
/** Prices from the 1950s are fractions of a kuruş in today's TL: show significant digits, not 0,00. */
const fmtPrice = (v) => (v >= 10 ? nf(0).format(v) : v >= 0.01 ? nf(2).format(v) : v.toLocaleString("tr-TR", { maximumSignificantDigits: 2 }));
const fmtMonth = (iso) => `${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const PERIODS = [
  ["1 ay", 1],
  ["1 yıl", 12],
  ["5 yıl", 60],
  ["10 yıl", 120],
  ["20 yıl", 240],
];
const RANGES = [
  ["5 yıl", 60],
  ["10 yıl", 120],
  ["Tümü", Infinity],
];

let points = [];
let rangeMonths = Infinity;

async function load() {
  try {
    const res = await fetch("/api/gold");
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "Altın verisi alınamadı.");
    points = body.points;
    const first = points[0];
    const last = points.at(-1);
    $("source").textContent = `TCMB EVDS · ${fmtMonth(first.date)} – ${fmtMonth(last.date)} (${points.length} ay)`;
    renderCards();
    renderReturns();
    renderRange();
    renderCharts();
  } catch (err) {
    $("error").textContent = err.message;
    $("error").hidden = false;
  }
}

const lastOf = (field) => [...points].reverse().find((p) => p[field] != null);

function renderCards() {
  const card = (title, field, digits, unit) => {
    const last = lastOf(field);
    if (!last) return "";
    const r = periodReturn(points, field, 12);
    return `
    <article class="card">
      <div class="card-head"><h3><span class="swatch" style="background:var(--series-gold)"></span>${title}</h3></div>
      <div class="big">${nf(digits).format(last[field])} <span class="small muted">${unit}</span></div>
      <dl class="stats">
        <dt>Son 1 yıl</dt><dd>${r ? fmtPct(r.pct) : "–"}</dd>
        <dt>Son veri</dt><dd>${fmtMonth(last.date)}</dd>
      </dl>
    </article>`;
  };
  $("gold-cards").innerHTML = card("Gram altın", "tlGram", 2, "TL") + card("Ons altın (Londra)", "usdOunce", 0, "USD");
}

function renderReturns() {
  const first = points[0];
  // Whole history of each series: from its first month with data.
  const all = (field) => {
    const valid = points.filter((p) => p[field] != null);
    return valid.length > 1 ? periodReturn(points, field, monthsBetween(valid[0].date, valid.at(-1).date)) : null;
  };
  const cell = (r) =>
    r ? `<td>${fmtGrowth(r.pct)}${r.cagr == null ? "" : `<span class="sub">yıllık ${fmtPct(r.cagr)}</span>`}</td>` : `<td>–</td>`;
  const rows = PERIODS.map(
    ([label, m]) => `<tr><th scope="row">${label}</th>${cell(periodReturn(points, "tlGram", m))}${cell(periodReturn(points, "usdOunce", m))}</tr>`,
  );
  rows.push(`<tr class="total"><th scope="row">Tüm dönem<span class="sub">${fmtMonth(first.date)}'den</span></th>${cell(all("tlGram"))}${cell(all("usdOunce"))}</tr>`);
  $("gold-returns").innerHTML = `
    <thead><tr><th></th><th>TL (gram)</th><th>USD (ons)</th></tr></thead>
    <tbody>${rows.join("")}</tbody>`;
}

function renderRange() {
  $("gold-range").innerHTML = RANGES.map(
    ([label, m]) => `<button type="button" role="tab" aria-selected="${m === rangeMonths}" data-months="${m}">${label}</button>`,
  ).join("");
}

function renderCharts() {
  for (const id of ["gold-tl-chart", "gold-usd-chart"]) Chart.getChart($(id))?.destroy();
  const shown = Number.isFinite(rangeMonths) ? points.slice(-(rangeMonths + 1)) : points;
  const text = cssVar("--text-secondary");
  const grid = cssVar("--grid");
  const gold = cssVar("--series-gold");
  const base = (logarithmic, format) => ({
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => format(c.parsed.y) } } },
    scales: {
      x: { ticks: { color: text, maxTicksLimit: 8 }, grid: { display: false } },
      y: {
        type: logarithmic ? "logarithmic" : "linear",
        // On the log axis label only powers of ten.
        ticks: { color: text, callback: (v) => (!logarithmic || Number.isInteger(Math.round(Math.log10(v) * 1e6) / 1e6) ? format(v) : null) },
        grid: { color: grid },
      },
    },
  });
  const dataset = (data) => ({ data, borderColor: gold, backgroundColor: gold, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.1, spanGaps: true });
  const labels = shown.map((p) => fmtMonth(p.date));
  const tlFormat = (v) => `${fmtPrice(v)} TL`;
  new Chart($("gold-tl-chart"), { type: "line", data: { labels, datasets: [dataset(shown.map((p) => p.tlGram))] }, options: base(true, tlFormat) });
  new Chart($("gold-usd-chart"), {
    type: "line",
    data: { labels, datasets: [dataset(shown.map((p) => p.usdOunce))] },
    options: base(false, (v) => `${nf(0).format(v)} $`),
  });
}

$("gold-range").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-months]");
  if (!btn) return;
  rangeMonths = Number(btn.dataset.months);
  renderRange();
  renderCharts();
});

load();
