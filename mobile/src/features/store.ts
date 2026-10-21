import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { fetchGold, fetchMarket, fetchStats } from '@/lib/api';
import type { Currency, GoldPoint, Market, StatChart } from '@/lib/types';

export type SettingKey = 'tlStopaj' | 'fxStopaj' | 'bondStopaj' | 'fxBuyTax' | 'spread' | 'tlGap' | 'inflation' | 'bondRate';
export type Appearance = 'system' | 'light' | 'dark';
export type RateKey = 'tlRate' | 'usdRate' | 'eurRate';

/** Data from the API with the time it arrived; kept on the phone so the app opens with the last data. */
type Loaded<T> = { data: T | null; at: number | null; loading: boolean; error: string | null };
const empty = <T,>(): Loaded<T> => ({ data: null, at: null, loading: false, error: null });

type State = {
  appearance: Appearance;
  /** Settings the user changed; the rest use automatic values (see model.ts). */
  overrides: Partial<Record<SettingKey, number>>;
  amount: string;
  currency: Currency;
  days: string;
  /** Deposit rates the user typed; null = TCMB-based default. */
  rates: Record<RateKey, string | null>;
  market: Loaded<Market>;
  gold: Loaded<GoldPoint[]>;
  stats: Loaded<StatChart[]>;

  setAppearance: (a: Appearance) => void;
  setOverride: (key: SettingKey, value: number | null) => void;
  resetOverrides: () => void;
  setAmount: (text: string) => void;
  setCurrency: (c: Currency) => void;
  setDays: (text: string) => void;
  setRate: (key: RateKey, text: string | null) => void;
  loadMarket: (force?: boolean) => Promise<void>;
  loadGold: (force?: boolean) => Promise<void>;
  loadStats: (force?: boolean) => Promise<void>;
};

/** The server refreshes its data hourly; a newer copy than this is not worth a request. */
const FRESH_MS = 15 * 60 * 1000;

type LoadedKey = 'market' | 'gold' | 'stats';

export const useAppStore = create<State>()(
  persist(
    (set, get) => {
      async function load<K extends LoadedKey>(key: K, fetcher: () => Promise<State[K]['data']>, force?: boolean) {
        const cur = get()[key];
        if (cur.loading) return;
        if (!force && cur.data && cur.at && Date.now() - cur.at < FRESH_MS) return;
        set({ [key]: { ...cur, loading: true, error: null } } as Partial<State>);
        try {
          const data = await fetcher();
          set({ [key]: { data, at: Date.now(), loading: false, error: null } } as Partial<State>);
        } catch (err) {
          set({ [key]: { ...get()[key], loading: false, error: (err as Error).message } } as Partial<State>);
        }
      }

      return {
        appearance: 'system',
        overrides: {},
        amount: '100.000',
        currency: 'TRY',
        days: '32',
        rates: { tlRate: null, usdRate: null, eurRate: null },
        market: empty(),
        gold: empty(),
        stats: empty(),

        setAppearance: (appearance) => set({ appearance }),
        setOverride: (key, value) =>
          set((s) => {
            const overrides = { ...s.overrides };
            if (value == null || !Number.isFinite(value)) delete overrides[key];
            else overrides[key] = value;
            return { overrides };
          }),
        resetOverrides: () => set({ overrides: {} }),
        setAmount: (amount) => set({ amount }),
        setCurrency: (currency) => set({ currency }),
        setDays: (days) => set({ days }),
        setRate: (key, text) => set((s) => ({ rates: { ...s.rates, [key]: text } })),
        loadMarket: (force) => load('market', fetchMarket, force),
        loadGold: (force) => load('gold', fetchGold, force),
        loadStats: (force) => load('stats', fetchStats, force),
      };
    },
    {
      name: 'finans-store',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      // Keep inputs, settings and the last data; never a running request or an old error.
      partialize: (s) => ({
        appearance: s.appearance,
        overrides: s.overrides,
        amount: s.amount,
        currency: s.currency,
        days: s.days,
        rates: s.rates,
        market: { ...s.market, loading: false, error: null },
        gold: { ...s.gold, loading: false, error: null },
        stats: { ...s.stats, loading: false, error: null },
      }),
    },
  ),
);
