// Live data sources: TCMB EVDS (needs EVDS_API_KEY) with Frankfurter (ECB) as the FX fallback.

import { evdsSeries, type Point } from "./evds.js";

export type { Point };
export type FxData = { source: string; usd: Point[]; eur: Point[]; spread: { USD: number | null; EUR: number | null } };
export type DepositRate = { series: string; date: string; rate: number };

const FRANKFURTER_URL = "https://api.frankfurter.dev/v1";

// EVDS weighted average rates on new savings deposits (tasarruf mevduatı, flow, weekly), by term bucket.
// TP.<CUR>TAS.MT01 = up to 1 month, MT02 = up to 3 months, MT03 = up to 6 months, MT04 = up to 1 year, MT05 = longer.
export const DEPOSIT_CURRENCIES = ["TRY", "USD", "EUR"] as const;
export const DEPOSIT_TERMS = [
  { id: "upTo1Month", maxDays: 31, suffix: "MT01" },
  { id: "upTo3Months", maxDays: 91, suffix: "MT02" },
  { id: "upTo6Months", maxDays: 182, suffix: "MT03" },
  { id: "upTo1Year", maxDays: 365, suffix: "MT04" },
  { id: "over1Year", maxDays: Infinity, suffix: "MT05" },
] as const;
const depositCode = (cur: string, suffix: string) => process.env[`EVDS_DEPOSIT_${cur}_${suffix}`] ?? `TP.${cur}TAS.${suffix}`;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

function oneYearRange(now: Date) {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 400); // a bit more than a year so the 365-day lookback always has data
  return { start, end: now };
}

async function frankfurter(base: "USD" | "EUR", start: Date): Promise<Point[]> {
  const res = await fetch(`${FRANKFURTER_URL}/${isoDay(start)}..?base=${base}&symbols=TRY`);
  if (!res.ok) throw new Error(`Frankfurter ${res.status}`);
  const body = (await res.json()) as { rates: Record<string, { TRY: number }> };
  return Object.entries(body.rates)
    .map(([date, r]) => ({ date, value: r.TRY }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Mid rate from TCMB buying (A) and selling (S) rates, plus the latest gap between them in % of mid. */
export function midAndSpread(buy: Point[], sell: Point[]) {
  const sellByDate = new Map(sell.map((p) => [p.date, p.value]));
  const mid = buy.map((p) => {
    const s = sellByDate.get(p.date);
    return { date: p.date, value: s ? (p.value + s) / 2 : p.value };
  });
  const lastBuy = buy.at(-1);
  const lastSell = lastBuy && sellByDate.get(lastBuy.date);
  const spreadPct = lastBuy && lastSell ? ((lastSell - lastBuy.value) / ((lastSell + lastBuy.value) / 2)) * 100 : null;
  return { mid, spreadPct };
}

export async function fetchFx(key: string | undefined, now = new Date()): Promise<FxData> {
  const { start, end } = oneYearRange(now);
  if (key) {
    try {
      const codes = ["TP.DK.USD.A.YTL", "TP.DK.USD.S.YTL", "TP.DK.EUR.A.YTL", "TP.DK.EUR.S.YTL"];
      const s = await evdsSeries(codes, start, end, key);
      if (s[codes[0]].length && s[codes[2]].length) {
        const usd = midAndSpread(s[codes[0]], s[codes[1]]);
        const eur = midAndSpread(s[codes[2]], s[codes[3]]);
        return {
          source: "TCMB EVDS (döviz alış-satış ortalaması)",
          usd: usd.mid,
          eur: eur.mid,
          spread: { USD: usd.spreadPct, EUR: eur.spreadPct },
        };
      }
    } catch (err) {
      console.warn("EVDS FX failed, falling back to Frankfurter:", err);
    }
  }
  const [usd, eur] = await Promise.all([frankfurter("USD", start), frankfurter("EUR", start)]);
  return { source: "Avrupa Merkez Bankası (frankfurter.dev)", usd, eur, spread: { USD: null, EUR: null } };
}

export async function fetchDepositRates(key: string | undefined, now = new Date()) {
  if (!key) return null;
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 120);
  const codes = DEPOSIT_CURRENCIES.flatMap((cur) => DEPOSIT_TERMS.map((t) => depositCode(cur, t.suffix)));
  const s = await evdsSeries(codes, start, now, key);
  const latest = (code: string): DepositRate | null => {
    const p = s[code].at(-1);
    return p ? { series: code, date: p.date, rate: p.value } : null;
  };
  return Object.fromEntries(
    DEPOSIT_CURRENCIES.map((cur) => [
      cur,
      Object.fromEntries(DEPOSIT_TERMS.map((t) => [t.id, { ...latest(depositCode(cur, t.suffix)), maxDays: t.maxDays }])),
    ]),
  );
}
