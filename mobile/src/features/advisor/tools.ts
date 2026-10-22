/**
 * Tools the voice advisor calls during a conversation. They run on the phone with the app's
 * own calculator and fund list, so the advisor quotes the same numbers as the screens.
 */
import { OPTION_LABELS, breakEvenItems, buildScenarios, readInput, trendsOf } from '@/features/model';
import { useAppStore } from '@/features/store';
import type { Currency, Fund } from '@/lib/types';

const round = (v: number, digits = 2) => Math.round(v * 10 ** digits) / 10 ** digits;

type CalcArgs = { tutar?: number; para_birimi?: Currency; gun?: number };
type FundArgs = { tur?: string; en_fazla_risk?: number; siralama?: '1ay' | '3ay' | '1yil'; kod?: string };

async function calculate(args: CalcArgs) {
  const store = useAppStore.getState();
  await store.loadMarket();
  const market = useAppStore.getState().market.data;
  const trends = trendsOf(market);
  if (!market || !trends) return { hata: 'Piyasa verisi alınamadı.' };

  const amount = Math.max(0, Math.round(Number(args.tutar) || 0));
  const currency: Currency = args.para_birimi === 'USD' || args.para_birimi === 'EUR' ? args.para_birimi : 'TRY';
  const days = Math.max(1, Math.round(Number(args.gun) || 32));
  if (!amount) return { hata: 'Tutar gerekli.' };

  // The user's own settings and typed rates apply, as on the calculator screen.
  const input = readInput(
    { amount: String(amount), currency, days: String(days), rates: store.rates, overrides: store.overrides },
    market,
  );
  const now = { USD: trends.USD.current.value, EUR: trends.EUR.current.value };
  const scenarios = buildScenarios(input, now, trends);
  return {
    girdi: { tutar: amount, para_birimi: currency, gun: days },
    kullanilan_faizler: { tl: input.tlRate, usd: input.usdRate, eur: input.eurRate, tl_stopaj: input.tlStopaj, doviz_stopaj: input.fxStopaj },
    bugunku_kur: { usd: round(now.USD, 4), eur: round(now.EUR, 4) },
    senaryolar: scenarios.map((sc) => ({
      senaryo: sc.title,
      vade_sonu_kur_tahmini: { usd: round(sc.end.USD, 4), eur: round(sc.end.EUR, 4) },
      en_iyi: OPTION_LABELS[sc.ranking[0]],
      secenekler: Object.fromEntries(
        sc.ranking.map((o) => {
          const r = sc.result[o]!;
          return [
            OPTION_LABELS[o],
            { vade_sonu_tutar: round(r.final), para_birimi: currency, getiri_yuzde: round(r.gainPct * 100), reel_getiri_yuzde: r.realPct == null ? null : round(r.realPct * 100) },
          ];
        }),
      ),
    })),
    basabas: breakEvenItems(input, now),
    not: 'Tutarlar stopaj, kur makası ve kambiyo vergisi düşülmüş nettir. Kur tahminleri geçmiş trende dayanır.',
  };
}

const lower = (s: string) => s.toLocaleLowerCase('tr-TR');

async function searchFunds(args: FundArgs) {
  await useAppStore.getState().loadFunds();
  const funds = useAppStore.getState().funds.data;
  if (!funds?.length) return { hata: 'Fon listesi alınamadı.' };

  const view = (f: Fund) => ({
    kod: f.code,
    ad: f.name,
    tur: f.type,
    risk: f.risk,
    getiri_1ay_yuzde: f.return1m,
    getiri_3ay_yuzde: f.return3m,
    getiri_1yil_yuzde: f.return1y,
    buyukluk_milyon_tl: f.size == null ? null : Math.round(f.size / 1e6),
  });

  if (args.kod) {
    const f = funds.find((x) => x.code === args.kod!.trim().toUpperCase());
    return f ? { fon: view(f) } : { hata: `${args.kod} kodlu fon bulunamadı.` };
  }
  const key = { '1ay': 'return1m', '3ay': 'return3m', '1yil': 'return1y' }[args.siralama ?? '1ay'] as 'return1m' | 'return3m' | 'return1y';
  const word = args.tur ? lower(args.tur) : null;
  const list = funds
    .filter((f) => f.tefas && f[key] != null && (f.size ?? 0) > 50_000_000)
    .filter((f) => args.en_fazla_risk == null || (f.risk ?? 9) <= args.en_fazla_risk)
    .filter((f) => !word || lower(`${f.type ?? ''} ${f.name}`).includes(word))
    .sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0))
    .slice(0, 6);
  return { siralama: args.siralama ?? '1ay', fonlar: list.map(view), not: 'Getiriler TEFAS verisidir, fon ücreti düşülmüş, stopaj öncesidir.' };
}

/** Runs one tool call; always answers with JSON text, errors included, so the advisor can explain them. */
export async function runTool(name: string, rawArgs: string): Promise<string> {
  try {
    const args = rawArgs ? JSON.parse(rawArgs) : {};
    if (name === 'hesapla') return JSON.stringify(await calculate(args));
    if (name === 'fon_ara') return JSON.stringify(await searchFunds(args));
    return JSON.stringify({ hata: `Bilinmeyen araç: ${name}` });
  } catch (err) {
    return JSON.stringify({ hata: (err as Error).message });
  }
}
