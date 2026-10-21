import { useMemo } from 'react';

import { alignTo, type Trends } from '@/features/model';
import { paritySeries, trendStats } from '@/lib/calc';
import { fmtDate, nf } from '@/lib/format';
import type { Fx } from '@/lib/types';
import { useTheme } from '@/theme';
import { LineChart } from '../LineChart';
import { Collapsible, Legend, T } from '../ui';

const pct = (v: number) => `%${nf(Math.abs(v) < 10 ? 1 : 0).format(v)}`;

/** USD/TRY, EUR/TRY and EUR/USD as % change: over the year, and per 30-day period. */
export function FxCharts({ fx, trends }: { fx: Fx; trends: Trends }) {
  const t = useTheme();
  const data = useMemo(() => {
    const parity = paritySeries(fx.eur, fx.usd);
    const lines = [
      { label: 'USD/TRY', color: t.usd, values: fx.usd.map((p) => p.value) as (number | null)[] },
      { label: 'EUR/TRY', color: t.eur, values: alignTo(fx.usd, fx.eur) },
      { label: 'EUR/USD', color: t.parity, values: alignTo(fx.usd, parity) },
    ];
    const year = lines.map((s) => {
      const first = s.values.find((v) => v != null) ?? 1;
      return { ...s, values: s.values.map((v) => (v == null ? null : (v / first - 1) * 100)) };
    });
    // Rightmost = the last 30 days.
    const months = [...trends.USD.months].reverse();
    const monthly = [trends.USD.months, trends.EUR.months, trendStats(parity).months];
    const periods = lines.map((s, k) => ({ ...s, values: [...monthly[k]].reverse().map((m: { change: number }) => m.change * 100) }));
    return {
      yearLabels: fx.usd.map((p) => fmtDate(p.date).slice(0, 5) + '.' + p.date.slice(2, 4)),
      year,
      monthLabels: months.map((m) => fmtDate(m.end).slice(0, 5)),
      periods,
    };
  }, [fx, trends, t]);

  return (
    <Collapsible title="Grafikler">
      <Legend items={data.year} />
      <T v="sub" style={{ fontWeight: '600', marginTop: 4 }}>
        Son 1 yılda değişim
      </T>
      <LineChart labels={data.yearLabels} series={data.year} format={pct} reference={0} />
      <T v="sub" style={{ fontWeight: '600', marginTop: 8 }}>
        30 günlük dönemlerde değişim
      </T>
      <LineChart labels={data.monthLabels} series={data.periods} format={pct} reference={0} dots height={170} />
    </Collapsible>
  );
}
