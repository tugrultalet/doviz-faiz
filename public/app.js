import {
  breakEvenRate,
  changeOver,
  compareOptions,
  daysUntilYearEnd,
  inflationStats,
  percentileOf,
  projectRate,
  projectToTarget,
  rateDirection,
  tlStopajForDays,
  trendStats,
} from "./calc.js";

const $ = (id) => document.getElementById(id);
const CURRENCIES = { USD: { label: "Dolar", color: "--series-usd" }, EUR: { label: "Euro", color: "--series-eur" } };
const OPTION_LABELS = { TRY: "TL'de faizde tut", BOND: "Tahvil / bonoda tut", USD: "Dolarda dur", EUR: "Euroda dur" };
const VERDICT = {
  faster: "↑ Hızlandı",
  slower: "↓ Yavaşladı",
  same: "→ Aynı hızda",
};
const SYMBOL = { TRY: "TL", USD: "USD", EUR: "EUR" };
const FALLBACK_SPREAD = 1; // % when TCMB buy/sell rates are not available

const nf = (digits) => new Intl.NumberFormat("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const fmtRate = (v) => nf(4).format(v);
const fmtMoney = (v) => nf(2).format(v);
const fmtPct = (v, digits = 2) => `${v >= 0 ? "+" : ""}${nf(digits).format(v * 100)}%`;
const fmtDate = (iso) => iso.split("-").reverse().join(".");
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

let stats = null;
let fxData = null;
let depositRates = null;
let indicators = {};
let scenarioIndex = 0;
// Main inputs the user edited by hand; live data never overwrites them.
const touched = new Set();

// ---- Settings (modal) -------------------------------------------------------
// Saved values override the automatic ones. Stored per browser only.
const STORE_KEY = "doviz-faiz-settings";
let saved = {};
try {
  saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
} catch {
  saved = {};
}
function persist() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(saved));
  } catch {
    // private mode: settings live for this page view only
  }
}

/** Automatic value and its explanation for each setting. */
function autoSetting(key) {
  const days = Number($("days").value) || 32;
  switch (key) {
    case "tlStopaj":
      return { value: tlStopajForDays(days), hint: "Vadeye göre: 6 aya kadar %17,5, 1 yıla kadar %15, daha uzun %10." };
    case "fxStopaj":
      return { value: 25 };
    case "bondStopaj":
      return { value: 0 };
    case "fxBuyTax":
      return { value: 0.2 };
    case "tlGap":
      return { value: 4 };
    case "spread": {
      const s = fxData?.spread;
      const vals = [s?.USD, s?.EUR].filter((v) => v != null);
      if (!vals.length) return { value: FALLBACK_SPREAD, hint: `TCMB alış-satış verisi yok. Varsayılan %${nf(2).format(FALLBACK_SPREAD)}.` };
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      return {
        value: Number(avg.toFixed(2)),
        hint: `TCMB alış-satış farkı (USD %${nf(2).format(s.USD ?? avg)}, EUR %${nf(2).format(s.EUR ?? avg)}). Bankanızın makası daha yüksekse değiştirin.`,
      };
    }
    case "inflation": {
      const cpi = pointsOf("cpi");
      const inf = cpi && inflationStats(cpi);
      return inf
        ? { value: Number((inf.monthly * 100).toFixed(2)), hint: `Son TÜFE (${fmtDate(inf.date).slice(3)}). Reel getiri için kullanılır.` }
        : { value: null, hint: "Boşsa reel getiri gösterilmez." };
    }
    case "expUsd": {
      const exp = pointsOf("expUsdYearEnd")?.at(-1);
      return { value: exp ? Number(exp.value.toFixed(2)) : null };
    }
    case "bondRate": {
      const bond = pointsOf("bondYield")?.at(-1);
      return { value: bond ? Number(bond.value.toFixed(2)) : null };
    }
    default:
      return { value: null };
  }
}

const setting = (key) => (saved[key] ?? null) !== null ? saved[key] : autoSetting(key).value;

function fillSettingsForm() {
  for (const input of document.querySelectorAll("[data-setting]")) {
    const key = input.dataset.setting;
    const v = setting(key);
    input.value = v == null ? "" : v;
    input.classList.toggle("overridden", saved[key] != null);
  }
  for (const hint of document.querySelectorAll("[data-hint]")) hint.textContent = autoSetting(hint.dataset.hint).hint ?? "";
  const theme = saved.theme ?? "system";
  for (const r of document.querySelectorAll('input[name="theme"]')) r.checked = r.value === theme;
}

function applyTheme() {
  const t = saved.theme;
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  if (fxData) renderCharts(fxData); // charts read colors from CSS
}

$("open-settings").addEventListener("click", () => {
  fillSettingsForm();
  $("settings").showModal();
});
$("settings").addEventListener("click", (e) => {
  if (e.target === $("settings")) $("settings").close(); // click on backdrop
});
$("settings-form").addEventListener("input", (e) => {
  const t = e.target;
  if (t.name === "theme") {
    saved.theme = t.value === "system" ? undefined : t.value;
    applyTheme();
  } else if (t.dataset.setting) {
    saved[t.dataset.setting] = t.value === "" ? null : Number(t.value);
    t.classList.add("overridden");
  }
  persist();
  if (stats) applyDefaults();
  render();
});
$("reset-settings").addEventListener("click", () => {
  const theme = saved.theme;
  saved = theme ? { theme } : {};
  persist();
  fillSettingsForm();
  if (stats) applyDefaults();
  render();
});

// ---- Data -------------------------------------------------------------------

async function load() {
  try {
    const [fxRes, depRes, indRes] = await Promise.all([
      fetch("/api/fx"),
      fetch("/api/deposit-rate"),
      fetch("/api/indicators").catch(() => null),
    ]);
    const fx = await fxRes.json();
    if (!fxRes.ok) throw new Error(fx.error ?? "Kur verisi alınamadı.");
    const dep = await depRes.json();
    const ind = indRes?.ok ? await indRes.json() : { indicators: {} };

    fxData = fx;
    stats = { USD: trendStats(fx.usd), EUR: trendStats(fx.eur) };
    depositRates = dep.rates;
    indicators = ind.indicators ?? {};
    $("source").textContent = `Kur: ${fx.source} · Son veri: ${fmtDate(stats.USD.current.date)}`;

    renderCards();
    renderCharts(fx);
    renderIndicators();
    applyDefaults();
    if (dep.error) showError(dep.error);
    render();
  } catch (err) {
    showError(err.message);
  }
}

function showError(msg) {
  $("error").textContent = msg;
  $("error").hidden = false;
}

/** Points of an indicator, or null when EVDS did not deliver it. */
const pointsOf = (id) => (indicators[id]?.points?.length ? indicators[id].points : null);

function tile(_id, title, body) {
  if (!body) return ""; // hide indicators EVDS did not deliver
  return `<article class="tile"><h3>${title}</h3>${body}</article>`;
}

function renderIndicators() {
  const usdNow = stats.USD.current.value;
  const tiles = [];

  const cpi = pointsOf("cpi");
  const inf = cpi && inflationStats(cpi);
  tiles.push(
    tile(
      "cpi",
      "Enflasyon (TÜFE)",
      inf &&
        `<div class="value">${fmtPct(inf.monthly)} <span class="small muted">aylık</span></div>
         <p>Yıllık: ${inf.annual == null ? "–" : fmtPct(inf.annual, 1)} · ${fmtDate(inf.date).slice(3)}</p>`,
    ),
  );

  const fc = pointsOf("fundingCost");
  const dir = fc && rateDirection(fc, 90);
  const dirText = { down: "↓ Faiz düşüş döneminde", up: "↑ Faiz yükseliş döneminde", flat: "→ Faiz yatay" };
  tiles.push(
    tile(
      "fundingCost",
      "TCMB fonlama faizi",
      dir &&
        `<div class="value">%${nf(2).format(dir.last.value)}</div>
         <p>${dirText[dir.direction]} (3 ayda ${dir.diff >= 0 ? "+" : ""}${nf(2).format(dir.diff)} puan)</p>`,
    ),
  );

  const exp = pointsOf("expUsdYearEnd");
  const expLast = exp?.at(-1);
  tiles.push(
    tile(
      "expUsdYearEnd",
      "Yıl sonu USD/TRY beklentisi",
      expLast &&
        `<div class="value">${fmtRate(expLast.value)}</div>
         <p>Bugüne göre ${fmtPct(expLast.value / usdNow - 1)} · Piyasa Katılımcıları Anketi</p>`,
    ),
  );

  const hh = pointsOf("hhInflationExp")?.at(-1);
  tiles.push(
    tile(
      "hhInflationExp",
      "Hanehalkı enflasyon beklentisi",
      hh && `<div class="value">%${nf(1).format(hh.value)}</div><p>12 ay sonrası · ${fmtDate(hh.date).slice(3)}</p>`,
    ),
  );

  const reer = pointsOf("reer");
  const reerLast = reer?.at(-1);
  const reerPct = reer && percentileOf(reer, reerLast.value);
  tiles.push(
    tile(
      "reer",
      "Reel efektif kur (TÜFE bazlı)",
      reerLast &&
        `<div class="value">${nf(1).format(reerLast.value)}</div>
         <p>Son 10 yılın %${nf(0).format(reerPct * 100)} dilimi. ${
           reerPct >= 0.8 ? "TL reel olarak pahalı: kur artış riski yüksek." : reerPct <= 0.2 ? "TL reel olarak ucuz." : "Tarihsel ortalamaya yakın."
         }</p>`,
    ),
  );

  for (const [id, title] of [
    ["reserves", "TCMB rezervleri (milyon USD)"],
    ["fxDeposits", "Yerleşiklerin döviz mevduatı"],
  ]) {
    const pts = pointsOf(id);
    const c = pts && changeOver(pts, 90);
    tiles.push(
      tile(
        id,
        title,
        c && `<div class="value">${nf(0).format(c.last.value)}</div><p>3 ayda ${fmtPct(c.pct, 1)} · ${fmtDate(c.last.date)}</p>`,
      ),
    );
  }

  const bond = pointsOf("bondYield")?.at(-1);
  tiles.push(
    tile("bondYield", "Tahvil / bono faizi", bond && `<div class="value">%${nf(2).format(bond.value)}</div><p>${fmtDate(bond.date)}</p>`),
  );

  $("indicator-tiles").innerHTML = tiles.join("");
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
  for (const id of ["rate-chart", "month-chart"]) Chart.getChart($(id))?.destroy();
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

// ---- Main inputs ------------------------------------------------------------

const TERMS = [
  ["upTo1Month", 31, "1 aya kadar"],
  ["upTo3Months", 91, "3 aya kadar"],
  ["upTo6Months", 182, "6 aya kadar"],
  ["upTo1Year", 365, "1 yıla kadar"],
  ["over1Year", Infinity, "1 yıldan uzun"],
];

/** TCMB average savings deposit rate for the term bucket of `days`; nearest bucket when that one has no data. */
function tcmbDepositRate(currency, days) {
  const r = depositRates?.[currency];
  if (!r) return null;
  const idx = TERMS.findIndex(([, max]) => days <= max);
  for (const i of [idx, idx + 1, idx - 1, idx + 2, idx - 2]) {
    const v = TERMS[i] && r[TERMS[i][0]];
    if (v?.rate != null) return { ...v, term: TERMS[i][2] };
  }
  return null;
}

function applyDefaults() {
  const days = Number($("days").value) || 32;
  const tl = tcmbDepositRate("TRY", days);
  if (tl) {
    const gap = setting("tlGap") ?? 0;
    if (!touched.has("tlRate")) $("tlRate").value = Math.max(0, tl.rate - gap).toFixed(2);
    $("tlRateHint").textContent = `TCMB ortalaması %${nf(2).format(tl.rate)} (${tl.term} vadeli, ${fmtDate(tl.date)}). Bankalar genelde ${nf(0).format(gap)} puan altında verir.`;
  } else {
    if (!$("tlRate").value) $("tlRate").value = "38";
    $("tlRateHint").textContent = "TCMB verisi yok. Bankanızın oranını yazın.";
  }
  for (const [c, id] of [
    ["USD", "usdRate"],
    ["EUR", "eurRate"],
  ]) {
    const d = tcmbDepositRate(c, days);
    if (d) {
      if (!touched.has(id)) $(id).value = d.rate.toFixed(2);
      $(`${id}Hint`).textContent = `TCMB ortalaması (${d.term} vadeli, ${fmtDate(d.date)}). Değiştirebilirsiniz.`;
    } else {
      if (!$(id).value) $(id).value = "0";
      $(`${id}Hint`).textContent = "Bankanızın oranını yazın.";
    }
  }
}

function readInput() {
  const num = (id) => Number($(id).value) || 0;
  const bondRate = setting("bondRate");
  return {
    amount: num("amount"),
    currency: $("currency").value,
    days: Math.max(1, num("days")),
    tlRate: num("tlRate"),
    usdRate: num("usdRate"),
    eurRate: num("eurRate"),
    tlStopaj: setting("tlStopaj") ?? 0,
    fxStopaj: setting("fxStopaj") ?? 0,
    bondStopaj: setting("bondStopaj") ?? 0,
    fxBuyTax: setting("fxBuyTax") ?? 0,
    spread: setting("spread") ?? FALLBACK_SPREAD,
    monthlyInflation: setting("inflation"),
    expUsd: setting("expUsd"),
    bondRate: bondRate > 0 ? bondRate : null,
  };
}

// ---- Result -----------------------------------------------------------------

function buildScenarios(input, now) {
  const trend = (growth) => Object.fromEntries(["USD", "EUR"].map((c) => [c, projectRate(now[c], stats[c][growth], input.days)]));
  const scenarios = [
    { short: "1 yıllık trend", title: "Kur 1 yıllık trendle giderse", end: trend("dailyGrowthYear") },
    { short: "Son 30 gün trendi", title: "Kur son 30 günlük trendle giderse", end: trend("dailyGrowthMonth") },
  ];
  if (input.expUsd > 0) {
    // Survey gives only USD/TRY; EUR follows it at today's EUR/USD parity.
    const usd = projectToTarget(now.USD, input.expUsd, daysUntilYearEnd(stats.USD.current.date), input.days);
    scenarios.push({ short: "Piyasa beklentisi", title: "Piyasa beklentisi gerçekleşirse", end: { USD: usd, EUR: (usd * now.EUR) / now.USD } });
  }
  scenarios.push({ short: "Kur sabit", title: "Kur sabit kalırsa", end: { ...now } });
  for (const sc of scenarios) {
    sc.result = compareOptions({ ...input, now, end: sc.end });
    sc.ranking = Object.entries(sc.result)
      .sort((a, b) => b[1].final - a[1].final)
      .map(([k]) => k);
  }
  return scenarios;
}

function render() {
  if (!stats) return;
  const input = readInput();
  if (input.amount <= 0) {
    $("result").innerHTML = `<div class="card"><p class="muted">Bir tutar girin.</p></div>`;
    return;
  }
  const now = { USD: stats.USD.current.value, EUR: stats.EUR.current.value };
  const scenarios = buildScenarios(input, now);
  scenarioIndex = Math.min(scenarioIndex, scenarios.length - 1);
  const sc = scenarios[scenarioIndex];
  const cur = SYMBOL[input.currency];
  const [best, second] = sc.ranking;
  const b = sc.result[best];

  const tabs = scenarios
    .map((s, i) => `<button type="button" role="tab" aria-selected="${i === scenarioIndex}" data-scenario="${i}">${s.short}</button>`)
    .join("");

  const lead = second
    ? `${OPTION_LABELS[second]} seçeneğinden ${fmtMoney(b.final - sc.result[second].final)} ${cur} fazla.`
    : "";
  const options = sc.ranking
    .map((opt) => {
      const r = sc.result[opt];
      const real = r.realPct == null ? "" : `<span class="real">reel ${fmtPct(r.realPct)}</span>`;
      return `
      <li class="${opt === best ? "best" : ""}">
        <details>
          <summary>
            <span class="opt-name">${opt === best ? "★ " : ""}${OPTION_LABELS[opt]}</span>
            <span class="opt-amount">${fmtMoney(r.final)} ${cur}</span>
            <span class="opt-gain ${r.gain >= 0 ? "up" : "down"}">${fmtPct(r.gainPct)}${real}</span>
          </summary>
          ${stepsTable(opt, input, sc)}
        </details>
      </li>`;
    })
    .join("");

  const others = scenarios
    .map((s, i) => (i === scenarioIndex ? "" : `<li>${s.short}: <strong>${OPTION_LABELS[s.ranking[0]]}</strong></li>`))
    .join("");

  $("result").innerHTML = `
    <div class="card result-card">
      <div class="tabs" role="tablist" aria-label="Kur senaryosu">${tabs}</div>
      <p class="muted small scenario-rates">${sc.title}: ${input.days} gün sonra USD ${fmtRate(sc.end.USD)}, EUR ${fmtRate(sc.end.EUR)}</p>
      <div class="reco">
        <span class="reco-label">Öneri</span>
        <strong class="reco-main">${OPTION_LABELS[best]}</strong>
        <p>Vade sonunda <strong>${fmtMoney(b.final)} ${cur}</strong> (${fmtPct(b.gainPct)}). ${lead}</p>
      </div>
      <ul class="options">${options}</ul>
      <p class="muted small">Ayrıntı için bir seçeneğe tıklayın. Makas, kambiyo vergisi ve stopaj düşülmüştür.</p>
      <div class="others"><span class="muted small">Diğer senaryolarda en iyisi:</span><ul>${others}</ul></div>
      ${breakEvenNote(input, now)}
      ${rateNote()}
    </div>`;
}

/** Step-by-step table for one option in one scenario. */
function stepsTable(opt, input, sc) {
  const cur = input.currency;
  const t = sc.result[opt].trip;
  const held = t.held;
  const money = (v, c) => `${fmtMoney(v)} ${SYMBOL[c]}`;
  const cost = (v) => (v > 0 ? `−${money(v, "TRY")}` : "–");
  const rows = [["Başlangıç", money(input.amount, cur)]];
  if (held !== cur) {
    const outLabel =
      cur === "TRY" ? `${held} alış kuru (bugün)` : held === "TRY" ? `${cur} bozdurma kuru (bugün)` : `${cur} → ${held} çevrim oranı`;
    rows.push(
      [outLabel, fmtRate(t.out.rate)],
      ["Makas + kambiyo vergisi", cost(t.out.spreadCostTl + t.out.taxTl)],
      [`${SYMBOL[held]} tutarı`, money(t.out.net, held)],
    );
  }
  rows.push(
    [`Faiz (%${nf(2).format(t.rate)}, ${input.days} gün)`, `+${money(t.grossInterest, held)}`],
    [`Stopaj (%${nf(1).format(t.stopaj)})`, t.stopajAmount > 0 ? `−${money(t.stopajAmount, held)}` : "–"],
    ["Vade sonu", money(t.atMaturity, held)],
  );
  if (held !== cur) {
    const fx = cur === "TRY" ? held : cur;
    const backLabel =
      held === "TRY" ? `${cur} alış kuru (vade sonu tahmini)` : cur === "TRY" ? `${held} bozdurma kuru (vade sonu tahmini)` : `${held} → ${cur} çevrim oranı`;
    rows.push(
      [`${fx}/TRY tahmini`, fmtRate(sc.end[fx])],
      [backLabel, fmtRate(t.back.rate)],
      ["Makas + kambiyo vergisi", cost(t.back.spreadCostTl + t.back.taxTl)],
    );
  }
  rows.push(["Elinize geçen", `<strong>${money(t.final, cur)}</strong>`]);
  return `<table class="steps">${rows.map(([l, v]) => `<tr><th scope="row">${l}</th><td>${v}</td></tr>`).join("")}</table>`;
}

function breakEvenNote(input, now) {
  const holdingFx = input.currency !== "TRY";
  const items = (holdingFx ? [input.currency] : ["USD", "EUR"]).map((c) => {
    const be = breakEvenRate(now[c], input, holdingFx, c);
    return holdingFx
      ? `${c} ${input.days} gün sonra <strong>${fmtRate(be)}</strong> altında kalırsa TL faiz kazandırır`
      : `${c} <strong>${fmtRate(be)}</strong> üstüne çıkarsa (${fmtPct(be / now[c] - 1)}) ${c} kazandırır`;
  });
  return `<p class="small breakeven">Başabaş: ${items.join(" · ")}.</p>`;
}

function rateNote() {
  const fc = pointsOf("fundingCost");
  const dir = fc && rateDirection(fc, 90);
  if (dir?.direction === "down") return `<p class="small note">Faizler düşüş döneminde. Uzun vade bugünkü oranı kilitler.</p>`;
  if (dir?.direction === "up") return `<p class="small note">Faizler yükseliş döneminde. Kısa vade daha esnektir.</p>`;
  return "";
}

$("result").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-scenario]");
  if (!btn) return;
  scenarioIndex = Number(btn.dataset.scenario);
  render();
});

$("form").addEventListener("input", (e) => {
  touched.add(e.target.id);
  if (e.target.id === "days") applyDefaults();
  render();
});

load();
