import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  OPTION_LABELS,
  SYMBOL,
  autoRates,
  breakEvenItems,
  buildScenarios,
  parseDays,
  rateNote,
  settingValue,
  type Input,
  type Option,
  type Rates,
  type Scenario,
  type Trends,
} from '@/features/model';
import { useAppStore, type RateKey } from '@/features/store';
import { equivalents, formatAmountInput } from '@/lib/calc';
import { fmtMoney, fmtPct, fmtRate, nf } from '@/lib/format';
import type { Currency, Market } from '@/lib/types';
import { useTheme } from '@/theme';
import { Card, Field, Segmented, T, tap } from '../ui';

const OPTION_ORDER: Option[] = ['TRY', 'BOND', 'USD', 'EUR'];

/** Amount, term and rates, then the recommendation for the chosen exchange-rate scenario. */
export function Calculator({ market, trends, input }: { market: Market; trends: Trends; input: Input }) {
  const t = useTheme();
  const s = useAppStore();
  const [scenarioIndex, setScenarioIndex] = useState(0);

  const ctx = { market, days: parseDays(s.days) };
  const auto = autoRates(ctx, settingValue('tlGap', s.overrides, ctx) ?? 0);
  const now: Rates = { USD: trends.USD.current.value, EUR: trends.EUR.current.value };
  const scenarios = useMemo(() => (input.amount > 0 ? buildScenarios(input, now, trends) : []), [input, now.USD, now.EUR, trends]); // eslint-disable-line react-hooks/exhaustive-deps

  const rateField = (key: RateKey, label: string) => {
    const typed = s.rates[key];
    return (
      <Field
        style={{ flex: 1 }}
        label={label}
        suffix="%"
        keyboardType="decimal-pad"
        value={typed ?? nf(2).format(auto[key].value)}
        auto={typed == null}
        selectTextOnFocus
        onChangeText={(text) => s.setRate(key, text)}
      />
    );
  };
  const changedRates = (Object.keys(s.rates) as RateKey[]).filter((k) => s.rates[k] != null);

  return (
    <Card tint={t.accentSoft} style={{ gap: 10 }}>
      <View style={styles.row}>
        <Field
          style={{ flex: 1 }}
          big
          label="Tutar"
          keyboardType="decimal-pad"
          value={s.amount}
          onChangeText={(text) => s.setAmount(formatAmountInput(text))}
          selectTextOnFocus
        />
        <Field
          style={{ width: 96 }}
          big
          label="Vade"
          suffix="gün"
          keyboardType="number-pad"
          value={s.days}
          onChangeText={(text) => s.setDays(text.replace(/\D/g, '').slice(0, 4))}
          selectTextOnFocus
        />
      </View>
      <Segmented<Currency>
        options={[
          { key: 'TRY', label: 'TL' },
          { key: 'USD', label: 'Dolar' },
          { key: 'EUR', label: 'Euro' },
        ]}
        value={s.currency}
        onChange={s.setCurrency}
      />
      <View style={styles.row}>
        {rateField('tlRate', 'TL faizi')}
        {rateField('usdRate', 'USD faizi')}
        {rateField('eurRate', 'EUR faizi')}
      </View>
      <T v="caption" muted>
        {auto.tlRate.hint}
      </T>
      {changedRates.length ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            tap();
            changedRates.forEach((k) => s.setRate(k, null));
          }}
        >
          <T v="sub" color={t.accent} style={{ fontWeight: '600' }}>
            Faizleri TCMB verisine döndür
          </T>
        </Pressable>
      ) : null}

      {scenarios.length ? (
        <Result
          input={input}
          scenarios={scenarios}
          index={Math.min(scenarioIndex, scenarios.length - 1)}
          onIndex={setScenarioIndex}
          now={now}
          note={rateNote(market)}
        />
      ) : (
        <T muted>Bir tutar girin.</T>
      )}
    </Card>
  );
}

function Result({
  input,
  scenarios,
  index,
  onIndex,
  now,
  note,
}: {
  input: Input;
  scenarios: Scenario[];
  index: number;
  onIndex: (i: number) => void;
  now: Rates;
  note: string | null;
}) {
  const t = useTheme();
  const [open, setOpen] = useState<Option | null>(null);
  const sc = scenarios[index];
  const cur = SYMBOL[input.currency];
  const [best, second] = sc.ranking;
  const b = sc.result[best]!;
  const others = scenarios.filter((_, i) => i !== index);

  return (
    <View style={{ gap: 10, marginTop: 6 }}>
      <Segmented<string>
        options={scenarios.map((x, i) => ({ key: String(i), label: x.short }))}
        value={String(index)}
        onChange={(k) => onIndex(Number(k))}
      />
      <T v="caption" muted>
        {sc.title}: {input.days} gün sonra USD {fmtRate(sc.end.USD)}, EUR {fmtRate(sc.end.EUR)}
      </T>

      <View style={[styles.reco, { backgroundColor: t.card, borderColor: t.good }]}>
        <T v="caption" color={t.good} style={{ fontWeight: '700', letterSpacing: 0.5 }}>
          ÖNERİ
        </T>
        <T v="title">{OPTION_LABELS[best]}</T>
        <T v="sub">
          Vade sonunda <T v="sub" style={{ fontWeight: '700' }}>{`${fmtMoney(b.final)} ${cur}`}</T> ({fmtPct(b.gainPct)}).
          {second ? ` ${OPTION_LABELS[second]} seçeneğinden ${fmtMoney(b.final - sc.result[second]!.final)} ${cur} fazla.` : ''}
        </T>
      </View>

      <View style={{ gap: 8 }}>
        {OPTION_ORDER.filter((o) => sc.result[o]).map((o) => {
          const r = sc.result[o]!;
          const isBest = o === best;
          const expanded = open === o;
          return (
            <View
              key={o}
              style={[styles.option, { backgroundColor: isBest ? t.goodSoft : t.card, borderColor: isBest ? t.good : t.separator }]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={() => {
                  tap();
                  setOpen(expanded ? null : o);
                }}
                style={styles.optionHead}
              >
                <View style={{ flex: 1 }}>
                  <T v="sub" style={{ fontWeight: '600' }}>
                    {isBest ? '★ ' : ''}
                    {OPTION_LABELS[o]}
                  </T>
                  <T v="caption" muted num>
                    {fmtPct(r.gainPct)}
                    {r.realPct == null ? '' : ` · reel ${fmtPct(r.realPct)}`}
                  </T>
                </View>
                <T v="headline" num color={r.gain >= 0 ? t.label : t.bad}>
                  {fmtMoney(r.final)} {cur}
                </T>
                <T v="caption" muted style={{ marginLeft: 6 }}>
                  {expanded ? '▲' : '▼'}
                </T>
              </Pressable>
              {expanded ? <Steps option={o} input={input} sc={sc} /> : null}
            </View>
          );
        })}
      </View>
      <T v="caption" muted>
        Ayrıntı için bir seçeneğe dokunun. Makas, kambiyo vergisi ve stopaj düşülmüştür.
      </T>
      <T v="caption">
        Diğer senaryolarda en iyisi: {others.map((o) => `${o.short}: ${OPTION_LABELS[o.ranking[0]]}`).join(' · ')}
      </T>
      <T v="caption">Başabaş: {breakEvenItems(input, now).join(' ')}</T>
      {note ? (
        <T v="caption" muted>
          {note}
        </T>
      ) : null}
    </View>
  );
}

/** Step-by-step calculation of one option in one scenario. */
function Steps({ option, input, sc }: { option: Option; input: Input; sc: Scenario }) {
  const t = useTheme();
  const cur = input.currency;
  const trip = sc.result[option]!.trip;
  const held = trip.held;
  const money = (v: number, c: Currency) => `${fmtMoney(v)} ${SYMBOL[c]}`;
  const cost = (v: number) => (v > 0 ? `−${money(v, 'TRY')}` : '–');
  const rows: [string, string][] = [['Başlangıç', money(input.amount, cur)]];
  if (held !== cur) {
    const outLabel = cur === 'TRY' ? `${held} alış kuru (bugün)` : held === 'TRY' ? `${cur} bozdurma kuru (bugün)` : `${cur} → ${held} çevrim oranı`;
    rows.push([outLabel, fmtRate(trip.out.rate)], ['Makas + kambiyo vergisi', cost(trip.out.spreadCostTl + trip.out.taxTl)], [`${SYMBOL[held]} tutarı`, money(trip.out.net, held)]);
  }
  rows.push(
    [`Faiz (%${nf(2).format(trip.rate)}, ${input.days} gün)`, `+${money(trip.grossInterest, held)}`],
    [`Stopaj (%${nf(1).format(trip.stopaj)})`, trip.stopajAmount > 0 ? `−${money(trip.stopajAmount, held)}` : '–'],
    [`Vade sonu (${SYMBOL[held]})`, money(trip.atMaturity, held)],
    ['USD/TRY tahmini (vade sonu)', fmtRate(sc.end.USD)],
    ['EUR/TRY tahmini (vade sonu)', fmtRate(sc.end.EUR)],
  );
  const eq = equivalents(trip.atMaturity, held, sc.end, input.spread, input.fxBuyTax) as Record<Currency, number>;
  return (
    <View style={[styles.steps, { borderTopColor: t.separator }]}>
      {rows.map(([k, v]) => (
        <View key={k} style={styles.stepRow}>
          <T v="caption" muted style={{ flex: 1 }}>
            {k}
          </T>
          <T v="caption" num>
            {v}
          </T>
        </View>
      ))}
      <T v="caption" style={{ fontWeight: '700', marginTop: 6 }}>
        Vade sonunda karşılıkları
      </T>
      {(['TRY', 'USD', 'EUR'] as const).map((c) => (
        <View key={c} style={styles.stepRow}>
          <T v="caption" muted style={{ flex: 1 }}>
            {SYMBOL[c]}
            {c === held ? '' : ' (çevrilirse)'}
          </T>
          <T v="caption" num style={{ fontWeight: c === cur ? '700' : '400' }}>
            {money(eq[c], c)}
          </T>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  reco: { borderRadius: 14, borderWidth: 1.5, padding: 12, gap: 4, borderCurve: 'continuous' },
  option: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', borderCurve: 'continuous' },
  optionHead: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  steps: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 10, gap: 4 },
  stepRow: { flexDirection: 'row', gap: 8 },
});
