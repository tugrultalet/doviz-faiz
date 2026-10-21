/**
 * The website's page logic (public/app.js) as pure functions: automatic settings,
 * TCMB-based default rates, the calculator input, scenarios and indicator tiles.
 */
import {
  breakEvenRate,
  changeOver,
  compareOptions,
  inflationStats,
  parseAmount,
  paritySeries,
  projectRate,
  rateDirection,
  realRate,
  tlStopajForDays,
  trendStats,
  valueOnOrBefore,
} from '@/lib/calc';
import { fmtDate, fmtPct, fmtRate, nf } from '@/lib/format';
import type { Currency, IndicatorId, Market, Point, TermKey } from '@/lib/types';
import type { RateKey, SettingKey } from './store';

export const FALLBACK_SPREAD = 1; // % when TCMB buy/sell rates are not available

export const OPTION_LABELS = { TRY: "TL'de faizde tut", BOND: 'Tahvil / bonoda tut', USD: 'Dolarda dur', EUR: 'Euroda dur' } as const;
export type Option = keyof typeof OPTION_LABELS;
export const SYMBOL: Record<Currency, string> = { TRY: 'TL', USD: 'USD', EUR: 'EUR' };
export const VERDICT = { faster: '↑ Hızlandı', slower: '↓ Yavaşladı', same: '→ Aynı hızda' } as const;

export type Trend = ReturnType<typeof trendStats>;
export type Trends = { USD: Trend; EUR: Trend };

export const trendsOf = (market: Market | null): Trends | null =>
  market?.fx.usd.length && market.fx.eur.length ? { USD: trendStats(market.fx.usd), EUR: trendStats(market.fx.eur) } : null;

export const pointsOf = (market: Market | null, id: IndicatorId): Point[] | null => {
  const pts = market?.indicators[id]?.points;
  return pts?.length ? pts : null;
};

// ---- Settings ----------------------------------------------------------------

export const SETTINGS: { key: SettingKey; label: string; unit: string }[] = [
  { key: 'tlStopaj', label: 'TL mevduat stopajı', unit: '%' },
  { key: 'fxStopaj', label: 'Döviz mevduat stopajı', unit: '%' },
  { key: 'bondStopaj', label: 'Tahvil / bono stopajı', unit: '%' },
  { key: 'fxBuyTax', label: 'Kambiyo vergisi (döviz alışı)', unit: '%' },
  { key: 'spread', label: 'Kur makası (alış-satış farkı)', unit: '%' },
  { key: 'tlGap', label: 'Banka faizi farkı (TCMB ort. altı)', unit: 'puan' },
  { key: 'inflation', label: 'Aylık enflasyon', unit: '%' },
  { key: 'bondRate', label: 'Tahvil / bono faizi (yıllık)', unit: '%' },
];

type Ctx = { market: Market | null; days: number };

/** Automatic value and its explanation for each setting. */
export function autoSetting(key: SettingKey, { market, days }: Ctx): { value: number | null; hint?: string } {
  switch (key) {
    case 'tlStopaj':
      return { value: tlStopajForDays(days), hint: 'Vadeye göre: 6 aya kadar %17,5, 1 yıla kadar %15, daha uzun %10.' };
    case 'fxStopaj':
      return { value: 25 };
    case 'bondStopaj':
      return { value: 0 };
    case 'fxBuyTax':
      return { value: 0.2 };
    case 'tlGap':
      return { value: 4, hint: 'Bankalar genelde TCMB ortalamasının altında faiz verir.' };
    case 'spread': {
      const s = market?.fx.spread;
      const vals = [s?.USD, s?.EUR].filter((v): v is number => v != null);
      if (!vals.length) return { value: FALLBACK_SPREAD, hint: `TCMB alış-satış verisi yok. Varsayılan %${nf(2).format(FALLBACK_SPREAD)}.` };
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      return {
        value: Number(avg.toFixed(2)),
        hint: `TCMB alış-satış farkı (USD %${nf(2).format(s?.USD ?? avg)}, EUR %${nf(2).format(s?.EUR ?? avg)}). Bankanızın makası daha yüksekse değiştirin.`,
      };
    }
    case 'inflation': {
      const cpi = pointsOf(market, 'cpi');
      const inf = cpi && inflationStats(cpi);
      return inf
        ? { value: Number((inf.monthly * 100).toFixed(2)), hint: `Son TÜFE (${fmtDate(inf.date).slice(3)}). Reel getiri için kullanılır.` }
        : { value: null, hint: 'Boşsa reel getiri gösterilmez.' };
    }
    case 'bondRate': {
      const bond = pointsOf(market, 'bondYield')?.at(-1);
      return { value: bond ? Number(bond.value.toFixed(2)) : null, hint: 'Boşsa tahvil seçeneği gösterilmez.' };
    }
  }
}

export function settingValue(key: SettingKey, overrides: Partial<Record<SettingKey, number>>, ctx: Ctx) {
  return overrides[key] ?? autoSetting(key, ctx).value;
}

// ---- Deposit rates ----------------------------------------------------------------

const TERMS: [TermKey, number, string][] = [
  ['upTo1Month', 31, '1 aya kadar'],
  ['upTo3Months', 91, '3 aya kadar'],
  ['upTo6Months', 182, '6 aya kadar'],
  ['upTo1Year', 365, '1 yıla kadar'],
  ['over1Year', Infinity, '1 yıldan uzun'],
];

/** TCMB average savings deposit rate for the term bucket of `days`; nearest bucket when that one has no data. */
export function tcmbDepositRate(market: Market | null, currency: Currency, days: number) {
  const r = market?.rates?.[currency];
  if (!r) return null;
  const idx = TERMS.findIndex(([, max]) => days <= max);
  for (const i of [idx, idx + 1, idx - 1, idx + 2, idx - 2]) {
    const t = TERMS[i];
    const v = t && r[t[0]];
    if (v?.rate != null) return { rate: v.rate, date: v.date ?? '', term: t[2] };
  }
  return null;
}

/** Default rate and its explanation for each rate field. */
export function autoRates(ctx: Ctx, tlGap: number): Record<RateKey, { value: number; hint: string }> {
  const tl = tcmbDepositRate(ctx.market, 'TRY', ctx.days);
  const fx = (c: Currency) => {
    const d = tcmbDepositRate(ctx.market, c, ctx.days);
    return d
      ? { value: Number(d.rate.toFixed(2)), hint: `TCMB ortalaması (${d.term} vadeli, ${fmtDate(d.date)}).` }
      : { value: 0, hint: 'Bankanızın oranını yazın.' };
  };
  return {
    tlRate: tl
      ? {
          value: Number(Math.max(0, tl.rate - tlGap).toFixed(2)),
          hint: `TCMB ortalaması %${nf(2).format(tl.rate)} (${tl.term}, ${fmtDate(tl.date)}). Bankalar genelde ${nf(0).format(tlGap)} puan altında verir.`,
        }
      : { value: 38, hint: 'TCMB verisi yok. Bankanızın oranını yazın.' },
    usdRate: fx('USD'),
    eurRate: fx('EUR'),
  };
}

// ---- Calculator ------------------------------------------------------------------

export type Input = {
  amount: number;
  currency: Currency;
  days: number;
  tlRate: number;
  usdRate: number;
  eurRate: number;
  tlStopaj: number;
  fxStopaj: number;
  bondStopaj: number;
  fxBuyTax: number;
  spread: number;
  monthlyInflation: number | null;
  bondRate: number | null;
};

export type FormState = {
  amount: string;
  currency: Currency;
  days: string;
  rates: Record<RateKey, string | null>;
  overrides: Partial<Record<SettingKey, number>>;
};

export const parseDays = (text: string) => Math.max(1, Math.round(Number(text)) || 32);
const num = (text: string | null) => Number(String(text ?? '').replace(',', '.')) || 0;

export function readInput(form: FormState, market: Market | null): Input {
  const ctx = { market, days: parseDays(form.days) };
  const setting = (k: SettingKey) => settingValue(k, form.overrides, ctx);
  const auto = autoRates(ctx, setting('tlGap') ?? 0);
  const rate = (k: RateKey) => (form.rates[k] == null ? auto[k].value : num(form.rates[k]));
  const bondRate = setting('bondRate');
  return {
    amount: parseAmount(form.amount),
    currency: form.currency,
    days: ctx.days,
    tlRate: rate('tlRate'),
    usdRate: rate('usdRate'),
    eurRate: rate('eurRate'),
    tlStopaj: setting('tlStopaj') ?? 0,
    fxStopaj: setting('fxStopaj') ?? 0,
    bondStopaj: setting('bondStopaj') ?? 0,
    fxBuyTax: setting('fxBuyTax') ?? 0,
    spread: setting('spread') ?? FALLBACK_SPREAD,
    monthlyInflation: setting('inflation'),
    bondRate: bondRate != null && bondRate > 0 ? bondRate : null,
  };
}

export type Rates = { USD: number; EUR: number };
type Leg = { rate: number; net: number; spreadCostTl: number; taxTl: number };
/** One option of compareOptions() in calc.js. */
export type OptionResult = {
  trip: {
    held: Currency;
    rate: number;
    stopaj: number;
    out: Leg;
    grossInterest: number;
    stopajAmount: number;
    atMaturity: number;
    back: Leg;
    final: number;
  };
  final: number;
  tlValue: number;
  gain: number;
  gainPct: number;
  realPct: number | null;
};
export type Scenario = {
  short: string;
  title: string;
  end: Rates;
  result: Partial<Record<Option, OptionResult>>;
  ranking: Option[];
};

export function buildScenarios(input: Input, now: Rates, trends: Trends): Scenario[] {
  const trend = (growth: 'dailyGrowthYear' | 'dailyGrowthMonth'): Rates => ({
    USD: projectRate(now.USD, trends.USD[growth], input.days),
    EUR: projectRate(now.EUR, trends.EUR[growth], input.days),
  });
  const year = trend('dailyGrowthYear');
  const month = trend('dailyGrowthMonth');
  const base = [
    { short: '1 yıllık trend', title: 'Kur 1 yıllık trendle giderse', end: year },
    { short: 'Son 30 gün', title: 'Kur son 30 günlük trendle giderse', end: month },
    // Average trend: the mean of the two forecast rates above.
    { short: 'Ortalama', title: 'Kur iki trendin ortalamasıyla giderse', end: { USD: (year.USD + month.USD) / 2, EUR: (year.EUR + month.EUR) / 2 } },
  ];
  return base.map((sc) => {
    const result = compareOptions({ ...input, now, end: sc.end }) as Scenario['result'];
    const ranking = (Object.keys(result) as Option[]).sort((a, b) => result[b]!.final - result[a]!.final);
    return { ...sc, result, ranking };
  });
}

/** Rate at which the decision flips, for each relevant currency. */
export function breakEvenItems(input: Input, now: Rates) {
  const holdingFx = input.currency !== 'TRY';
  return (holdingFx ? [input.currency as 'USD' | 'EUR'] : (['USD', 'EUR'] as const)).map((c) => {
    const be = breakEvenRate(now[c], input, holdingFx, c);
    return holdingFx
      ? `${c} ${input.days} gün sonra ${fmtRate(be)} altında kalırsa TL faiz kazandırır.`
      : `${c} ${fmtRate(be)} üstüne çıkarsa (${fmtPct(be / now[c] - 1)}) ${c} kazandırır.`;
  });
}

export function rateNote(market: Market | null) {
  const fc = pointsOf(market, 'fundingCost');
  const dir = fc && rateDirection(fc, 90);
  if (dir?.direction === 'down') return 'Faizler düşüş döneminde. Uzun vade bugünkü oranı kilitler.';
  if (dir?.direction === 'up') return 'Faizler yükseliş döneminde. Kısa vade daha esnektir.';
  return null;
}

// ---- Indicator tiles -----------------------------------------------------------------

export type Tile = { id: string; title: string; value: string; unit?: string; note: string };

export function indicatorTiles(market: Market | null, input: Input): Tile[] {
  if (!market) return [];
  const tiles: Tile[] = [];
  const fx = market.fx;

  const cpi = pointsOf(market, 'cpi');
  const inf = cpi && inflationStats(cpi);
  if (inf)
    tiles.push({
      id: 'cpi',
      title: 'Enflasyon (TÜFE)',
      value: fmtPct(inf.monthly),
      unit: 'aylık',
      note: `Yıllık: ${inf.annual == null ? '–' : fmtPct(inf.annual, 1)} · ${fmtDate(inf.date).slice(3)}`,
    });

  const fc = pointsOf(market, 'fundingCost');
  const dir = fc && rateDirection(fc, 90);
  const dirText = { down: '↓ Düşüş döneminde', up: '↑ Yükseliş döneminde', flat: '→ Yatay' } as const;
  if (dir)
    tiles.push({
      id: 'fundingCost',
      title: 'TCMB fonlama faizi',
      value: `%${nf(2).format(dir.last.value)}`,
      note: `${dirText[dir.direction as keyof typeof dirText]} (3 ayda ${dir.diff >= 0 ? '+' : ''}${nf(2).format(dir.diff)} puan)`,
    });

  const exp = pointsOf(market, 'expUsdYearEnd')?.at(-1);
  const usdNow = fx.usd.at(-1)?.value;
  if (exp && usdNow)
    tiles.push({
      id: 'expUsdYearEnd',
      title: 'Yıl sonu USD/TRY beklentisi',
      value: fmtRate(exp.value),
      note: `Bugüne göre ${fmtPct(exp.value / usdNow - 1)}`,
    });

  const hh = pointsOf(market, 'hhInflationExp')?.at(-1);
  if (hh)
    tiles.push({
      id: 'hhInflationExp',
      title: 'Hanehalkı enflasyon beklentisi',
      value: `%${nf(1).format(hh.value)}`,
      note: `12 ay sonrası · ${fmtDate(hh.date).slice(3)}`,
    });

  // 2003 = 100: above 100 the TL is worth more in real terms than in 2003, below 100 less.
  const reer = pointsOf(market, 'reer')?.at(-1);
  if (reer)
    tiles.push({
      id: 'reer',
      title: 'Reel efektif kur',
      value: nf(1).format(reer.value),
      note:
        reer.value >= 100
          ? `100 üzerinde: TL reel olarak pahalı (2003'e göre %${nf(1).format(reer.value - 100)}).`
          : `100 altında: TL reel olarak ucuz (2003'e göre %${nf(1).format(100 - reer.value)}).`,
    });

  // Both in billions of USD. Reserves come in million USD; FX deposits in thousand TL, converted at each date's USD/TRY.
  const toUsdBn = {
    reserves: (p: Point) => p.value / 1000,
    fxDeposits: (p: Point) => (p.value * 1000) / valueOnOrBefore(fx.usd, p.date).value / 1e9,
  };
  for (const [id, title] of [
    ['reserves', 'TCMB rezervleri'],
    ['fxDeposits', 'Yerleşiklerin döviz mevduatı'],
  ] as const) {
    const pts = pointsOf(market, id)?.map((p) => ({ date: p.date, value: toUsdBn[id](p) }));
    if (!pts?.length) continue;
    const c = changeOver(pts, 90);
    tiles.push({ id, title, value: nf(1).format(c.last.value), unit: 'milyar $', note: `3 ayda ${fmtPct(c.pct, 1)} · ${fmtDate(c.last.date)}` });
  }

  const bond = pointsOf(market, 'bondYield')?.at(-1);
  if (bond) tiles.push({ id: 'bondYield', title: 'Tahvil / bono faizi', value: `%${nf(2).format(bond.value)}`, note: fmtDate(bond.date) });

  // Real TL rate: the TL deposit rate after stopaj, against last year's inflation.
  if (inf?.annual != null) {
    const net = (input.tlRate / 100) * (1 - input.tlStopaj / 100);
    const real = realRate(net, inf.annual);
    tiles.push({
      id: 'realRate',
      title: 'Reel TL faizi (yıllık)',
      value: fmtPct(real, 1),
      note: `Net faiz %${nf(1).format(net * 100)} − enflasyon %${nf(1).format(inf.annual * 100)}. ${
        real >= 0 ? 'Faiz enflasyonu geçiyor.' : 'Faiz enflasyonun altında.'
      }`,
    });
  }

  const parity = paritySeries(fx.eur, fx.usd);
  if (parity.length > 30) {
    const m = changeOver(parity, 30);
    const y = changeOver(parity, 365);
    tiles.push({
      id: 'parity',
      title: 'EUR/USD paritesi',
      value: nf(4).format(m.last.value),
      note: `30 günde ${fmtPct(m.pct)} · 1 yılda ${fmtPct(y.pct, 1)}`,
    });
  }
  return tiles;
}

/** Second series aligned to the dates of the first; gaps keep the last known value. */
export function alignTo(base: Point[], other: Point[]): (number | null)[] {
  const byDate = new Map(other.map((p) => [p.date, p.value]));
  let last: number | null = null;
  return base.map((p) => (last = byDate.get(p.date) ?? last));
}
