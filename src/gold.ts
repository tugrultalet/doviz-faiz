// Gold prices from EVDS (Ankara Kuyumcular ve Saatçiler Odası, monthly averages, from December 1950):
// bullion gold in TL per gram and London gold in USD per troy ounce.

import { evdsSeries } from "./evds.js";

export const GOLD_TL_CODE = process.env.EVDS_GOLD_TL ?? "TP.MK.KUL.YTL";
export const GOLD_USD_CODE = process.env.EVDS_GOLD_USD ?? "TP.MK.LON.YTL";
const EARLIEST = new Date(Date.UTC(1950, 0, 1)); // EVDS returns data from the first available month

export type GoldPoint = { date: string; tlGram: number | null; usdOunce: number | null };

export async function fetchGold(key: string | undefined, now = new Date()) {
  if (!key) return null;
  const s = await evdsSeries([GOLD_TL_CODE, GOLD_USD_CODE], EARLIEST, now, key, { frequency: 5, aggregation: "avg" });
  const byDate = new Map<string, GoldPoint>();
  for (const p of s[GOLD_TL_CODE]) byDate.set(p.date, { date: p.date, tlGram: p.value, usdOunce: null });
  for (const p of s[GOLD_USD_CODE]) {
    const row = byDate.get(p.date) ?? { date: p.date, tlGram: null, usdOunce: null };
    row.usdOunce = p.value;
    byDate.set(p.date, row);
  }
  const points = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  return { series: { tl: GOLD_TL_CODE, usd: GOLD_USD_CODE }, points };
}
