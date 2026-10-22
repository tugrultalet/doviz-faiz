import type { DepositRates, Fund, FundHistory, Fx, GoldPoint, Indicators, Market, StatChart } from './types';

/** Netlify serves the API from a function and its CDN, so it never sleeps (Render's free plan did). */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://finans-n8x9.netlify.app').replace(/\/$/, '');

/** A cold EVDS fetch can take a few seconds; a dead connection should not hang the page. */
const TIMEOUT_MS = 30_000;

async function getJson<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}${path}`, { signal: controller.signal });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? 'Veri alınamadı. Daha sonra tekrar deneyin.');
    return body as T;
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new Error('Sunucu cevap vermedi. İnternet bağlantınızı kontrol edin.');
    if (err instanceof TypeError) throw new Error('Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchMarket(): Promise<Market> {
  const [fx, dep, ind] = await Promise.all([
    getJson<Fx>('/api/fx'),
    getJson<{ rates: DepositRates; error?: string }>('/api/deposit-rate').catch(() => ({ rates: null, error: undefined })),
    getJson<{ indicators: Indicators }>('/api/indicators').catch(() => ({ indicators: {} })),
  ]);
  return { fx, rates: dep.rates, depositError: dep.error, indicators: ind.indicators ?? {} };
}

export const fetchGold = () => getJson<{ points: GoldPoint[] }>('/api/gold').then((b) => b.points);
export const fetchStats = () => getJson<{ charts: StatChart[] }>('/api/stats').then((b) => b.charts);
export const fetchFunds = () => getJson<{ funds: Fund[] }>('/api/funds').then((b) => b.funds);
export const fetchFundHistory = (code: string) => getJson<FundHistory>(`/api/funds/${encodeURIComponent(code)}`);
