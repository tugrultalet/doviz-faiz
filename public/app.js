import { breakEvenRate, compareOptions, projectRate, tlStopajForDays, trendStats } from "./calc.js";

const $ = (id) => document.getElementById(id);
const CURRENCIES = { USD: { label: "Dolar", color: "--series-usd" }, EUR: { label: "Euro", color: "--series-eur" } };
const OPTION_LABELS = { TRY: "TL mevduatta tut", USD: "Dolarda tut", EUR: "Euroda tut" };
const VERDICT = {
  faster: "↑ Hızlandı",
  slower: "↓ Yavaşladı",
  same: "→ Aynı hızda",
};

const nf = (digits) => new Intl.NumberFormat("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const fmtRate = (v) => nf(4).format(v);
const fmtMoney = (v) => nf(2).format(v);
const fmtPct = (v, digits = 2) => `${v >= 0 ? "+" : ""}${nf(digits).format(v * 100)}%`;
const fmtDate = (iso) => iso.split("-").reverse().join(".");
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const SYMBOL = { TRY: "TL", USD: "USD", EUR: "EUR" };

let stats = null;
let depositRates = null;
let tlRateTouched = false;
let tlStopajTouched = false;

async function load() {
  try {
    const [fxRes, depRes] = await Promise.all([fetch("/api/fx"), fetch("/api/deposit-rate")]);
    const fx = await fxRes.json();
    if (!fxRes.ok) throw new Error(fx.error ?? "Kur verisi alınamadı.");
    const dep = await depRes.json();

    stats = { USD: trendStats(fx.usd), EUR: trendStats(fx.eur) };
    depositRates = dep.rates;
    $("source").textContent = `Kur kaynağı: ${fx.source}. Son veri: ${fmtDate(stats.USD.current.date)}.`;

    renderCards();
    renderCharts(fx);
    applyDefaults();
    if (dep.error) showError(dep.error);
    renderResults();
  } catch (err) {
    showError(err.message);
  }
}

function showError(msg) {
  $("error").textContent = msg;
  $("error").hidden = false;
}

function renderCards() {
  $("trend-cards").innerHTML = Object.entries(CURRENCIES)
    .map(([code, meta]) => {
      const s = stats[code];
      return `
      <article class="card">
        <div class="card-head">
          <h3><span class="swatch" style="background:var(${meta.color})"></span>${meta.label} (${code}/TRY)</h3>
          <span class="badge">${VERDICT[s.verdict]}</span>
        </div>
        <div class="big">${fmtRate(s.current.value)}</div>
        <dl class="stats">
          <dt>Son 1 yıl</dt><dd>${fmtPct(s.yearChange)}</dd>
          <dt>Son 30 gün</dt><dd>${fmtPct(s.lastMonth)}</dd>
          <dt>Önceki 11 dönem, 30 günlük ortalama</dt><dd>${fmtPct(s.prevAvg)}</dd>
        </dl>
      </article>`;
    })
    .join("");
}

function renderCharts(fx) {
  const text = cssVar("--text-secondary");
  const grid = cssVar("--grid");
  const scales = {
    x: { ticks: { color: text, maxTicksLimit: 8 }, grid: { display: false } },
    y: { ticks: { color: text }, grid: { color: grid } },
  };
  const legend = { labels: { color: text, usePointStyle: true, pointStyle: "rectRounded" } };

  new Chart($("rate-chart"), {
    type: "line",
    data: {
      labels: fx.usd.map((p) => fmtDate(p.date)),
      datasets: [
        { label: "USD/TRY", data: fx.usd.map((p) => p.value), borderColor: cssVar("--series-usd"), backgroundColor: cssVar("--series-usd") },
        { label: "EUR/TRY", data: alignTo(fx.usd, fx.eur), borderColor: cssVar("--series-eur"), backgroundColor: cssVar("--series-eur") },
      ].map((d) => ({ ...d, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.15 })),
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmtRate(c.parsed.y)}` } } },
      scales,
    },
  });

  const months = [...stats.USD.months].reverse();
  new Chart($("month-chart"), {
    type: "bar",
    data: {
      labels: months.map((m) => fmtDate(m.end).slice(0, 5)),
      datasets: ["USD", "EUR"].map((code) => ({
        label: code,
        data: [...stats[code].months].reverse().map((m) => m.change * 100),
        backgroundColor: cssVar(CURRENCIES[code].color),
        borderRadius: 4,
        borderSkipped: "start",
        borderColor: cssVar("--surface-1"),
        borderWidth: { left: 1, right: 1 },
      })),
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend,
        tooltip: {
          callbacks: {
            title: (items) => {
              const m = months[items[0].dataIndex];
              return `${fmtDate(m.start)} – ${fmtDate(m.end)}`;
            },
            label: (c) => `${c.dataset.label}: ${fmtPct(c.parsed.y / 100)}`,
          },
        },
      },
      scales: { ...scales, y: { ...scales.y, ticks: { color: text, callback: (v) => `%${v}` } } },
    },
  });
}

// EUR and USD dates normally match; fill gaps with the last known EUR value.
function alignTo(base, other) {
  const byDate = new Map(other.map((p) => [p.date, p.value]));
  let last = null;
  return base.map((p) => (last = byDate.get(p.date) ?? last));
}

function pickDepositRate(days) {
  if (!depositRates) return null;
  return days <= 31 ? depositRates.upTo1Month ?? depositRates.upTo3Months : depositRates.upTo3Months ?? depositRates.upTo1Month;
}

function applyDefaults() {
  const days = Number($("days").value) || 32;
  if (!tlStopajTouched) $("tlStopaj").value = tlStopajForDays(days);
  const dep = pickDepositRate(days);
  if (dep) {
    if (!tlRateTouched) $("tlRate").value = dep.rate.toFixed(2);
    $("tlRateHint").textContent = `TCMB ortalaması (${dep.series}, ${fmtDate(dep.date)}): %${nf(2).format(dep.rate)}. Bankanızın oranını yazabilirsiniz.`;
  } else {
    if (!$("tlRate").value) $("tlRate").value = "40";
    $("tlRateHint").textContent = "Canlı faiz verisi yok. Bankanızın oranını yazın.";
  }
}

function readInput() {
  const num = (id) => Number($(id).value) || 0;
  return {
    amount: num("amount"),
    currency: $("currency").value,
    days: Math.max(1, num("days")),
    tlRate: num("tlRate"),
    tlStopaj: num("tlStopaj"),
    fxRate: num("fxRate"),
    fxStopaj: num("fxStopaj"),
    spread: num("spread"),
  };
}

function renderResults() {
  if (!stats) return;
  const input = readInput();
  if (input.amount <= 0) {
    $("results").innerHTML = `<p class="muted">Bir tutar girin.</p>`;
    return;
  }
  const now = { USD: stats.USD.current.value, EUR: stats.EUR.current.value };
  const scenarios = [
    { key: "year", title: "1 yıllık trend sürerse", growth: "dailyGrowthYear" },
    { key: "month", title: "Son 30 günlük trend sürerse", growth: "dailyGrowthMonth" },
    { key: "flat", title: "Kur sabit kalırsa", growth: null },
  ].map((sc) => {
    const end = Object.fromEntries(
      ["USD", "EUR"].map((c) => [c, sc.growth ? projectRate(now[c], stats[c][sc.growth], input.days) : now[c]]),
    );
    return { ...sc, end, result: compareOptions({ ...input, now, end }) };
  });

  const cur = SYMBOL[input.currency];
  const head = scenarios.map((s) => `<th>${s.title}</th>`).join("");
  const rows = ["TRY", "USD", "EUR"]
    .map((opt) => {
      const cells = scenarios
        .map((s) => {
          const r = s.result[opt];
          const best = bestOption(s.result) === opt;
          const tl = input.currency === "TRY" ? "" : `<span class="sub">≈ ${fmtMoney(r.tlValue)} TL</span>`;
          return `<td class="${best ? "best" : ""}">${best ? "★ " : ""}${fmtMoney(r.final)} ${cur}
            <span class="sub">${fmtPct(r.gainPct)} · ${r.gain >= 0 ? "+" : ""}${fmtMoney(r.gain)} ${cur}</span>${tl}</td>`;
        })
        .join("");
      return `<tr><th scope="row">${OPTION_LABELS[opt]}</th>${cells}</tr>`;
    })
    .join("");

  const rateRows = ["USD", "EUR"]
    .map((c) => {
      const cells = scenarios.map((s) => `<td>${fmtRate(s.end[c])}</td>`).join("");
      return `<tr><th scope="row">${c}/TRY ${input.days} gün sonra</th>${cells}</tr>`;
    })
    .join("");

  const breakEven = ["USD", "EUR"]
    .map((c) => {
      const be = breakEvenRate(now[c], input);
      return `<li>${CURRENCIES[c].label}: kur ${input.days} gün içinde <strong>${fmtRate(be)}</strong> üstüne çıkarsa (${fmtPct(be / now[c] - 1)}) dövizde tutmak TL faizden kazançlı olur.</li>`;
    })
    .join("");

  const yearBest = bestOption(scenarios[0].result);
  const monthBest = bestOption(scenarios[1].result);
  const summary =
    yearBest === monthBest
      ? `İki trend senaryosunda da en iyi seçenek: <strong>${OPTION_LABELS[yearBest]}</strong>.`
      : `Senaryolar farklı sonuç veriyor: 1 yıllık trende göre <strong>${OPTION_LABELS[yearBest]}</strong>, son 30 günlük trende göre <strong>${OPTION_LABELS[monthBest]}</strong>.`;

  $("results").innerHTML = `
    <div class="result summary">${summary}</div>
    <div class="result">
      <h3>${input.days} gün sonra elinizdeki tutar (${cur}, masraf ve stopaj sonrası)</h3>
      <div class="table-wrap"><table>
        <thead><tr><th></th>${head}</tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>
    <div class="result">
      <h3>Senaryoların kur tahmini</h3>
      <div class="table-wrap"><table>
        <thead><tr><th></th>${head}</tr></thead>
        <tbody>${rateRows}</tbody>
      </table></div>
    </div>
    <div class="result">
      <h3>Başabaş kur (TL faiz ile döviz eşit olur)</h3>
      <ul>${breakEven}</ul>
      <p class="muted small">TL net faiz ${input.days} gün için: ${fmtPct((input.tlRate / 100) * (input.days / 365) * (1 - input.tlStopaj / 100))} (stopaj %${nf(1).format(input.tlStopaj)} sonrası).</p>
    </div>`;
}

function bestOption(result) {
  return Object.entries(result).sort((a, b) => b[1].final - a[1].final)[0][0];
}

$("form").addEventListener("input", (e) => {
  if (e.target.id === "tlRate") tlRateTouched = true;
  if (e.target.id === "tlStopaj") tlStopajTouched = true;
  if (e.target.id === "days") applyDefaults();
  renderResults();
});

load();
