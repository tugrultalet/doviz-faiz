import { useEffect, useMemo } from 'react';

import { Calculator } from '@/components/fx/Calculator';
import { FxCharts } from '@/components/fx/FxCharts';
import { Tiles } from '@/components/fx/Tiles';
import { TrendCards } from '@/components/fx/TrendCards';
import { ErrorNote, Screen, SectionTitle, T } from '@/components/ui';
import { indicatorTiles, readInput, trendsOf } from '@/features/model';
import { useAppStore } from '@/features/store';
import { fmtDate, fmtTime } from '@/lib/format';

export default function FxScreen() {
  const market = useAppStore((s) => s.market);
  const loadMarket = useAppStore((s) => s.loadMarket);
  const amount = useAppStore((s) => s.amount);
  const currency = useAppStore((s) => s.currency);
  const days = useAppStore((s) => s.days);
  const rates = useAppStore((s) => s.rates);
  const overrides = useAppStore((s) => s.overrides);

  useEffect(() => {
    void loadMarket();
  }, [loadMarket]);

  const data = market.data;
  const trends = useMemo(() => trendsOf(data), [data]);
  const input = useMemo(() => readInput({ amount, currency, days, rates, overrides }, data), [amount, currency, days, rates, overrides, data]);
  const tiles = useMemo(() => indicatorTiles(data, input), [data, input]);

  return (
    <Screen refreshing={market.loading && !!data} onRefresh={() => void loadMarket(true)}>
      {data && trends ? (
        <T v="caption" muted>
          {data.fx.source} · Son kur: {fmtDate(trends.USD.current.date)}
          {market.at ? ` · Güncelleme: ${fmtTime(market.at)}` : ''}
        </T>
      ) : null}
      {market.error ? <ErrorNote message={market.error} onRetry={() => void loadMarket(true)} /> : null}
      {!data && !market.error ? (
        <T muted>Veriler yükleniyor… Sunucu uykudaysa ilk açılış bir dakika sürebilir.</T>
      ) : null}
      {data && trends ? (
        <>
          <SectionTitle>Kur trendi</SectionTitle>
          <TrendCards trends={trends} />
          <FxCharts fx={data.fx} trends={trends} />
          <SectionTitle>Piyasa göstergeleri</SectionTitle>
          <Tiles tiles={tiles} />
          <SectionTitle>Döviz mi, faiz mi?</SectionTitle>
          {data.depositError ? <ErrorNote message={data.depositError} /> : null}
          <Calculator market={data} trends={trends} input={input} />
          <T v="caption" muted>
            Tahminler geçmiş trende dayanır. Yatırım tavsiyesi değildir.
          </T>
        </>
      ) : null}
    </Screen>
  );
}
