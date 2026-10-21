import { StyleSheet, View } from 'react-native';

import { VERDICT, type Trends } from '@/features/model';
import { fmtPct, fmtRate } from '@/lib/format';
import { useTheme } from '@/theme';
import { Badge, Card, Grid, half, Swatch, T } from '../ui';

/** USD and EUR: today's rate, 1-year and 30-day change, and whether the last month sped up. */
export function TrendCards({ trends }: { trends: Trends }) {
  const t = useTheme();
  const cards = [
    { code: 'USD', label: 'Dolar', color: t.usd, s: trends.USD },
    { code: 'EUR', label: 'Euro', color: t.eur, s: trends.EUR },
  ] as const;
  return (
    <Grid>
      {cards.map(({ code, label, color, s }) => (
        <Card key={code} style={half}>
          <View style={styles.head}>
            <Swatch color={color} />
            <T v="sub" style={{ fontWeight: '600' }}>
              {label}
            </T>
          </View>
          <T v="big" num adjustsFontSizeToFit numberOfLines={1}>
            {fmtRate(s.current.value)}
          </T>
          <Badge
            color={s.verdict === 'faster' ? t.bad : s.verdict === 'slower' ? t.good : t.secondary}
            bg={s.verdict === 'faster' ? t.badSoft : s.verdict === 'slower' ? t.goodSoft : t.fill}
          >
            {VERDICT[s.verdict as keyof typeof VERDICT]}
          </Badge>
          <Row k="1 yıl" v={fmtPct(s.yearChange, 1)} />
          <Row k="Son 30 gün" v={fmtPct(s.lastMonth)} />
          <Row k="Önceki 11 ay ort." v={fmtPct(s.prevAvg)} />
        </Card>
      ))}
    </Grid>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.row}>
      <T v="caption" muted>
        {k}
      </T>
      <T v="caption" num style={{ fontWeight: '600' }}>
        {v}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
});
