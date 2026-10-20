// Pure calculation helpers. Shared by the browser (app.js) and the tests.
// A series is [{ date: "YYYY-MM-DD", value: number }] sorted by date.

const DAY_MS = 86400000;
export const WINDOW_DAYS = 30;

const shift = (iso, days) => new Date(Date.parse(iso) - days * DAY_MS).toISOString().slice(0, 10);

/** Value on the given day, or the last value before it (weekends/holidays have no rate). */
export function valueOnOrBefore(series, iso) {
  let found = null;
  for (const p of series) {
    if (p.date > iso) break;
    found = p;
  }
  return found ?? series[0];
}

/**
 * Trend statistics: 12 rolling 30-day changes (index 0 = the last 30 days),
 * the 1-year change, and whether the last month is faster than the 11 months before it.
 */
export function trendStats(series) {
  const last = series.at(-1);
  const months = [];
  for (let i = 0; i < 12; i++) {
    const end = valueOnOrBefore(series, shift(last.date, i * WINDOW_DAYS));
    const start = valueOnOrBefore(series, shift(last.date, (i + 1) * WINDOW_DAYS));
    months.push({ start: start.date, end: end.date, change: end.value / start.value - 1 });
  }
  const yearAgo = valueOnOrBefore(series, shift(last.date, 365));
  const yearChange = last.value / yearAgo.value - 1;
  const lastMonth = months[0].change;
  const previous = months.slice(1);
  const prevAvg = Math.pow(previous.reduce((acc, m) => acc * (1 + m.change), 1), 1 / previous.length) - 1;

  return {
    current: last,
    yearAgo,
    yearChange,
    months,
    lastMonth,
    prevAvg,
    verdict: verdict(lastMonth, prevAvg),
    dailyGrowthYear: Math.pow(1 + yearChange, 1 / 365),
    dailyGrowthMonth: Math.pow(1 + lastMonth, 1 / WINDOW_DAYS),
  };
}

/** "faster" / "slower" / "same": a 15% band around the previous average counts as the same speed. */
export function verdict(lastMonth, prevAvg) {
  const band = Math.max(Math.abs(prevAvg) * 0.15, 0.001);
  if (lastMonth > prevAvg + band) return "faster";
  if (lastMonth < prevAvg - band) return "slower";
  return "same";
}

/** Turkish withholding (stopaj) on TL deposits, valid until 31.12.2026 (CB decision 11444). */
export function tlStopajForDays(days) {
  if (days <= 182) return 17.5;
  if (days <= 365) return 15;
  return 10;
}

/** Net interest factor after withholding, simple interest on an actual/365 basis. */
export function netInterestFactor(annualRatePct, stopajPct, days) {
  return 1 + (annualRatePct / 100) * (days / 365) * (1 - stopajPct / 100);
}

/**
 * Convert between TRY/USD/EUR through TL. `rates` = { USD, EUR } in TL (mid).
 * `spreadPct` is the bank's full buy/sell gap; each TL<->FX leg costs half of it.
 */
export function convert(amount, from, to, rates, spreadPct) {
  if (from === to) return amount;
  const half = spreadPct / 200;
  const tl = from === "TRY" ? amount : amount * rates[from] * (1 - half);
  return to === "TRY" ? tl : tl / (rates[to] * (1 + half));
}

/**
 * Value at the end of the term, in the input currency, for keeping the money as TRY, USD or EUR.
 * input: { amount, currency, days, tlRate, tlStopaj, fxRate, fxStopaj, spread, now: {USD,EUR}, end: {USD,EUR} }
 */
export function compareOptions(input) {
  const { amount, currency, days, spread, now, end } = input;
  const result = {};
  for (const option of ["TRY", "USD", "EUR"]) {
    const start = convert(amount, currency, option, now, spread);
    const grown =
      option === "TRY"
        ? start * netInterestFactor(input.tlRate, input.tlStopaj, days)
        : start * netInterestFactor(input.fxRate, input.fxStopaj, days);
    const final = convert(grown, option, currency, end, spread);
    const tlValue = currency === "TRY" ? final : final * end[currency];
    result[option] = { final, tlValue, gain: final - amount, gainPct: final / amount - 1 };
  }
  return result;
}

/**
 * FX rate at the end of the term at which holding the currency equals the TL deposit.
 * Above this rate the currency wins. Includes the round-trip spread.
 */
export function breakEvenRate(rateNow, input) {
  const half = input.spread / 200;
  const tl = netInterestFactor(input.tlRate, input.tlStopaj, input.days);
  const fx = netInterestFactor(input.fxRate, input.fxStopaj, input.days);
  return (rateNow * tl * (1 + half)) / ((1 - half) * fx);
}

export function projectRate(rateNow, dailyGrowth, days) {
  return rateNow * Math.pow(dailyGrowth, days);
}
