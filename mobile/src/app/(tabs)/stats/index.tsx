import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { LineChart } from '@/components/LineChart';
import { Card, ErrorNote, Screen, SectionTitle, Swatch, T, tap } from '@/components/ui';
import { useAppStore } from '@/features/store';
import { fmtMonth, nf } from '@/lib/format';
import type { StatChart } from '@/lib/types';
import { useTheme, type Theme } from '@/theme';

/** Value formatting by the chart's unit and transform (same as the website). */
function formatter(chart: StatChart) {
  if (chart.unit.startsWith('milyon $')) return (v: number) => `${nf(1).format(v / 1000)} milyar $`;
  if (chart.transform === 'yoy' || chart.unit.startsWith('%')) return (v: number) => `%${nf(1).format(v)}`;
  return (v: number) => nf(1).format(v);
}

const colorsOf = (t: Theme) => [t.usd, t.eur, t.parity];

export default function StatsScreen() {
  const t = useTheme();
  const stats = useAppStore((s) => s.stats);
  const loadStats = useAppStore((s) => s.loadStats);
  const [section, setSection] = useState<string | null>(null);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const charts = stats.data;
  const sections = useMemo(() => [...new Set((charts ?? []).map((c) => c.section))], [charts]);
  const shown = section ? sections.filter((s) => s === section) : sections;

  return (
    <Screen refreshing={stats.loading && !!charts} onRefresh={() => void loadStats(true)}>
      {stats.error ? <ErrorNote message={stats.error} onRetry={() => void loadStats(true)} /> : null}
      {!charts && !stats.error ? <T muted>İstatistikler yükleniyor…</T> : null}
      {charts ? (
        <>
          <T v="caption" muted>
            Türkiye ekonomisinin genel gidişatı · TCMB EVDS · {charts.length} gösterge
          </T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {[null, ...sections].map((s) => {
              const active = s === section;
              return (
                <Pressable
                  key={s ?? 'all'}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    tap();
                    setSection(s);
                  }}
                  style={[styles.chip, { backgroundColor: active ? t.accent : t.card }]}
                >
                  <T v="sub" color={active ? '#FFFFFF' : t.label} style={{ fontWeight: '600' }}>
                    {s ?? 'Tümü'}
                  </T>
                </Pressable>
              );
            })}
          </ScrollView>
          {shown.map((s) => (
            <View key={s} style={{ gap: 10 }}>
              <SectionTitle>{s}</SectionTitle>
              {charts
                .filter((c) => c.section === s)
                .map((c) => (
                  <StatCard key={c.id} chart={c} />
                ))}
            </View>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

function StatCard({ chart }: { chart: StatChart }) {
  const t = useTheme();
  const fmt = formatter(chart);
  const colors = colorsOf(t);
  const withData = (chart.series ?? []).filter((s) => s.points?.length);
  const data = useMemo(() => {
    // One shared month axis across the chart's series.
    const months = [...new Set(withData.flatMap((s) => s.points.map((p) => p.date)))].sort();
    return {
      labels: months.map(fmtMonth),
      series: withData.map((s, i) => {
        const byDate = new Map(s.points.map((p) => [p.date, p.value]));
        return { label: s.label, color: colors[i % 3], values: months.map((d) => byDate.get(d) ?? null) };
      }),
    };
  }, [withData, colors]);

  return (
    <Card style={{ gap: 8 }}>
      <T v="headline">{chart.title}</T>
      <T v="caption" muted>
        {chart.explain}
      </T>
      {withData.length ? (
        <>
          {withData.map((s, i) => {
            const last = s.points.at(-1)!;
            return (
              <View key={s.label} style={styles.latest}>
                <Swatch color={colors[i % 3]} />
                <T v="sub" style={{ flex: 1 }}>
                  {s.label}
                </T>
                <T v="sub" num style={{ fontWeight: '700' }}>
                  {fmt(last.value)}
                </T>
                <T v="caption" muted num>
                  {fmtMonth(last.date)}
                </T>
              </View>
            );
          })}
          <LineChart labels={data.labels} series={data.series} format={fmt} reference={chart.reference?.value} height={170} />
          {chart.reference ? (
            <T v="caption" muted>
              Kesikli çizgi: {chart.reference.label}
            </T>
          ) : null}
        </>
      ) : (
        <T v="caption" muted>
          Veri alınamadı.
        </T>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  chips: { gap: 8, paddingVertical: 2 },
  chip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  latest: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
