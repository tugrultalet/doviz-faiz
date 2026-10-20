// Macro indicators from EVDS. Each code can be overridden with an env var (EVDS_<ID>).
// An empty code means "not configured yet": the page then asks the user for the value.

import { evdsSeries, type Point } from "./evds.js";

export type IndicatorId =
  | "cpi"
  | "fundingCost"
  | "expUsdYearEnd"
  | "hhInflationExp"
  | "reer"
  | "reserves"
  | "fxDeposits"
  | "bondYield";

type Def = { label: string; code: string; rangeDays: number };

const env = (id: string, fallback: string) => process.env[`EVDS_${id.toUpperCase()}`] ?? fallback;

export const INDICATORS: Record<IndicatorId, Def> = {
  cpi: { label: "TÜFE (2003=100)", code: env("cpi", "TP.FG.J0"), rangeDays: 500 },
  fundingCost: { label: "TCMB ağırlıklı ortalama fonlama maliyeti (%)", code: env("fundingCost", "TP.APIFON4"), rangeDays: 200 },
  expUsdYearEnd: { label: "Piyasa katılımcıları: yıl sonu USD/TRY beklentisi", code: env("expUsdYearEnd", ""), rangeDays: 400 },
  hhInflationExp: { label: "Hanehalkı 12 ay sonrası enflasyon beklentisi (%)", code: env("hhInflationExp", ""), rangeDays: 400 },
  reer: { label: "TÜFE bazlı reel efektif döviz kuru (2003=100)", code: env("reer", "TP.RK.T1.Y"), rangeDays: 3650 },
  reserves: { label: "TCMB brüt döviz rezervleri", code: env("reserves", ""), rangeDays: 400 },
  fxDeposits: { label: "Yurt içi yerleşiklerin döviz mevduatı", code: env("fxDeposits", ""), rangeDays: 400 },
  bondYield: { label: "Devlet tahvili / bono faizi (%)", code: env("bondYield", ""), rangeDays: 120 },
};

export type IndicatorResult = { label: string; series: string; points?: Point[]; error?: string };

export async function fetchIndicators(key: string | undefined, now = new Date()) {
  const out = {} as Record<IndicatorId, IndicatorResult>;
  await Promise.all(
    (Object.entries(INDICATORS) as [IndicatorId, Def][]).map(async ([id, def]) => {
      const base = { label: def.label, series: def.code };
      if (!key) return void (out[id] = { ...base, error: "no-key" });
      if (!def.code) return void (out[id] = { ...base, error: "not-configured" });
      const start = new Date(now);
      start.setUTCDate(start.getUTCDate() - def.rangeDays);
      try {
        const points = (await evdsSeries([def.code], start, now, key))[def.code];
        out[id] = points.length ? { ...base, points } : { ...base, error: "empty" };
      } catch (err) {
        out[id] = { ...base, error: (err as Error).message };
      }
    }),
  );
  return out;
}
