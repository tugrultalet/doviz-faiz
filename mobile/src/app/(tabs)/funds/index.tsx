import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BarChart } from '@/components/BarChart';
import { FundPicker, shortType } from '@/components/FundPicker';
import { LineChart } from '@/components/LineChart';
import { Card, ErrorNote, Grid, half, Legend, Screen, SectionTitle, Segmented, T, tap } from '@/components/ui';
import { useAppStore } from '@/features/store';
import { fetchFundHistory } from '@/lib/api';
import { fmtDate, nf } from '@/lib/format';
import { alignCurves, alignMonths, fundSummary } from '@/lib/funds';
import type { Fund, FundHistory, FundMonth } from '@/lib/types';
import { useTheme, type Theme } from '@/theme';

const MAX_COMPARE = 2;
const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const fmtYm = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;
const pct = (v: number | null | undefined, digits = 1) => (v == null ? '–' : `${v >= 0 ? '+' : ''}${nf(digits).format(v)}%`);
const rate = (v: number | null | undefined, digits = 1) => (v == null ? '–' : `%${nf(digits).format(v)}`);
const compactTl = new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 });
const seriesColors = (t: Theme) => [t.accent, t.eur, t.parity];

type Mode = 'annualized' | 'pct';
type Loaded = { data?: FundHistory; error?: string };
type Shown = { fund: Fund; history: FundHistory };

export default function FundsScreen() {
  const t = useTheme();
  const funds = useAppStore((s) => s.funds);
  const loadFunds = useAppStore((s) => s.loadFunds);
  const fundCode = useAppStore((s) => s.fundCode);
  const compareCodes = useAppStore((s) => s.compareCodes);
  const setFundCode = useAppStore((s) => s.setFundCode);
  const setCompareCodes = useAppStore((s) => s.setCompareCodes);
  const [histories, setHistories] = useState<Record<string, Loaded>>({});
  const [picker, setPicker] = useState<'main' | 'compare' | null>(null);
  const [mode, setMode] = useState<Mode>('annualized');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void loadFunds();
  }, [loadFunds]);

  const load = useCallback(async (code: string) => {
    setHistories((h) => ({ ...h, [code]: { data: h[code]?.data } }));
    try {
      const data = await fetchFundHistory(code);
      setHistories((h) => ({ ...h, [code]: { data } }));
    } catch (err) {
      setHistories((h) => ({ ...h, [code]: { error: (err as Error).message } }));
    }
  }, []);

  const codes = useMemo(() => [fundCode, ...compareCodes], [fundCode, compareCodes]);
  useEffect(() => {
    for (const c of codes) if (!(c in histories)) void load(c);
  }, [codes, histories, load]);

  const list = useMemo(() => funds.data ?? [], [funds.data]);
  const byCode = useMemo(() => new Map(list.map((f) => [f.code, f])), [list]);
  const shown = useMemo(
    () =>
      codes
        .map((c) => {
          const history = histories[c]?.data;
          return history ? { fund: byCode.get(c) ?? ({ code: c, name: history.name ?? c } as Fund), history } : null;
        })
        .filter((s): s is Shown => s != null),
    [codes, histories, byCode],
  );
  const main = shown[0]?.fund.code === fundCode ? shown[0] : null;
  const errors = codes.map((c) => (histories[c]?.error ? `${c}: ${histories[c].error}` : null)).filter(Boolean) as string[];
  const colors = seriesColors(t);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([loadFunds(true), ...codes.map(load)]);
    setRefreshing(false);
  };

  return (
    <Screen refreshing={refreshing} onRefresh={() => void refresh()}>
      {funds.error && !list.length ? <ErrorNote message={funds.error} onRetry={() => void loadFunds(true)} /> : null}
      {errors.map((e) => (
        <ErrorNote key={e} message={e} onRetry={() => codes.forEach((c) => histories[c]?.error && void load(c))} />
      ))}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Fon seç"
        disabled={!list.length}
        onPress={() => {
          tap();
          setPicker('main');
        }}
        style={[styles.selector, { backgroundColor: t.card, borderColor: t.separator }]}
      >
        <View style={{ flex: 1 }}>
          <T v="headline" numberOfLines={1}>
            {main ? `${main.fund.code} · ${main.fund.name}` : list.length ? fundCode : 'Fon listesi yükleniyor…'}
          </T>
          {main ? (
            <T v="caption" muted>
              {shortType(main.fund.type)}
            </T>
          ) : null}
        </View>
        <T v="headline" color={t.accent}>
          Değiştir
        </T>
      </Pressable>

      <View style={styles.compareRow}>
        {shown.map((s, i) => (
          <View key={s.fund.code} style={[styles.chip, { backgroundColor: t.card, borderColor: t.separator }]}>
            <View style={[styles.dot, { backgroundColor: colors[i] }]} />
            <T v="sub" style={{ fontWeight: '700' }}>
              {s.fund.code}
            </T>
            {i > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${s.fund.code} karşılaştırmadan çıkar`}
                hitSlop={10}
                onPress={() => {
                  tap();
                  setCompareCodes(compareCodes.filter((c) => c !== s.fund.code));
                }}
              >
                <T v="sub" muted style={{ marginLeft: 4 }}>
                  ✕
                </T>
              </Pressable>
            ) : null}
          </View>
        ))}
        {compareCodes.length < MAX_COMPARE && list.length ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              tap();
              setPicker('compare');
            }}
            style={[styles.chip, styles.addChip, { borderColor: t.accent }]}
          >
            <T v="sub" color={t.accent} style={{ fontWeight: '600' }}>
              + Karşılaştır
            </T>
          </Pressable>
        ) : null}
      </View>

      {main ? (
        <>
          <Summary item={main} />
          {shown.length > 1 ? <CompareTable items={shown} colors={colors} /> : null}

          <SectionTitle>Kazanç eğrisi</SectionTitle>
          <Curve items={shown} colors={colors} />

          <SectionTitle>Aylık getiri</SectionTitle>
          <Segmented
            options={[
              { key: 'annualized', label: 'Yıllık eşdeğer' },
              { key: 'pct', label: 'Aylık %' },
            ]}
            value={mode}
            onChange={setMode}
          />
          <Months items={shown} colors={colors} mode={mode} />
          <T v="caption" muted>
            Kaynak: TEFAS (Takasbank). Getiriler yönetim ücreti sonrası, stopaj öncesidir. Risk değeri SPK ölçeğidir (1 en düşük, 7 en yüksek). Geçmiş getiri gelecekteki getirinin garantisi değildir. Yatırım tavsiyesi değildir.
          </T>
        </>
      ) : !errors.length ? (
        <T muted>Fon verisi yükleniyor…</T>
      ) : null}

      <FundPicker
        visible={picker != null}
        title={picker === 'compare' ? 'Karşılaştırılacak fon' : 'Fon seç'}
        funds={list}
        exclude={picker === 'compare' ? codes : []}
        onClose={() => setPicker(null)}
        onPick={(code) => {
          if (picker === 'compare') setCompareCodes([...compareCodes, code].slice(0, MAX_COMPARE));
          else setFundCode(code);
          setPicker(null);
        }}
      />
    </Screen>
  );
}

function Summary({ item }: { item: Shown }) {
  const { fund, history } = item;
  const s = fundSummary(history);
  const tile = (title: string, value: string, note: string) => (
    <Card style={half} key={title}>
      <T v="caption" muted style={{ fontWeight: '600' }}>
        {title}
      </T>
      <T v="title" num numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </T>
      <T v="caption" muted numberOfLines={2}>
        {note}
      </T>
    </Card>
  );
  return (
    <Grid>
      {tile('Son 12 ay', pct(s.total, 1), s.first && s.last ? `${fmtDate(s.first.date)} – ${fmtDate(s.last.date)}` : '')}
      {tile('Son 3 ay', pct(s.r3m, 1), 'toplam getiri')}
      {tile('Son 1 ay', pct(s.r1m, 2), 'toplam getiri')}
      {tile('Aylık ortalama', rate(s.avgAnnual), 'tam ayların yıllık eşdeğeri')}
      {tile('Risk değeri', fund.risk ? `${fund.risk} / 7` : '–', fund.risk ? 'SPK ölçeği' : "TEFAS'ta yayımlanmıyor")}
      {tile('Büyüklük', fund.size ? `${compactTl.format(fund.size)} TL` : '–', fund.investors ? `${nf(0).format(fund.investors)} yatırımcı` : 'portföy değeri')}
    </Grid>
  );
}

function CompareTable({ items, colors }: { items: Shown[]; colors: string[] }) {
  const t = useTheme();
  const sums = items.map((it) => fundSummary(it.history));
  const rows: { label: string; get: (i: number) => number | null; fmt: (v: number) => string; best?: boolean }[] = [
    { label: 'Son 12 ay', get: (i) => sums[i].total, fmt: (v) => pct(v, 1), best: true },
    { label: 'Son 3 ay', get: (i) => sums[i].r3m, fmt: (v) => pct(v, 1), best: true },
    { label: 'Son 1 ay', get: (i) => sums[i].r1m, fmt: (v) => pct(v, 2), best: true },
    { label: 'Aylık ort.', get: (i) => sums[i].avgAnnual, fmt: (v) => rate(v), best: true },
    { label: 'Risk', get: (i) => items[i].fund.risk, fmt: (v) => `${v} / 7` },
    { label: 'Büyüklük', get: (i) => items[i].fund.size, fmt: (v) => compactTl.format(v) },
  ];
  return (
    <>
      <SectionTitle>Karşılaştırma</SectionTitle>
      <Card style={{ gap: 0 }}>
        <View style={[styles.tr, { borderBottomColor: t.separator }]}>
          <View style={{ flex: 1 }} />
          {items.map((it, i) => (
            <View key={it.fund.code} style={[styles.td, styles.head]}>
              <View style={[styles.dot, { backgroundColor: colors[i] }]} />
              <T v="caption" style={{ fontWeight: '700' }}>
                {it.fund.code}
              </T>
            </View>
          ))}
        </View>
        {rows.map((r, k) => {
          const vals = items.map((_, i) => r.get(i));
          const nums = vals.filter((v): v is number => v != null);
          const top = r.best && nums.length > 1 ? Math.max(...nums) : null;
          return (
            <View key={r.label} style={[styles.tr, k < rows.length - 1 && { borderBottomColor: t.separator }]}>
              <T v="sub" muted style={{ flex: 1 }}>
                {r.label}
              </T>
              {vals.map((v, i) => (
                <T key={i} v="sub" num style={[styles.td, v != null && v === top && { color: t.good, fontWeight: '700' }]}>
                  {v == null ? '–' : r.fmt(v)}
                </T>
              ))}
            </View>
          );
        })}
      </Card>
    </>
  );
}

function Curve({ items, colors }: { items: Shown[]; colors: string[] }) {
  const { dates, series } = useMemo(() => {
    const r = alignCurves(items.map((s) => s.history));
    return { dates: r.dates as string[], series: r.series as (number | null)[][] };
  }, [items]);
  const notes = items.map((s) => {
    const { first, last } = fundSummary(s.history);
    return first && last ? { code: s.fund.code, value: (100 * last.price) / first.price, from: first.date } : null;
  });
  return (
    <Card style={{ gap: 8 }}>
      {items.length > 1 ? <Legend items={items.map((s, i) => ({ label: s.fund.code, color: colors[i] }))} /> : null}
      <LineChart
        labels={dates.map(fmtDate)}
        series={items.map((s, i) => ({ label: s.fund.code, color: colors[i], values: series[i] }))}
        format={(v) => `%${nf(1).format(v)}`}
      />
      {notes[0] ? (
        <T v="caption" muted>
          {fmtDate(notes[0].from)} tarihinde yatırılan 100 TL bugün:{' '}
          {notes.filter(Boolean).map((n) => `${items.length > 1 ? `${n!.code} ` : ''}${nf(2).format(n!.value)} TL`).join(' · ')}
        </T>
      ) : null}
    </Card>
  );
}

function Months({ items, colors, mode }: { items: Shown[]; colors: string[]; mode: Mode }) {
  const t = useTheme();
  const { months, rows } = useMemo(() => {
    const r = alignMonths(items.map((s) => s.history));
    return { months: r.months as string[], rows: r.rows as (FundMonth | null)[][] };
  }, [items]);
  const digits = mode === 'annualized' ? 1 : 2;
  const fmt = (v: number) => (mode === 'annualized' ? rate(v, digits) : pct(v, digits));
  const partial = months.map((_, j) => rows.some((r) => r[j]?.partial));
  const values = rows.flat().filter(Boolean).map((m) => m![mode]);
  // Months differ by a few points only: start the axis a little below the lowest month.
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const min = values.length && lo > 0 && hi - lo < lo ? Math.max(0, lo - (hi - lo) * 0.6) : 0;
  return (
    <Card style={{ gap: 8 }}>
      {items.length > 1 ? <Legend items={items.map((s, i) => ({ label: s.fund.code, color: colors[i] }))} /> : null}
      <BarChart
        labels={months.map((k, j) => fmtYm(k) + (partial[j] ? '*' : ''))}
        series={items.map((s, i) => ({ label: s.fund.code, color: colors[i], values: rows[i].map((m) => (m ? m[mode] : null)) }))}
        faded={partial}
        format={fmt}
        min={min}
      />
      <View style={{ marginTop: 6 }}>
        <View style={[styles.tr, { borderBottomColor: t.separator }]}>
          <View style={{ flex: 1 }} />
          {items.map((s, i) => (
            <View key={s.fund.code} style={[styles.td, styles.head]}>
              {items.length > 1 ? <View style={[styles.dot, { backgroundColor: colors[i] }]} /> : null}
              <T v="caption" muted style={{ fontWeight: '600' }}>
                {items.length > 1 ? s.fund.code : mode === 'annualized' ? 'Yıllık eşdeğer' : 'Aylık'}
              </T>
            </View>
          ))}
        </View>
        {months
          .map((k, j) => ({ k, j }))
          .reverse()
          .map(({ k, j }, n) => {
            const vals = rows.map((r) => r[j]);
            const nums = vals.filter(Boolean).map((m) => m![mode]);
            const top = nums.length > 1 ? Math.max(...nums) : null;
            return (
              <View key={k} style={[styles.tr, n < months.length - 1 && { borderBottomColor: t.separator }]}>
                <View style={{ flex: 1 }}>
                  <T v="sub">{fmtYm(k)}</T>
                  {partial[j] ? (
                    <T v="caption" muted>
                      ay bitmedi
                    </T>
                  ) : null}
                </View>
                {vals.map((m, i) => (
                  <T key={i} v="sub" num style={[styles.td, m != null && m[mode] === top && { color: t.good, fontWeight: '700' }]}>
                    {m ? fmt(m[mode]) : '–'}
                  </T>
                ))}
              </View>
            );
          })}
      </View>
      <T v="caption" muted>
        Aylık getiri: önceki ayın son fiyatından bu ayın son fiyatına. Aylardaki gün sayısı farklıdır; karşılaştırma için &quot;yıllık eşdeğer&quot; daha doğrudur.
      </T>
    </Card>
  );
}

const styles = StyleSheet.create({
  selector: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14, borderCurve: 'continuous' },
  compareRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingVertical: 6 },
  addChip: { borderStyle: 'dashed', borderWidth: 1 },
  dot: { width: 9, height: 9, borderRadius: 3 },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'transparent' },
  td: { width: 78, textAlign: 'right' },
  head: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4 },
});
