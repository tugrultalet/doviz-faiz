import { FUND_TYPES, cumulativeCurve, indexFunds, returnOverDays, searchFunds } from "./fundsearch.js";
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
const DEFAULT_FUND = "FI5";

let funds = [];
let index = [];
let typeId = "all";
let options = []; // funds now shown in the list
let active = -1; // highlighted option
let current = null; // { fund, history }
let mode = "annualized";
let requestId = 0;

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

async function selectFund(code, { focusList = false } = {}) {
  const fund = funds.find((f) => f.code === code) ?? { code, name: code };
  input.value = `${fund.code} · ${fund.name}`;
  closeList();
  if (focusList) input.focus();
  try {
    localStorage.setItem(LAST_KEY, fund.code);
  } catch {
    // private mode
  }
  const url = new URL(location.href);
  url.searchParams.set("kod", fund.code);
  history.replaceState(null, "", url);

  const id = ++requestId;
  $("error").hidden = true;
  $("fund-view").classList.add("loading");
  try {
    const res = await fetch(`/api/funds/${encodeURIComponent(fund.code)}`);
    const body = await res.json();
    if (id !== requestId) return; // a newer choice is on the way
    if (!res.ok) throw new Error(body.error ?? "Fon verisi alınamadı.");
    current = { fund: { ...fund, name: body.name ?? fund.name }, history: body };
    renderFund();
  } catch (err) {
    if (id !== requestId) return;
    $("error").textContent = err.message;
    $("error").hidden = false;
  } finally {
    if (id === requestId) $("fund-view").classList.remove("loading");
  }
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
  input.value = "";
  openList();
  input.focus();
});

// ---- Combobox (search + dropdown) ----

function renderOptions() {
  const query = input.value.includes(" · ") ? "" : input.value; // the chosen fund's label is not a search
  const { total, items } = searchFunds(index, query, { typeId });
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
      selectFund(options[active].code);
      input.blur();
    }
  } else if (e.key === "Escape") {
    closeList();
    if (current) input.value = `${current.fund.code} · ${current.fund.name}`;
  }
});
// pointerdown, not click: choose before the input loses focus and closes the list.
list.addEventListener("pointerdown", (e) => {
  const li = e.target.closest("[data-code]");
  if (!li) return;
  e.preventDefault();
  selectFund(li.dataset.code);
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
      if (current) input.value = `${current.fund.code} · ${current.fund.name}`;
    }
  }
});

// ---- Fund view ----

function renderFund() {
  const { fund, history } = current;
  const pts = history.points;
  const last = pts.at(-1);
  const total = pts.length > 1 ? (last.price / pts[0].price - 1) * 100 : null;
  const months = history.months;
  const full = months.filter((m) => !m.partial);
  const avgAnnual = full.length ? full.reduce((s, m) => s + m.annualized, 0) / full.length : null;

  $("fund-view").hidden = false;
  $("fund-name").textContent = `${fund.code} · ${fund.name}`;
  $("fund-meta").textContent = shortType(fund.type);

  const tile = (title, value, note) => `<div class="tile"><h3>${title}</h3><div class="value">${value}</div><p>${note}</p></div>`;
  $("fund-tiles").innerHTML = [
    tile("Son 12 ay", fmtPct(total, 1), `${fmtDate(pts[0]?.date)} – ${fmtDate(last?.date)}`),
    tile("Son 3 ay", fmtPct(returnOverDays(pts, 91), 1), "toplam getiri"),
    tile("Son 1 ay", fmtPct(returnOverDays(pts, 30), 2), "toplam getiri"),
    tile("Aylık ortalama", avgAnnual == null ? "–" : `%${nf(1).format(avgAnnual)}`, "tam ayların yıllık eşdeğer ortalaması"),
    tile("Risk değeri", fund.risk ? `${fund.risk} <span class="small muted">/ 7</span>` : "–", fund.risk ? "SPK ölçeği" : "TEFAS'ta yayımlanmıyor"),
    tile("Büyüklük", fund.size ? `${compactTl.format(fund.size)} <span class="small">TL</span>` : "–", fund.investors ? `${nf(0).format(fund.investors)} yatırımcı` : "portföy değeri"),
    tile("Son fiyat", fmtPrice(last?.price), fmtDate(last?.date)),
  ].join("");

  renderCurve();
  renderMonths();
  revealPage();
}

const baseOptions = (format) => {
  const text = cssVar("--text-secondary");
  return {
    maintainAspectRatio: false,
    animation: { duration: 250 },
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => format(c.parsed.y) } } },
    scales: {
      x: { ticks: { color: text, maxTicksLimit: 7, maxRotation: 0 }, grid: { display: false } },
      y: { ticks: { color: text, callback: (v) => format(v) }, grid: { color: cssVar("--grid") } },
    },
  };
};

function renderCurve() {
  Chart.getChart($("fund-curve"))?.destroy();
  const curve = cumulativeCurve(current.history.points);
  const accent = cssVar("--accent");
  new Chart($("fund-curve"), {
    type: "line",
    data: {
      labels: curve.map((p) => fmtDate(p.date)),
      datasets: [{ data: curve.map((p) => p.pct), borderColor: accent, backgroundColor: accent, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.15 }],
    },
    options: baseOptions((v) => `%${nf(1).format(v)}`),
  });
  const lastPct = curve.at(-1)?.pct;
  $("curve-note").textContent =
    lastPct == null ? "" : `${fmtDate(curve[0].date)} tarihinde yatırılan 100 TL, ${fmtDate(curve.at(-1).date)} tarihinde ${nf(2).format(100 + lastPct)} TL olur.`;
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
  const months = current.history.months;
  const accent = cssVar("--accent");
  const faded = withAlpha(accent, 0.4);
  const key = mode === "annualized" ? "annualized" : "pct";
  new Chart($("fund-months"), {
    type: "bar",
    data: {
      labels: months.map((m) => fmtMonth(m.month) + (m.partial ? "*" : "")),
      datasets: [{ data: months.map((m) => m[key]), backgroundColor: months.map((m) => (m.partial ? faded : accent)), borderRadius: 4, maxBarThickness: 36 }],
    },
    options: monthAxis(baseOptions((v) => `%${nf(mode === "annualized" ? 1 : 2).format(v)}`), months.map((m) => m[key])),
  });

  const rows = months
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

(async () => {
  try {
    await loadList();
    let start = new URL(location.href).searchParams.get("kod")?.toUpperCase();
    if (!start) {
      try {
        start = localStorage.getItem(LAST_KEY);
      } catch {
        // private mode
      }
    }
    await selectFund(start && funds.some((f) => f.code === start) ? start : DEFAULT_FUND);
  } catch (err) {
    $("error").textContent = err.message;
    $("error").hidden = false;
    $("source").textContent = "TEFAS";
  } finally {
    revealPage();
  }
})();
