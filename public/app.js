import {
  OPTIONS,
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
const MISSING = {
  "no-key": "EVDS anahtarı yok",
  "not-configured": "Seri kodu henüz tanımlı değil",
  empty: "EVDS boş veri döndü",
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
let indicators = {};
// Inputs the user edited by hand; live data never overwrites them.
const touched = new Set();

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
    const ind = indRes?.ok ? await indRes.json() : { available: false, indicators: {} };

    stats = { USD: trendStats(fx.usd), EUR: trendStats(fx.eur) };
    depositRates = dep.rates;
    indicators = ind.indicators ?? {};
    $("source").textContent = `Kur kaynağı: ${fx.source}. Son veri: ${fmtDate(stats.USD.current.date)}.`;

    renderCards();
    renderCharts(fx);
    renderIndicators(ind.available);
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

/** Points of an indicator, or null when EVDS did not deliver it. */
const pointsOf = (id) => (indicators[id]?.points?.length ? indicators[id].points : null);

function tile(id, title, body) {
  const r = indicators[id];
  if (!body) {
    const reason = r ? (MISSING[r.error] ?? "Veri alınamadı") : "Veri yok";
    return `<article class="tile missing"><h3>${title}</h3><div class="value">${reason}</div></article>`;
  }
  return `<article class="tile"><h3>${title}</h3>${body}</article>`;
}

function renderIndicators(available) {
  $("indicator-note").textContent = available
    ? "Kaynak: TCMB EVDS. Bu göstergeler kurun ve faizin yönü hakkında bilgi verir. Kesin tahmin değildir."
    : "EVDS anahtarı girilmedi. Göstergeler anahtar girildikten sonra görünür.";
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

function setDefault(id, value, hint) {
  if (value != null && !touched.has(id)) $(id).value = value;
  if (hint) $(`${id}Hint`).textContent = hint;
}

function applyDefaults() {
  const days = Number($("days").value) || 32;
  if (!touched.has("tlStopaj")) $("tlStopaj").value = tlStopajForDays(days);

  const dep = pickDepositRate(days);
  if (dep) {
    setDefault("tlRate", dep.rate.toFixed(2), `TCMB ortalaması (${dep.series}, ${fmtDate(dep.date)}): %${nf(2).format(dep.rate)}. Bankanızın oranını yazabilirsiniz.`);
  } else {
    if (!$("tlRate").value) $("tlRate").value = "40";
    $("tlRateHint").textContent = "Canlı faiz verisi yok. Bankanızın oranını yazın.";
  }

  const cpi = pointsOf("cpi");
  const inf = cpi && inflationStats(cpi);
  if (inf) setDefault("inflation", (inf.monthly * 100).toFixed(2), `Son TÜFE (${fmtDate(inf.date).slice(3)}): %${nf(2).format(inf.monthly * 100)}. Değiştirebilirsiniz.`);

  const exp = pointsOf("expUsdYearEnd")?.at(-1);
  if (exp) setDefault("expUsd", exp.value.toFixed(2), `Piyasa Katılımcıları Anketi (${fmtDate(exp.date).slice(3)}). Değiştirebilirsiniz.`);

  const bond = pointsOf("bondYield")?.at(-1);
  if (bond) setDefault("bondRate", bond.value.toFixed(2), `EVDS (${fmtDate(bond.date)}). Bankanızın bono oranını yazabilirsiniz.`);
}

function readInput() {
  const num = (id) => Number($(id).value) || 0;
  const optional = (id) => ($(id).value === "" ? null : Number($(id).value));
  return {
    amount: num("amount"),
    currency: $("currency").value,
    days: Math.max(1, num("days")),
    tlRate: num("tlRate"),
    tlStopaj: num("tlStopaj"),
    usdRate: num("usdRate"),
    eurRate: num("eurRate"),
    fxStopaj: num("fxStopaj"),
    spread: num("spread"),
    fxBuyTax: num("fxBuyTax"),
    monthlyInflation: optional("inflation"),
    expUsd: optional("expUsd"),
    bondRate: optional("bondRate"),
    bondStopaj: num("bondStopaj"),
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
  const trend = (growth) => Object.fromEntries(["USD", "EUR"].map((c) => [c, projectRate(now[c], stats[c][growth], input.days)]));
  const scenarios = [
    { title: "1 yıllık trend sürerse", end: trend("dailyGrowthYear") },
    { title: "Son 30 günlük trend sürerse", end: trend("dailyGrowthMonth") },
  ];
  if (input.expUsd > 0) {
    // Survey gives only USD/TRY; EUR follows it at today's EUR/USD parity.
    const usd = projectToTarget(now.USD, input.expUsd, daysUntilYearEnd(stats.USD.current.date), input.days);
    scenarios.push({ title: "Piyasa beklentisi gerçekleşirse", end: { USD: usd, EUR: (usd * now.EUR) / now.USD } });
  }
  scenarios.push({ title: "Kur sabit kalırsa", end: { ...now } });
  for (const sc of scenarios) {
    sc.result = compareOptions({ ...input, now, end: sc.end });
    sc.best = bestOption(sc.result);
  }

  const cur = SYMBOL[input.currency];
  const options = OPTIONS.filter((o) => scenarios[0].result[o]);
  const head = scenarios.map((s) => `<th>${s.title}</th>`).join("");

  $("results").innerHTML = `
    ${recommendationCard(input, scenarios)}
    <div class="result">
      <h3>${input.days} gün sonra elinizdeki tutar (${cur}, masraf, vergi ve stopaj sonrası)</h3>
      <div class="table-wrap"><table>
        <thead><tr><th></th>${head}</tr></thead>
        <tbody>${options.map((opt) => summaryRow(opt, input, scenarios)).join("")}</tbody>
      </table></div>
      ${
        input.monthlyInflation == null
          ? ""
          : `<p class="muted small">Reel getiri: TL bazında, aylık %${nf(2).format(input.monthlyInflation)} enflasyon sonrası. Negatif değer alım gücü kaybıdır.</p>`
      }
    </div>
    <h3 class="section-title">Seçeneklerin adım adım hesabı</h3>
    ${options.map((opt) => optionCard(opt, input, scenarios)).join("")}
    ${ratesCard(input, now, scenarios)}`;
}

function recommendationCard(input, scenarios) {
  const cur = SYMBOL[input.currency];
  const [year, month] = scenarios;
  const headline =
    year.best === month.best
      ? `Öneri: <strong>${OPTION_LABELS[year.best]}</strong>
         <p class="note">İki kur trendi de bu seçeneği gösteriyor.</p>`
      : `Net öneri yok
         <p class="note">1 yıllık trende göre <strong>${OPTION_LABELS[year.best]}</strong>, son 30 günlük trende göre <strong>${OPTION_LABELS[month.best]}</strong> daha kazançlı.</p>`;
  const list = scenarios
    .map((s) => {
      const r = s.result[s.best];
      return `<li>${s.title}: <strong>${OPTION_LABELS[s.best]}</strong> → ${fmtMoney(r.final)} ${cur} (${fmtPct(r.gainPct)})</li>`;
    })
    .join("");
  const fc = pointsOf("fundingCost");
  const dir = fc && rateDirection(fc, 90);
  const rateNote =
    dir?.direction === "down"
      ? `<p class="note">Faizler düşüş döneminde. Daha uzun vadeli mevduat bugünkü oranı kilitler.</p>`
      : dir?.direction === "up"
        ? `<p class="note">Faizler yükseliş döneminde. Kısa vade, yükselen faizden faydalanmanızı sağlar.</p>`
        : "";
  return `<div class="result summary">${headline}<ul class="picks">${list}</ul>${rateNote}</div>`;
}

function summaryRow(opt, input, scenarios) {
  const cur = SYMBOL[input.currency];
  const cells = scenarios
    .map((s) => {
      const r = s.result[opt];
      const best = s.best === opt;
      const tl = input.currency === "TRY" ? "" : `<span class="sub">≈ ${fmtMoney(r.tlValue)} TL</span>`;
      const real = r.realPct == null ? "" : `<span class="real">Reel: ${fmtPct(r.realPct)}</span>`;
      return `<td class="${best ? "best" : ""}">${best ? "★ " : ""}${fmtMoney(r.final)} ${cur}
        <span class="sub">${fmtPct(r.gainPct)} · ${r.gain >= 0 ? "+" : ""}${fmtMoney(r.gain)} ${cur}</span>${tl}${real}</td>`;
    })
    .join("");
  return `<tr><th scope="row">${OPTION_LABELS[opt]}</th>${cells}</tr>`;
}

/** One option, step by step: convert today, earn interest, convert back at the forecast rate. */
function optionCard(opt, input, scenarios) {
  const cur = input.currency;
  const trips = scenarios.map((s) => s.result[opt].trip);
  const held = trips[0].held;
  const converts = held !== cur;
  const heldName = opt === "BOND" ? "tahvil/bono (TL)" : held === "TRY" ? "TL mevduat" : `${held} mevduat`;
  const money = (v, c) => `${fmtMoney(v)} ${SYMBOL[c]}`;
  const minus = (v) => (v > 0 ? `−${money(v, "TRY")}` : "–");
  const outLabel =
    cur === "TRY"
      ? `${held} alım kuru (banka satış, bugün)`
      : held === "TRY"
        ? `${cur} bozdurma kuru (banka alış, bugün)`
        : `${cur} → ${held} çevrim oranı (masraflar dahil)`;
  const backLabel =
    held === "TRY"
      ? `${cur} alım kuru (banka satış, vade sonu)`
      : cur === "TRY"
        ? `${held} bozdurma kuru (banka alış, vade sonu)`
        : `${held} → ${cur} çevrim oranı (masraflar dahil)`;
  const fxs = [...new Set([cur, held].filter((c) => c !== "TRY"))];

  const rows = [["Başlangıç", () => money(input.amount, cur)]];
  if (converts) {
    rows.push(
      [outLabel, (t) => fmtRate(t.out.rate)],
      ["Makas maliyeti", (t) => minus(t.out.spreadCostTl)],
      ["Kambiyo vergisi", (t) => minus(t.out.taxTl)],
      [`${SYMBOL[held]} tutarı`, (t) => money(t.out.net, held)],
    );
  }
  rows.push(
    [`Brüt faiz (%${nf(2).format(trips[0].rate)}, ${input.days} gün)`, (t) => `+${money(t.grossInterest, held)}`],
    [`Stopaj (%${nf(1).format(trips[0].stopaj)})`, (t) => (t.stopajAmount > 0 ? `−${money(t.stopajAmount, held)}` : "–")],
    ["Vade sonu tutar", (t) => money(t.atMaturity, held)],
  );
  if (converts) {
    for (const c of fxs) rows.push([`${c}/TRY tahmini (vade sonu)`, (_, s) => fmtRate(s.end[c])]);
    rows.push(
      [backLabel, (t) => fmtRate(t.back.rate)],
      ["Makas maliyeti", (t) => minus(t.back.spreadCostTl)],
      ["Kambiyo vergisi", (t) => minus(t.back.taxTl)],
    );
  }
  rows.push(
    [`Elinize geçen (${SYMBOL[cur]})`, (t) => `<strong>${money(t.final, cur)}</strong>`],
    ["Başlangıca göre", (t) => `${t.final >= input.amount ? "+" : "−"}${money(Math.abs(t.final - input.amount), cur)}<span class="sub">${fmtPct(t.final / input.amount - 1)}</span>`],
  );

  const body = rows
    .map(([label, cell]) => `<tr><th scope="row">${label}</th>${trips.map((t, i) => `<td>${cell(t, scenarios[i])}</td>`).join("")}</tr>`)
    .join("");
  const path = converts ? `${SYMBOL[cur]} → ${heldName} → ${SYMBOL[cur]}` : `${heldName}, çevrim yok`;
  const wins = scenarios.filter((s) => s.best === opt).length;
  const badge = wins ? `<span class="badge">★ ${wins} senaryoda en iyi</span>` : "";
  return `
    <details class="result option"${scenarios[0].best === opt ? " open" : ""}>
      <summary><span><strong>${OPTION_LABELS[opt]}</strong> <span class="muted">(${path})</span></span>${badge}</summary>
      <div class="table-wrap"><table class="steps">
        <thead><tr><th></th>${scenarios.map((s) => `<th>${s.title}</th>`).join("")}</tr></thead>
        <tbody>${body}</tbody>
      </table></div>
    </details>`;
}

function ratesCard(input, now, scenarios) {
  const head = scenarios.map((s) => `<th>${s.title}</th>`).join("");
  const rateRows = ["USD", "EUR"]
    .map((c) => `<tr><th scope="row">${c}/TRY ${input.days} gün sonra</th>${scenarios.map((s) => `<td>${fmtRate(s.end[c])}</td>`).join("")}</tr>`)
    .join("");
  const holdingFx = input.currency !== "TRY";
  const breakEven = (holdingFx ? [input.currency] : ["USD", "EUR"])
    .map((c) => {
      const be = breakEvenRate(now[c], input, holdingFx, c);
      return holdingFx
        ? `<li>${CURRENCIES[c].label}: kur ${input.days} gün sonra <strong>${fmtRate(be)}</strong> altında kalırsa (${fmtPct(be / now[c] - 1)}) TL'ye geçip geri dönmek ${c}'de kalmaktan kazançlı olur.</li>`
        : `<li>${CURRENCIES[c].label}: kur ${input.days} gün içinde <strong>${fmtRate(be)}</strong> üstüne çıkarsa (${fmtPct(be / now[c] - 1)}) ${c}'de durmak TL faizden kazançlı olur.</li>`;
    })
    .join("");
  return `
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
      <p class="muted small">Makas ve kambiyo vergisi dahildir. Kambiyo vergisi yalnızca döviz alırken ödenir.</p>
    </div>`;
}

function bestOption(result) {
  return Object.entries(result).sort((a, b) => b[1].final - a[1].final)[0][0];
}

$("form").addEventListener("input", (e) => {
  touched.add(e.target.id);
  if (e.target.id === "days") applyDefaults();
  renderResults();
});

load();
