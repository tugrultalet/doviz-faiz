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
 * One TL<->FX conversion with its costs. `rates` = { USD, EUR } in TL (mid).
 * `spreadPct` is the bank's full buy/sell gap; each leg costs half of it.
 * `fxBuyTaxPct` (kambiyo vergisi / BSMV) is charged on FX purchases only, on top of the TL paid for the FX.
 * Returns { rate, net, spreadCostTl, taxTl }: net is in the target currency.
 */
export function leg(amount, from, to, rates, spreadPct, fxBuyTaxPct = 0) {
  const half = spreadPct / 200;
  if (from === to) return { rate: 1, net: amount, spreadCostTl: 0, taxTl: 0 };
  if (to === "TRY") {
    const rate = rates[from] * (1 - half);
    return { rate, net: amount * rate, spreadCostTl: amount * rates[from] * half, taxTl: 0 };
  }
  if (from !== "TRY") {
    // FX -> FX goes through TL.
    const a = leg(amount, from, "TRY", rates, spreadPct, fxBuyTaxPct);
    const b = leg(a.net, "TRY", to, rates, spreadPct, fxBuyTaxPct);
    return { rate: b.net / amount, net: b.net, spreadCostTl: a.spreadCostTl + b.spreadCostTl, taxTl: b.taxTl };
  }
  const rate = rates[to] * (1 + half);
  const spent = amount / (1 + fxBuyTaxPct / 100);
  const net = spent / rate;
  return { rate, net, spreadCostTl: net * rates[to] * half, taxTl: amount - spent };
}

export function convert(amount, from, to, rates, spreadPct, fxBuyTaxPct = 0) {
  return leg(amount, from, to, rates, spreadPct, fxBuyTaxPct).net;
}

export const OPTIONS = ["TRY", "BOND", "USD", "EUR"];

/**
 * [annual rate %, stopaj %] for keeping money in `option`.
 * USD and EUR have their own deposit rates (usdRate, eurRate) and share fxStopaj; fxRate is the fallback for both.
 */
export function terms(input, option) {
  if (option === "TRY") return [input.tlRate, input.tlStopaj];
  if (option === "BOND") return [input.bondRate ?? 0, input.bondStopaj ?? 0];
  const rate = (option === "USD" ? input.usdRate : input.eurRate) ?? input.fxRate ?? 0;
  return [rate, input.fxStopaj];
}

/**
 * Step by step: convert the input currency to `via` today, earn interest there, convert back at the end rate.
 * input: { amount, currency, days, tlRate, tlStopaj, usdRate, eurRate, fxStopaj, spread, fxBuyTax, now: {USD,EUR},
 *          bondRate?, bondStopaj? }
 */
export function roundTrip(input, end, via) {
  const { amount, currency, days, spread, now } = input;
  const held = via === "BOND" ? "TRY" : via;
  const out = leg(amount, currency, held, now, spread, input.fxBuyTax);
  const [rate, stopaj] = terms(input, via);
  const grossInterest = (out.net * rate * days) / 36500;
  const stopajAmount = (grossInterest * stopaj) / 100;
  const atMaturity = out.net + grossInterest - stopajAmount;
  const back = leg(atMaturity, held, currency, end, spread, input.fxBuyTax);
  return { held, rate, stopaj, out, grossInterest, stopajAmount, atMaturity, back, final: back.net };
}

/**
 * Value at the end of the term, in the input currency, for each way of keeping the money.
 * BOND (government bond / T-bill) is a TL holding with its own rate and stopaj; it is skipped when bondRate is not set.
 * realPct is the TL-based return after inflation; null when monthlyInflation is not set.
 */
export function compareOptions(input) {
  const { amount, currency, days, now, end } = input;
  const startTl = currency === "TRY" ? amount : amount * now[currency];
  const inflation = input.monthlyInflation == null ? null : Math.pow(1 + input.monthlyInflation / 100, days / 30);
  const result = {};
  for (const option of OPTIONS) {
    if (option === "BOND" && !(input.bondRate > 0)) continue;
    const trip = roundTrip(input, end, option);
    const final = trip.final;
    const tlValue = currency === "TRY" ? final : final * end[currency];
    result[option] = {
      trip,
      final,
      tlValue,
      gain: final - amount,
      gainPct: final / amount - 1,
      realPct: inflation == null ? null : tlValue / startTl / inflation - 1,
    };
  }
  return result;
}

/**
 * End-of-term FX/TRY rate at which keeping `fx` equals the TL deposit. Includes spread and purchase tax.
 * Holding TL (holdingFx = false): above this rate buying `fx` wins.
 * Holding `fx` (holdingFx = true): below this rate the trip to TL and back wins.
 */
export function breakEvenRate(rateNow, input, holdingFx = false, fx = holdingFx ? input.currency : "USD") {
  const half = input.spread / 200;
  const tax = 1 + (input.fxBuyTax ?? 0) / 100;
  const tl = netInterestFactor(...terms(input, "TRY"), input.days);
  const fxf = netInterestFactor(...terms(input, fx), input.days);
  return holdingFx
    ? (rateNow * (1 - half) * tl) / ((1 + half) * tax * fxf)
    : (rateNow * (1 + half) * tax * tl) / ((1 - half) * fxf);
}

export function projectRate(rateNow, dailyGrowth, days) {
  return rateNow * Math.pow(dailyGrowth, days);
}

/** Rate path that reaches `target` after `daysToTarget` days, evaluated after `days` days. */
export function projectToTarget(rateNow, target, daysToTarget, days) {
  return rateNow * Math.pow(target / rateNow, days / Math.max(1, daysToTarget));
}

export function daysUntilYearEnd(iso) {
  const year = Number(iso.slice(0, 4));
  return Math.round((Date.UTC(year, 11, 31) - Date.parse(iso)) / DAY_MS);
}

/** Monthly and annual inflation from a monthly price index. */
export function inflationStats(index) {
  if (index.length < 2) return null;
  const last = index.at(-1);
  const prev = index.at(-2);
  const yearAgo = index.length >= 13 ? index.at(-13) : null;
  return {
    date: last.date,
    monthly: last.value / prev.value - 1,
    annual: yearAgo ? last.value / yearAgo.value - 1 : null,
  };
}

/** Change of a level series (rate in %, or an index) over the last `days`. */
export function changeOver(series, days) {
  const last = series.at(-1);
  const past = valueOnOrBefore(series, shift(last.date, days));
  return { last, past, diff: last.value - past.value, pct: last.value / past.value - 1 };
}

/** Direction of an interest rate over `days`: moves under `threshold` points count as flat. */
export function rateDirection(series, days = 90, threshold = 0.5) {
  const c = changeOver(series, days);
  return { ...c, direction: c.diff <= -threshold ? "down" : c.diff >= threshold ? "up" : "flat" };
}

/** Share of the history at or below `value` (0..1). */
export function percentileOf(series, value) {
  return series.filter((p) => p.value <= value).length / series.length;
}

/**
 * What `amount` held in `held` is worth in TRY, USD and EUR at the end rates, after spread and purchase tax.
 * The value in the held currency is the amount itself.
 */
export function equivalents(amount, held, end, spreadPct, fxBuyTaxPct = 0) {
  return Object.fromEntries(["TRY", "USD", "EUR"].map((c) => [c, convert(amount, held, c, end, spreadPct, fxBuyTaxPct)]));
}

/** Reads a Turkish-formatted amount: "1.250.000,50" -> 1250000.5. Dots are thousands separators. */
export function parseAmount(text) {
  const n = Number(String(text).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Formats what the user typed with thousands dots, keeping a trailing comma and up to 2 decimals. */
export function formatAmountInput(text) {
  const clean = String(text).replace(/[^\d,]/g, "");
  const [intPart, ...rest] = clean.split(",");
  const digits = intPart.replace(/^0+(?=\d)/, "");
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return rest.length ? `${grouped || "0"},${rest.join("").slice(0, 2)}` : grouped;
}
