/** A daily or monthly value. Dates are "YYYY-MM-DD" (monthly series use the 1st). */
export type Point = { date: string; value: number };

export type Fx = {
  source: string;
  usd: Point[];
  eur: Point[];
  /** TCMB buy/sell gap in %, null when only mid rates are known. */
  spread: { USD?: number; EUR?: number } | null;
};

export type TermKey = 'upTo1Month' | 'upTo3Months' | 'upTo6Months' | 'upTo1Year' | 'over1Year';
export type DepositRate = { series?: string; date?: string; rate?: number };
export type DepositRates = Record<'TRY' | 'USD' | 'EUR', Record<TermKey, DepositRate>> | null;

export type IndicatorId =
  | 'cpi'
  | 'fundingCost'
  | 'expUsdYearEnd'
  | 'hhInflationExp'
  | 'reer'
  | 'reserves'
  | 'fxDeposits'
  | 'bondYield';
export type Indicators = Partial<Record<IndicatorId, { points?: Point[]; error?: string }>>;

export type Market = {
  fx: Fx;
  rates: DepositRates;
  depositError?: string;
  indicators: Indicators;
};

export type GoldPoint = { date: string; tlGram: number | null; usdOunce: number | null };

export type StatSeries = { code: string; label: string; points: Point[] };
export type StatChart = {
  id: string;
  section: string;
  title: string;
  explain: string;
  unit: string;
  transform: 'level' | 'yoy' | 'sum12';
  reference?: { value: number; label: string };
  series: StatSeries[];
  error?: string;
};

export type Currency = 'TRY' | 'USD' | 'EUR';

/** One investment fund in the TEFAS list (`/api/funds`). */
export type Fund = {
  code: string;
  name: string;
  type: string | null;
  /** SPK risk value 1–7; only for funds traded on TEFAS. */
  risk: number | null;
  size: number | null;
  investors: number | null;
  price: number | null;
  date: string | null;
  return1y: number | null;
  tefas: boolean;
};

export type FundMonth = { month: string; end: string; pct: number; annualized: number; days: number; partial: boolean };
/** 12 months of daily prices for one fund (`/api/funds/:code`). */
export type FundHistory = { code: string; name: string | null; points: { date: string; price: number }[]; months: FundMonth[] };
