// Live data sources: TCMB EVDS (needs EVDS_API_KEY) with Frankfurter (ECB) as the FX fallback.

export type Point = { date: string; value: number }; // date as YYYY-MM-DD
export type FxData = { source: string; usd: Point[]; eur: Point[] };
export type DepositRate = { series: string; date: string; rate: number };

const EVDS_URL = process.env.EVDS_BASE_URL ?? "https://evds3.tcmb.gov.tr/igmevdsms-dis";
const FRANKFURTER_URL = "https://api.frankfurter.dev/v1";

// EVDS series for TL deposit rates (weighted average, flow data). Override with env if TCMB changes codes.
export const DEPOSIT_SERIES = {
  upTo1Month: process.env.EVDS_DEPOSIT_1M ?? "TP.TRY.MT02",
  upTo3Months: process.env.EVDS_DEPOSIT_3M ?? "TP.TRY.MT03",
};

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const evdsDay = (d: Date) => isoDay(d).split("-").reverse().join("-"); // DD-MM-YYYY

function oneYearRange(now: Date) {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 400); // a bit more than a year so the 365-day lookback always has data
  return { start, end: now };
}

async function evdsSeries(codes: string[], start: Date, end: Date, key: string) {
  const url = `${EVDS_URL}/series=${codes.join("-")}&startDate=${evdsDay(start)}&endDate=${evdsDay(end)}&type=json`;
  const res = await fetch(url, { headers: { key } });
  if (!res.ok) throw new Error(`EVDS ${res.status}`);
  const body = (await res.json()) as { items?: Record<string, unknown>[] };
  const out: Record<string, Point[]> = Object.fromEntries(codes.map((c) => [c, []]));
  for (const item of body.items ?? []) {
    const [dd, mm, yyyy] = String(item.Tarih).split("-");
    if (!yyyy) continue;
    for (const code of codes) {
      const raw = item[code.replaceAll(".", "_")];
      const value = raw == null || raw === "" ? NaN : Number(raw);
      if (Number.isFinite(value)) out[code].push({ date: `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`, value });
    }
  }
  return out;
}

async function frankfurter(base: "USD" | "EUR", start: Date): Promise<Point[]> {
  const res = await fetch(`${FRANKFURTER_URL}/${isoDay(start)}..?base=${base}&symbols=TRY`);
  if (!res.ok) throw new Error(`Frankfurter ${res.status}`);
  const body = (await res.json()) as { rates: Record<string, { TRY: number }> };
  return Object.entries(body.rates)
    .map(([date, r]) => ({ date, value: r.TRY }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchFx(key: string | undefined, now = new Date()): Promise<FxData> {
  const { start, end } = oneYearRange(now);
  if (key) {
    try {
      const s = await evdsSeries(["TP.DK.USD.A.YTL", "TP.DK.EUR.A.YTL"], start, end, key);
      if (s["TP.DK.USD.A.YTL"].length && s["TP.DK.EUR.A.YTL"].length) {
        return { source: "TCMB EVDS (döviz alış kuru)", usd: s["TP.DK.USD.A.YTL"], eur: s["TP.DK.EUR.A.YTL"] };
      }
    } catch (err) {
      console.warn("EVDS FX failed, falling back to Frankfurter:", err);
    }
  }
  const [usd, eur] = await Promise.all([frankfurter("USD", start), frankfurter("EUR", start)]);
  return { source: "Avrupa Merkez Bankası (frankfurter.dev)", usd, eur };
}

export async function fetchDepositRates(key: string | undefined, now = new Date()) {
  if (!key) return null;
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 120);
  const codes = [DEPOSIT_SERIES.upTo1Month, DEPOSIT_SERIES.upTo3Months];
  const s = await evdsSeries(codes, start, now, key);
  const latest = (code: string): DepositRate | null => {
    const p = s[code].at(-1);
    return p ? { series: code, date: p.date, rate: p.value } : null;
  };
  return { upTo1Month: latest(codes[0]), upTo3Months: latest(codes[1]) };
}
