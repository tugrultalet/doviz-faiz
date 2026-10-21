import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { LineChart } from '@/components/LineChart';
import { Card, ErrorNote, Grid, half, Screen, SectionTitle, Segmented, Swatch, T } from '@/components/ui';
import { useAppStore } from '@/features/store';
import { monthsBetween, periodReturn } from '@/lib/calc';
import { fmtMonth, fmtPct, nf } from '@/lib/format';
import type { GoldPoint } from '@/lib/types';
import { useTheme } from '@/theme';

type Field = 'tlGram' | 'usdOunce';
type Return = { pct: number; cagr: number | null } | null;

const compact = new Intl.NumberFormat('tr-TR', { notation: 'compact', compactDisplay: 'long', maximumFractionDigits: 1 });
/** Very large rises read better as "N kat" (times) than as a percentage. */
const fmtGrowth = (v: number) => (v >= 99 ? `${compact.format(1 + v)} kat` : fmtPct(v, 1));
/** 1950s prices are fractions of a kuruş in today's TL: significant digits instead of 0,00. */
const fmtPrice = (v: number) =>
  v >= 10 ? nf(0).format(v) : v >= 0.01 ? nf(2).format(v) : v.toLocaleString('tr-TR', { maximumSignificantDigits: 2 });

const PERIODS: [string, number][] = [
  ['1 ay', 1],
  ['1 yıl', 12],
  ['5 yıl', 60],
  ['10 yıl', 120],
  ['20 yıl', 240],
];
const RANGES = [
  { key: '60', label: '5 yıl' },
  { key: '120', label: '10 yıl' },
  { key: 'all', label: 'Tümü' },
];

export default function GoldScreen() {
  const t = useTheme();
  const gold = useAppStore((s) => s.gold);
  const loadGold = useAppStore((s) => s.loadGold);
  const [range, setRange] = useState('all');

  useEffect(() => {
    void loadGold();
  }, [loadGold]);

  const points = gold.data;
  return (
    <Screen refreshing={gold.loading && !!points} onRefresh={() => void loadGold(true)}>
      {gold.error ? <ErrorNote message={gold.error} onRetry={() => void loadGold(true)} /> : null}
      {!points && !gold.error ? <T muted>Altın verisi yükleniyor…</T> : null}
      {points?.length ? (
        <>
          <T v="caption" muted>
            TCMB EVDS · {fmtMonth(points[0].date)} – {fmtMonth(points.at(-1)!.date)} ({points.length} ay)
          </T>
          <Grid>
            <PriceCard points={points} field="tlGram" title="Gram altın" unit="TL" digits={2} color={t.gold} />
            <PriceCard points={points} field="usdOunce" title="Ons altın" unit="USD" digits={0} color={t.gold} />
          </Grid>
          <SectionTitle>Getiri</SectionTitle>
          <Returns points={points} />
          <SectionTitle>Fiyat geçmişi</SectionTitle>
          <Segmented options={RANGES} value={range} onChange={setRange} />
          <Charts points={points} range={range} />
          <T v="caption" muted>
            Kaynak: TCMB EVDS. Gram: külçe altın satış fiyatı. Ons: Londra. Aylık ortalamalar. Yatırım tavsiyesi değildir.
          </T>
        </>
      ) : null}
    </Screen>
  );
}

const lastOf = (points: GoldPoint[], field: Field) => [...points].reverse().find((p) => p[field] != null);

function PriceCard({ points, field, title, unit, digits, color }: { points: GoldPoint[]; field: Field; title: string; unit: string; digits: number; color: string }) {
  const last = lastOf(points, field);
  if (!last) return null;
  const r: Return = periodReturn(points, field, 12);
  return (
    <Card style={half}>
      <View style={styles.head}>
        <Swatch color={color} />
        <T v="sub" style={{ fontWeight: '600' }}>
          {title}
        </T>
      </View>
      <T v="big" num numberOfLines={1} adjustsFontSizeToFit>
        {nf(digits).format(last[field]!)} <T v="sub" muted>{unit}</T>
      </T>
      <T v="caption" muted>
        Son 1 yıl: {r ? fmtPct(r.pct, 1) : '–'} · {fmtMonth(last.date)}
      </T>
    </Card>
  );
}

function Returns({ points }: { points: GoldPoint[] }) {
  const t = useTheme();
  const all = (field: Field): Return => {
    const valid = points.filter((p) => p[field] != null);
    return valid.length > 1 ? periodReturn(points, field, monthsBetween(valid[0].date, valid.at(-1)!.date)) : null;
  };
  const rows: { label: string; sub?: string; tl: Return; usd: Return }[] = PERIODS.map(([label, m]) => ({
    label,
    tl: periodReturn(points, 'tlGram', m),
    usd: periodReturn(points, 'usdOunce', m),
  }));
  rows.push({ label: 'Tüm dönem', sub: `${fmtMonth(points[0].date)}'den`, tl: all('tlGram'), usd: all('usdOunce') });
  const cell = (r: Return) => (
    <View style={styles.cell}>
      <T v="sub" num style={{ fontWeight: '600' }}>
        {r ? fmtGrowth(r.pct) : '–'}
      </T>
      {r?.cagr != null ? (
        <T v="caption" muted num>
          yıllık {fmtPct(r.cagr, 1)}
        </T>
      ) : null}
    </View>
  );
  return (
    <Card style={{ gap: 0 }}>
      <View style={[styles.tr, { borderBottomColor: t.separator }]}>
        <View style={{ flex: 1 }} />
        <T v="caption" muted style={styles.th}>
          TL (gram)
        </T>
        <T v="caption" muted style={styles.th}>
          USD (ons)
        </T>
      </View>
      {rows.map((r, i) => (
        <View key={r.label} style={[styles.tr, i < rows.length - 1 && { borderBottomColor: t.separator }]}>
          <View style={{ flex: 1 }}>
            <T v="sub">{r.label}</T>
            {r.sub ? (
              <T v="caption" muted>
                {r.sub}
              </T>
            ) : null}
          </View>
          {cell(r.tl)}
          {cell(r.usd)}
        </View>
      ))}
      <T v="caption" muted style={{ marginTop: 8 }}>
        Aylık ortalama fiyatlarla hesaplanır. &quot;Yıllık&quot;, dönemin yıllık bileşik getirisidir.
      </T>
    </Card>
  );
}

function Charts({ points, range }: { points: GoldPoint[]; range: string }) {
  const t = useTheme();
  const shown = useMemo(() => (range === 'all' ? points : points.slice(-(Number(range) + 1))), [points, range]);
  const labels = shown.map((p) => fmtMonth(p.date));
  return (
    <Card style={{ gap: 8 }}>
      <T v="sub" style={{ fontWeight: '600' }}>
        Gram altın (TL) <T v="caption" muted>· logaritmik ölçek</T>
      </T>
      <LineChart labels={labels} series={[{ label: 'Gram', color: t.gold, values: shown.map((p) => p.tlGram) }]} format={(v) => `${fmtPrice(v)} TL`} log />
      <T v="sub" style={{ fontWeight: '600', marginTop: 8 }}>
        Ons altın (USD)
      </T>
      <LineChart labels={labels} series={[{ label: 'Ons', color: t.gold, values: shown.map((p) => p.usdOunce) }]} format={(v) => `${nf(0).format(v)} $`} />
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'transparent' },
  th: { width: 104, textAlign: 'right', fontWeight: '600' },
  cell: { width: 104, alignItems: 'flex-end' },
});
