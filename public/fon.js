import { FUND_TYPES, RANK_PERIODS, RISK_GROUPS, alignCurves, alignMonths, fundSummary, indexFunds, searchFunds, topFunds } from "./fundsearch.js";
import { revealPage, setupSidebar } from "./ui.js";

const $ = (id) => document.getElementById(id);
const nf = (digits) => new Intl.NumberFormat("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const fmtPct = (v, digits = 2) => (v == null ? "–" : `${v >= 0 ? "+" : ""}${nf(digits).format(v)}%`);
const fmtPrice = (v) => (v == null ? "–" : nf(v >= 100 ? 2 : 6).format(v));
const compactTl = new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 });
const fmtDate = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "–");
const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const fmtMonth = (ym) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
/** "#2a78d6" + 0.4 → "rgba(42, 120, 214, 0.4)"; other colour formats are returned as they are. */
const withAlpha = (hex, a) => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
const shortType = (type) => (type ? type.replace(/ Şemsiye Fonu$/, "") : "Tür bilinmiyor");

const LAST_KEY = "doviz-faiz-last-fund";
const COMPARE_KEY = "doviz-faiz-compare-funds";
const DEFAULT_FUND = "FI5";
const MAX_COMPARE = 2; // plus the main fund: 3 lines at most
const SERIES_VARS = ["--accent", "--series-eur", "--series-parity"];

let funds = [];
let index = [];
let typeId = "all";
let options = []; // funds now shown in the list
let active = -1; // highlighted option
let current = null; // { fund, history } of the main fund
let compare = []; // [{ fund, history }] shown next to the main fund
let pickFor = "main"; // which slot the search box fills: "main" | "compare"
let mode = "annualized";
let topPeriod = "1y";
let topRisk = "all";
let requestId = 0;
const historyCache = new Map(); // code -> Promise of /api/funds/:code

const input = $("fund-search");
const list = $("fund-options");

// ---- Loading ----

async function loadList() {
  const res = await fetch("/api/funds");
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Fon listesi alınamadı.");
  funds = body.funds;
  index = indexFunds(funds);
  const date = funds.map((f) => f.date).filter(Boolean).sort().at(-1);
  $("source").textContent = `TEFAS · ${funds.length} yatırım fonu · fiyat tarihi ${fmtDate(date)}`;
  input.disabled = false;
}

const fundByCode = (code) => funds.find((f) => f.code === code) ?? { code, name: code };
const mainLabel = () => (current ? `${current.fund.code} · ${current.fund.name}` : "");

function loadHistory(code) {
  if (!historyCache.has(code)) {
    const p = fetch(`/api/funds/${encodeURIComponent(code)}`).then(async (res) => {
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Fon verisi alınamadı.");
      return body;
    });
    p.catch(() => historyCache.delete(code)); // let a later try fetch again
    historyCache.set(code, p);
  }
  return historyCache.get(code);
}

function saveState() {
  try {
    if (current) localStorage.setItem(LAST_KEY, current.fund.code);
    localStorage.setItem(COMPARE_KEY, compare.map((c) => c.fund.code).join(","));
  } catch {
    // private mode
  }
  const url = new URL(location.href);
  if (current) url.searchParams.set("kod", current.fund.code);
  if (compare.length) url.searchParams.set("karsilastir", compare.map((c) => c.fund.code).join(","));
  else url.searchParams.delete("karsilastir");
  history.replaceState(null, "", url);
}

function showError(message) {
  $("error").textContent = message;
  $("error").hidden = !message;
}

async function selectFund(code) {
  const fund = fundByCode(code);
  input.value = `${fund.code} · ${fund.name}`;
  closeList();
  compare = compare.filter((c) => c.fund.code !== code); // the main fund is not compared with itself

  const id = ++requestId;
  showError("");
  $("fund-view").classList.add("loading");
  try {
    const body = await loadHistory(fund.code);
    if (id !== requestId) return; // a newer choice is on the way
    current = { fund: { ...fund, name: body.name ?? fund.name }, history: body };
    saveState();
    renderFund();
  } catch (err) {
    if (id !== requestId) return;
    showError(err.message);
  } finally {
    if (id === requestId) $("fund-view").classList.remove("loading");
  }
}

async function addCompare(code) {
  pickFor = "main";
  input.value = mainLabel();
  closeList();
  if (!current || code === current.fund.code || compare.some((c) => c.fund.code === code)) return;
  if (compare.length >= MAX_COMPARE) return;
  const fund = fundByCode(code);
  showError("");
  $("fund-view").classList.add("loading");
  try {
    const body = await loadHistory(code);
    if (compare.length >= MAX_COMPARE || compare.some((c) => c.fund.code === code)) return;
    compare.push({ fund: { ...fund, name: body.name ?? fund.name }, history: body });
    saveState();
    renderFund();
  } catch (err) {
    showError(`${code}: ${err.message}`);
  } finally {
    $("fund-view").classList.remove("loading");
  }
}

function removeCompare(code) {
  compare = compare.filter((c) => c.fund.code !== code);
  saveState();
  renderFund();
}

/** Chooses `code` for the slot the search box is filling now. */
function choose(code) {
  if (pickFor === "compare") addCompare(code);
  else selectFund(code);
}

// ---- Type filter ----

function renderTypes() {
  $("fund-types").innerHTML = FUND_TYPES.map(
    (t) => `<button type="button" class="chip" aria-pressed="${t.id === typeId}" data-type="${t.id}">${t.label}</button>`,
  ).join("");
}

$("fund-types").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-type]");
  if (!btn) return;
  typeId = btn.dataset.type;
  renderTypes();
  renderTop();
  input.value = "";
  openList();
  input.focus();
});

// ---- Top funds ----

const TOP_KEY = "doviz-faiz-top";

function renderTopControls() {
  $("top-period").innerHTML = RANK_PERIODS.map(
    (p) => `<button type="button" role="tab" aria-selected="${p.id === topPeriod}" data-period="${p.id}">${p.label}</button>`,
  ).join("");
  $("top-risk").innerHTML = RISK_GROUPS.map((g) => `<option value="${g.id}"${g.id === topRisk ? " selected" : ""}>${g.label}</option>`).join("");
}

function renderTop() {
  if (!funds.length) return;
  $("top-section").hidden = false;
  const { total, items, field } = topFunds(funds, { period: topPeriod, riskId: topRisk, typeId });
  const typeLabel = FUND_TYPES.find((x) => x.id === typeId)?.label;
  $("top-count").textContent = `${total} fon arasından ilk ${items.length}${typeId !== "all" ? ` · ${typeLabel}` : ""}`;
  const shownCodes = new Set([current?.fund.code, ...compare.map((c) => c.fund.code)]);
  const canAdd = compare.length < MAX_COMPARE;
  const rows = items
    .map(
      (f, i) => `<tr data-code="${escapeHtml(f.code)}" tabindex="0" class="${f.code === current?.fund.code ? "current" : ""}">
        <td class="rank">${i + 1}</td>
        <th scope="row"><span class="top-code">${escapeHtml(f.code)}</span><span class="sub">${escapeHtml(f.name)}</span></th>
        <td class="top-type">${escapeHtml(shortType(f.type))}</td>
        <td><span class="risk-badge risk-${f.risk}">${f.risk}</span></td>
        <td class="top-ret">${fmtPct(f[field], field === "return1m" ? 2 : 1)}</td>
        <td>${shownCodes.has(f.code) || !canAdd || !current ? "" : `<button type="button" class="chip top-add" data-add="${escapeHtml(f.code)}" title="Karşılaştırmaya ekle">+</button>`}</td>
      </tr>`,
    )
    .join("");
  $("top-table").innerHTML = items.length
    ? `<thead><tr><th>#</th><th>Fon</th><th class="top-type">Tür</th><th>Risk</th><th>${RANK_PERIODS.find((p) => p.id === topPeriod).label}</th><th></th></tr></thead><tbody>${rows}</tbody>`
    : `<tbody><tr><td class="muted">Bu filtrelerle fon yok.</td></tr></tbody>`;
}

$("top-period").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-period]");
  if (!btn) return;
  topPeriod = btn.dataset.period;
  saveTop();
  renderTopControls();
  renderTop();
});
$("top-risk").addEventListener("change", (e) => {
  topRisk = e.target.value;
  saveTop();
  renderTop();
});
$("top-table").addEventListener("click", (e) => {
  const add = e.target.closest("[data-add]");
  if (add) {
    addCompare(add.dataset.add);
    return;
  }
  const row = e.target.closest("tr[data-code]");
  if (!row) return;
  selectFund(row.dataset.code).then(() => $("fund-view").scrollIntoView({ behavior: "smooth", block: "start" }));
});
$("top-table").addEventListener("keydown", (e) => {
  const row = e.target.closest("tr[data-code]");
  if (row && e.key === "Enter") row.click();
});

function saveTop() {
  try {
    localStorage.setItem(TOP_KEY, JSON.stringify({ period: topPeriod, risk: topRisk }));
  } catch {
    // private mode
  }
}

function loadTop() {
  try {
    const v = JSON.parse(localStorage.getItem(TOP_KEY) || "{}");
    if (RANK_PERIODS.some((p) => p.id === v.period)) topPeriod = v.period;
    if (RISK_GROUPS.some((g) => g.id === v.risk)) topRisk = v.risk;
  } catch {
    // ignore
  }
  // Phones: start closed, so the chosen fund is not pushed far down.
  if (matchMedia("(max-width: 700px)").matches) $("top-details").open = false;
}

// ---- Combobox (search + dropdown) ----

function renderOptions() {
  const query = input.value.includes(" · ") ? "" : input.value; // the chosen fund's label is not a search
  const taken = new Set(pickFor === "compare" ? [current?.fund.code, ...compare.map((c) => c.fund.code)] : []);
  const found = searchFunds(index, query, { typeId, limit: 60 + taken.size });
  const items = found.items.filter((f) => !taken.has(f.code)).slice(0, 60);
  const total = found.total - [...taken].filter((c) => found.items.some((f) => f.code === c)).length;
  options = items;
  if (active >= options.length) active = options.length - 1;
  if (!items.length) {
    list.innerHTML = `<li class="combo-empty" role="presentation">Sonuç yok.</li>`;
    input.removeAttribute("aria-activedescendant");
    return;
  }
  list.innerHTML =
    items
      .map((f, i) => {
        const meta = [shortType(f.type), f.risk ? `risk ${f.risk}` : null, f.size ? `${compactTl.format(f.size)} TL` : null]
          .filter(Boolean)
          .join(" · ");
        return `<li role="option" id="opt-${i}" data-code="${escapeHtml(f.code)}" aria-selected="${i === active}" class="${i === active ? "active" : ""}">
          <span class="opt-code">${escapeHtml(f.code)}</span>
          <span class="opt-text"><span class="opt-title">${escapeHtml(f.name)}</span><span class="opt-meta">${escapeHtml(meta)}</span></span>
        </li>`;
      })
      .join("") +
    (total > items.length ? `<li class="combo-more" role="presentation">${total - items.length} fon daha · aramayı daraltın</li>` : "");
  if (active >= 0) input.setAttribute("aria-activedescendant", `opt-${active}`);
  else input.removeAttribute("aria-activedescendant");
}

function openList() {
  active = -1;
  renderOptions();
  list.hidden = false;
  input.setAttribute("aria-expanded", "true");
  list.scrollTop = 0;
}

function closeList() {
  list.hidden = true;
  input.setAttribute("aria-expanded", "false");
  input.removeAttribute("aria-activedescendant");
  active = -1;
}

function moveActive(step) {
  if (!options.length) return;
  active = (active + step + options.length) % options.length;
  renderOptions();
  $(`opt-${active}`)?.scrollIntoView({ block: "nearest" });
}

input.addEventListener("focus", () => {
  input.select();
  openList();
});
input.addEventListener("blur", () => {
  // Leaving the box without a choice: show the main fund again.
  setTimeout(() => {
    if (document.activeElement === input) return;
    if (pickFor === "compare") {
      pickFor = "main";
      renderCompareBar();
    }
    if (list.hidden && current) input.value = mainLabel();
  }, 0);
});
input.addEventListener("input", () => {
  if (list.hidden) openList();
  active = 0;
  renderOptions();
  list.scrollTop = 0;
});
input.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (list.hidden) openList();
    moveActive(1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    moveActive(-1);
  } else if (e.key === "Enter") {
    if (!list.hidden && options[active]) {
      e.preventDefault();
      choose(options[active].code);
      input.blur();
    }
  } else if (e.key === "Escape") {
    closeList();
    pickFor = "main";
    input.value = mainLabel();
    renderCompareBar();
  }
});
// pointerdown, not click: choose before the input loses focus and closes the list.
list.addEventListener("pointerdown", (e) => {
  const li = e.target.closest("[data-code]");
  if (!li) return;
  e.preventDefault();
  choose(li.dataset.code);
  input.blur();
});
$("combo-toggle").addEventListener("click", () => {
  if (list.hidden) {
    input.focus();
  } else {
    closeList();
    input.blur();
  }
});
document.addEventListener("pointerdown", (e) => {
  if (!$("combo").contains(e.target) && !$("fund-types").contains(e.target)) {
    if (!list.hidden) {
      closeList();
      pickFor = "main";
      input.value = mainLabel();
      renderCompareBar();
    }
  }
});

// ---- Fund view ----

// ---- Compare bar ----

const seriesColor = (i) => cssVar(SERIES_VARS[i % SERIES_VARS.length]);
const shown = () => (current ? [current, ...compare] : []);

function renderCompareBar() {
  const bar = $("compare-bar");
  bar.hidden = !current;
  if (!current) return;
  const chips = shown()
    .map((s, i) => {
      const swatch = `<span class="swatch" style="background:${seriesColor(i)}"></span>`;
      const remove = i === 0 ? "" : `<button type="button" class="chip-x" data-remove="${escapeHtml(s.fund.code)}" aria-label="${escapeHtml(s.fund.code)} karşılaştırmadan çıkar">×</button>`;
      return `<li class="compare-chip${i === 0 ? " main" : ""}" title="${escapeHtml(s.fund.name)}">${swatch}${escapeHtml(s.fund.code)}${remove}</li>`;
    })
    .join("");
  $("compare-list").innerHTML = chips;
  const add = $("compare-add");
  add.hidden = compare.length >= MAX_COMPARE;
  add.setAttribute("aria-pressed", String(pickFor === "compare"));
  const hint = $("compare-hint");
  hint.hidden = pickFor !== "compare";
  hint.textContent = "Karşılaştırmak için yukarıdan bir fon seçin.";
  input.placeholder = pickFor === "compare" ? "Karşılaştırılacak fonu arayın" : "Fon kodu veya adı yazın (ör. FI5, para piyasası)";
}

$("compare-list").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-remove]");
  if (btn) removeCompare(btn.dataset.remove);
});

// pointerdown keeps the focus in the search box (a click would blur it first).
$("compare-add").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  pickFor = "compare";
  renderCompareBar();
  input.value = "";
  input.focus();
  openList();
});
$("compare-add").addEventListener("click", () => {
  // keyboard activation
  if (pickFor === "compare") return;
  pickFor = "compare";
  renderCompareBar();
  input.value = "";
  input.focus();
  openList();
});

// ---- Fund view ----

function renderCompareTable() {
  const section = $("compare-section");
  section.hidden = !compare.length;
  if (!compare.length) return;
  const items = shown().map((s) => ({ ...s, sum: fundSummary(s.history) }));
  const best = (get) => {
    const vals = items.map(get).filter((v) => v != null);
    return vals.length ? Math.max(...vals) : null;
  };
  const row = (label, get, fmt, mark = true) => {
    const top = mark ? best(get) : null;
    return `<tr><th scope="row">${label}</th>${items
      .map((it) => {
        const v = get(it);
        return `<td class="${mark && v != null && v === top ? "best" : ""}">${v == null ? "–" : fmt(v)}</td>`;
      })
      .join("")}</tr>`;
  };
  const head = items
    .map((it, i) => `<th title="${escapeHtml(it.fund.name)}"><span class="swatch" style="background:${seriesColor(i)}"></span>${escapeHtml(it.fund.code)}</th>`)
    .join("");
  $("compare-table").innerHTML = `<thead><tr><th></th>${head}</tr></thead><tbody>
    ${row("Son 12 ay", (it) => it.sum.total, (v) => fmtPct(v, 1))}
    ${row("Son 3 ay", (it) => it.sum.r3m, (v) => fmtPct(v, 1))}
    ${row("Son 1 ay", (it) => it.sum.r1m, (v) => fmtPct(v, 2))}
    ${row("Aylık ortalama", (it) => it.sum.avgAnnual, (v) => `%${nf(1).format(v)}`)}
    ${row("Risk değeri", (it) => it.fund.risk, (v) => `${v} / 7`, false)}
    ${row("Büyüklük", (it) => it.fund.size, (v) => `${compactTl.format(v)} TL`, false)}
    <tr><th scope="row">Tür</th>${items.map((it) => `<td class="type-cell">${escapeHtml(shortType(it.fund.type))}</td>`).join("")}</tr>
  </tbody>`;
}

function renderFund() {
  const { fund, history } = current;
  const pts = history.points;
  const last = pts.at(-1);
  const { total, r3m, r1m, avgAnnual } = fundSummary(history);

  $("fund-view").hidden = false;
  $("fund-name").textContent = `${fund.code} · ${fund.name}`;
  $("fund-meta").textContent = shortType(fund.type);

  const tile = (title, value, note) => `<div class="tile"><h3>${title}</h3><div class="value">${value}</div><p>${note}</p></div>`;
  $("fund-tiles").innerHTML = [
    tile("Son 12 ay", fmtPct(total, 1), `${fmtDate(pts[0]?.date)} – ${fmtDate(last?.date)}`),
    tile("Son 3 ay", fmtPct(r3m, 1), "toplam getiri"),
    tile("Son 1 ay", fmtPct(r1m, 2), "toplam getiri"),
    tile("Aylık ortalama", avgAnnual == null ? "–" : `%${nf(1).format(avgAnnual)}`, "tam ayların yıllık eşdeğer ortalaması"),
    tile("Risk değeri", fund.risk ? `${fund.risk} <span class="small muted">/ 7</span>` : "–", fund.risk ? "SPK ölçeği" : "TEFAS'ta yayımlanmıyor"),
    tile("Büyüklük", fund.size ? `${compactTl.format(fund.size)} <span class="small">TL</span>` : "–", fund.investors ? `${nf(0).format(fund.investors)} yatırımcı` : "portföy değeri"),
    tile("Son fiyat", fmtPrice(last?.price), fmtDate(last?.date)),
  ].join("");

  renderCompareBar();
  renderCompareTable();
  renderTop();
  renderCurve();
  renderMonths();
  revealPage();
}

const baseOptions = (format, legend = false) => {
  const text = cssVar("--text-secondary");
  return {
    maintainAspectRatio: false,
    animation: { duration: 250 },
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: legend, position: "bottom", labels: { color: text, boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 2 } },
      tooltip: { callbacks: { label: (c) => (c.parsed.y == null ? null : `${legend ? `${c.dataset.label}: ` : ""}${format(c.parsed.y)}`) } },
    },
    scales: {
      x: { ticks: { color: text, maxTicksLimit: 7, maxRotation: 0 }, grid: { display: false } },
      y: { ticks: { color: text, callback: (v) => format(v) }, grid: { color: cssVar("--grid") } },
    },
  };
};

function renderCurve() {
  Chart.getChart($("fund-curve"))?.destroy();
  const items = shown();
  const { dates, series } = alignCurves(items.map((s) => s.history));
  const many = items.length > 1;
  new Chart($("fund-curve"), {
    type: "line",
    data: {
      labels: dates.map(fmtDate),
      datasets: items.map((s, i) => ({
        label: s.fund.code,
        data: series[i],
        borderColor: seriesColor(i),
        backgroundColor: seriesColor(i),
        borderWidth: i === 0 ? 2.5 : 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.15,
        spanGaps: true,
      })),
    },
    options: baseOptions((v) => `%${nf(1).format(v)}`, many),
  });
  const notes = items.map((s) => {
    const { first, last } = fundSummary(s.history);
    return first && last ? { code: s.fund.code, first, last, value: (100 * last.price) / first.price } : null;
  }).filter(Boolean);
  if (!notes.length) {
    $("curve-note").textContent = "";
  } else if (!many) {
    const n = notes[0];
    $("curve-note").textContent = `${fmtDate(n.first.date)} tarihinde yatırılan 100 TL, ${fmtDate(n.last.date)} tarihinde ${nf(2).format(n.value)} TL olur.`;
  } else {
    $("curve-note").textContent = `${fmtDate(notes[0].first.date)} tarihinde yatırılan 100 TL bugün: ${notes.map((n) => `${n.code} ${nf(2).format(n.value)} TL`).join(" · ")}.`;
  }
}

/**
 * Money market months differ by a few points only; from zero every bar looks the same.
 * When all values are positive, start the axis a little below the lowest month.
 */
function monthAxis(options, values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (values.length && min > 0 && max - min < min) {
    const step = mode === "annualized" ? 5 : 0.5;
    options.scales.y.min = Math.max(0, Math.floor((min - (max - min) * 0.6) / step) * step);
    options.scales.y.ticks.stepSize = step;
  }
  return options;
}

function renderMonths() {
  Chart.getChart($("fund-months"))?.destroy();
  const items = shown();
  const many = items.length > 1;
  const key = mode === "annualized" ? "annualized" : "pct";
  const { months, rows: byFund } = alignMonths(items.map((s) => s.history));
  const partialMonth = (k) => byFund.some((r) => r[months.indexOf(k)]?.partial);
  new Chart($("fund-months"), {
    type: "bar",
    data: {
      labels: months.map((k) => fmtMonth(k) + (partialMonth(k) ? "*" : "")),
      datasets: items.map((s, i) => {
        const color = seriesColor(i);
        return {
          label: s.fund.code,
          data: byFund[i].map((m) => (m ? m[key] : null)),
          backgroundColor: byFund[i].map((m) => (m?.partial ? withAlpha(color, 0.4) : color)),
          borderRadius: 4,
          maxBarThickness: many ? 16 : 36,
        };
      }),
    },
    options: monthAxis(
      baseOptions((v) => `%${nf(mode === "annualized" ? 1 : 2).format(v)}`, many),
      byFund.flat().filter(Boolean).map((m) => m[key]),
    ),
  });

  if (many) {
    const digits = mode === "annualized" ? 1 : 2;
    const fmt = (m) => (m == null ? "–" : mode === "annualized" ? `%${nf(digits).format(m.annualized)}` : fmtPct(m.pct, digits));
    const head = items.map((s, i) => `<th><span class="swatch" style="background:${seriesColor(i)}"></span>${escapeHtml(s.fund.code)}</th>`).join("");
    const body = months
      .map((k, j) => ({ k, j }))
      .reverse()
      .map(({ k, j }) => {
        const vals = byFund.map((r) => r[j]);
        const nums = vals.filter(Boolean).map((m) => m[key]);
        const top = nums.length > 1 ? Math.max(...nums) : null;
        return `<tr><th scope="row">${fmtMonth(k)}${partialMonth(k) ? `<span class="sub">ay bitmedi</span>` : ""}</th>${vals
          .map((m) => `<td class="${m && m[key] === top ? "best" : ""}">${fmt(m)}</td>`)
          .join("")}</tr>`;
      })
      .join("");
    $("month-table").innerHTML = `<thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody>`;
    return;
  }

  const singleMonths = current.history.months;
  const rows = singleMonths
    .slice()
    .reverse()
    .map(
      (m) => `<tr><th scope="row">${fmtMonth(m.month)}${m.partial ? `<span class="sub">${fmtDate(m.end)}'e kadar</span>` : ""}</th>
        <td>${fmtPct(m.pct, 2)}</td><td>%${nf(1).format(m.annualized)}</td><td>${m.days}</td></tr>`,
    )
    .join("");
  $("month-table").innerHTML = `<thead><tr><th></th><th>Aylık</th><th>Yıllık eşdeğer</th><th>Gün</th></tr></thead><tbody>${rows}</tbody>`;
}

$("month-mode").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-mode]");
  if (!btn || !current) return;
  mode = btn.dataset.mode;
  for (const b of $("month-mode").querySelectorAll("[data-mode]")) b.setAttribute("aria-selected", String(b.dataset.mode === mode));
  renderMonths();
});

// Redraw charts with the right colours when the system theme changes.
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (current) {
    renderCurve();
    renderMonths();
  }
});

// ---- Start ----

setupSidebar("funds");
renderTypes();
loadTop();
renderTopControls();

(async () => {
  try {
    await loadList();
    renderTop();
    // Read both saved choices first: choosing the main fund saves the state again.
    const params = new URL(location.href).searchParams;
    let start = params.get("kod")?.toUpperCase();
    let extra = params.get("karsilastir");
    try {
      start ??= localStorage.getItem(LAST_KEY);
      if (!params.has("kod")) extra ??= localStorage.getItem(COMPARE_KEY);
    } catch {
      // private mode
    }
    await selectFund(start && funds.some((f) => f.code === start) ? start : DEFAULT_FUND);
    const codes = (extra ?? "").toUpperCase().split(",").filter((c) => c && funds.some((f) => f.code === c));
    for (const c of codes.slice(0, MAX_COMPARE)) await addCompare(c);
  } catch (err) {
    $("error").textContent = err.message;
    $("error").hidden = false;
    $("source").textContent = "TEFAS";
  } finally {
    revealPage();
  }
})();
