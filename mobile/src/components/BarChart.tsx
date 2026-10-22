import { useMemo, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';

import { useTheme } from '@/theme';
import { T } from './ui';

export type BarSeries = { label: string; color: string; values: (number | null)[] };

type Props = {
  labels: string[];
  series: BarSeries[];
  format: (v: number) => string;
  height?: number;
  /** Bars drawn faded (e.g. a month that has not ended), by label index. */
  faded?: boolean[];
  /**
   * Lowest value of the y axis. Default 0. Money market months differ by a few points only,
   * so the Fon screen starts the axis a little below the lowest bar.
   */
  min?: number;
};

const PAD = { top: 8, right: 4, bottom: 22, left: 44 };

function niceStep(range: number, count = 4) {
  const raw = range / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
}

/** Grouped bar chart: one group per label, one bar per series. Touch a group to read its values. */
export function BarChart({ labels, series, format, height = 200, faded, min = 0 }: Props) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  const geo = useMemo(() => {
    const all = series.flatMap((s) => s.values).filter((v): v is number => v != null);
    if (!all.length || width === 0) return null;
    const lo = Math.min(min, ...all);
    const step = niceStep(Math.max(...all) - lo || 1);
    const hi = Math.ceil(Math.max(...all) / step) * step;
    const base = Math.floor(lo / step) * step;
    const w = width - PAD.left - PAD.right;
    const h = height - PAD.top - PAD.bottom;
    const y = (v: number) => PAD.top + (1 - (v - base) / (hi - base || 1)) * h;
    const groupW = w / Math.max(labels.length, 1);
    const gap = Math.min(6, groupW * 0.2);
    const barW = Math.max(2, (groupW - gap) / series.length);
    const ticks: number[] = [];
    for (let v = base; v <= hi + step * 1e-9; v += step) ticks.push(Number(v.toPrecision(12)));
    const every = Math.max(1, Math.ceil(labels.length / 6));
    return { y, groupW, gap, barW, ticks, base, every, w };
  }, [series, labels, width, height, min]);

  const pick = (e: GestureResponderEvent) => {
    if (!geo) return;
    const i = Math.floor((e.nativeEvent.locationX - PAD.left) / geo.groupW);
    setActive(Math.max(0, Math.min(labels.length - 1, i)));
  };

  return (
    <View>
      <View
        style={{ height }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={pick}
        onResponderMove={pick}
        onResponderTerminationRequest={() => true}
        accessible
        accessibilityLabel={`Çubuk grafik, ${labels.length} dönem`}
      >
        {geo ? (
          <Svg width={width} height={height}>
            {geo.ticks.map((v) => (
              <G key={v}>
                <Line x1={PAD.left} x2={width - PAD.right} y1={geo.y(v)} y2={geo.y(v)} stroke={t.grid} strokeWidth={1} />
                <SvgText x={PAD.left - 6} y={geo.y(v) + 4} fontSize={10} fill={t.tertiary} textAnchor="end">
                  {format(v)}
                </SvgText>
              </G>
            ))}
            {active != null ? (
              <Rect x={PAD.left + active * geo.groupW} y={PAD.top} width={geo.groupW} height={height - PAD.top - PAD.bottom} fill={t.fill} opacity={0.6} />
            ) : null}
            {labels.map((label, i) => (
              <G key={label + i}>
                {series.map((s, k) => {
                  const v = s.values[i];
                  if (v == null) return null;
                  const top = geo.y(Math.max(v, geo.base));
                  return (
                    <Rect
                      key={s.label}
                      x={PAD.left + i * geo.groupW + geo.gap / 2 + k * geo.barW}
                      y={top}
                      width={geo.barW - (series.length > 1 ? 1 : 0)}
                      height={Math.max(0, geo.y(geo.base) - top)}
                      rx={Math.min(3, geo.barW / 3)}
                      fill={s.color}
                      opacity={faded?.[i] ? 0.4 : 1}
                    />
                  );
                })}
                {i % geo.every === 0 ? (
                  <SvgText x={PAD.left + (i + 0.5) * geo.groupW} y={height - 6} fontSize={10} fill={t.tertiary} textAnchor="middle">
                    {label}
                  </SvgText>
                ) : null}
              </G>
            ))}
          </Svg>
        ) : null}
      </View>
      <View style={styles.readout}>
        {active != null ? (
          <>
            <T v="caption" muted num>
              {labels[active]}
            </T>
            {series.map((s) => (
              <T key={s.label} v="caption" num color={s.color} style={{ fontWeight: '600' }}>
                {s.label} {s.values[active] == null ? '–' : format(s.values[active]!)}
              </T>
            ))}
          </>
        ) : (
          <T v="caption" muted>
            Değerleri görmek için grafiğe dokunun.
          </T>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  readout: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, minHeight: 18, marginTop: 2 },
});
