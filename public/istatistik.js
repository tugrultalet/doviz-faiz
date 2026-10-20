import { setupSidebar } from "./ui.js";

const $ = (id) => document.getElementById(id);
const nf = (digits) => new Intl.NumberFormat("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const fmtMonth = (iso) => `${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const SERIES_COLORS = ["--series-usd", "--series-eur", "--series-parity"]; // categorical slots 1-3

let charts = [];

/** Value formatting by the chart's unit and transform. */
function formatter(chart) {
  if (chart.unit.startsWith("milyon $")) return (v) => `${nf(1).format(v / 1000)} milyar $`;
  if (chart.transform === "yoy" || chart.unit.startsWith("%")) return (v) => `%${nf(1).format(v)}`;
  return (v) => nf(1).format(v);
}

const slug = (s) => s.toLocaleLowerCase("tr-TR").replace(/[^a-z0-9ğüşöçı]+/g, "-");

function render() {
  const sections = [...new Set(charts.map((c) => c.section))];
  $("stat-jump").innerHTML = sections.map((s) => `<a href="#${slug(s)}">${s}</a>`).join("");
  $("stat-sections").innerHTML = sections
    .map(
      (section) => `
      <section id="${slug(section)}">
        <h2>${section}</h2>
        <div class="stat-grid">
          ${charts
            .filter((c) => c.section === section)
            .map((c) => card(c))
            .join("")}
        </div>
      </section>`,
    )
    .join("");
  drawCharts();
}

function card(c) {
  const fmt = formatter(c);
  const withData = (c.series ?? []).filter((s) => s.points.length);
  const latest = withData
    .map((s, i) => {
      const last = s.points.at(-1);
      return `<li><span class="swatch" style="background:var(${SERIES_COLORS[i % 3]})"></span>${s.label}: <strong>${fmt(last.value)}</strong> <span class="muted">(${fmtMonth(last.date)})</span></li>`;
    })
    .join("");
  const body = withData.length
    ? `<ul class="stat-latest">${latest}</ul><div class="chart stat-chart"><canvas id="chart-${c.id}" aria-label="${c.title}"></canvas></div>`
    : `<p class="muted small">Veri alınamadı.</p>`;
  return `
    <article class="card stat-card">
      <h3>${c.title}</h3>
      <p class="stat-explain">${c.explain}</p>
      ${body}
    </article>`;
}

function drawCharts() {
  const text = cssVar("--text-secondary");
  const grid = cssVar("--grid");
  for (const c of charts) {
    const canvas = $(`chart-${c.id}`);
    if (!canvas) continue;
    Chart.getChart(canvas)?.destroy();
    const fmt = formatter(c);
    // One shared month axis across the chart's series.
    const months = [...new Set(c.series.flatMap((s) => s.points.map((p) => p.date)))].sort();
    const datasets = c.series
      .filter((s) => s.points.length)
      .map((s, i) => {
        const byDate = new Map(s.points.map((p) => [p.date, p.value]));
        const color = cssVar(SERIES_COLORS[i % 3]);
        return { label: s.label, data: months.map((d) => byDate.get(d) ?? null), borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.15, spanGaps: true };
      });
    if (c.reference) {
      datasets.push({ label: c.reference.label, data: months.map(() => c.reference.value), borderColor: cssVar("--text-muted"), borderWidth: 1, borderDash: [4, 4], pointRadius: 0, pointHoverRadius: 0, isReference: true });
    }
    new Chart(canvas, {
      type: "line",
      data: { labels: months.map(fmtMonth), datasets },
      options: {
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            display: datasets.filter((d) => !d.isReference).length > 1,
            labels: { color: text, usePointStyle: true, pointStyle: "rectRounded", filter: (item, data) => !data.datasets[item.datasetIndex].isReference },
          },
          tooltip: {
            filter: (item) => !item.dataset.isReference,
            callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` },
          },
        },
        scales: {
          x: { ticks: { color: text, maxTicksLimit: 6 }, grid: { display: false } },
          y: { ticks: { color: text, callback: (v) => fmt(v) }, grid: { color: grid } },
        },
      },
    });
  }
}

async function load() {
  try {
    const res = await fetch("/api/stats");
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "İstatistik verisi alınamadı.");
    charts = body.charts;
    $("source").textContent = `Türkiye ekonomisinin genel gidişatı · TCMB EVDS · ${charts.length} gösterge`;
    render();
  } catch (err) {
    $("error").textContent = err.message;
    $("error").hidden = false;
  }
}

setupSidebar("stats");
// Redraw charts when the theme changes so they pick up the new colours.
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", drawCharts);
load();
