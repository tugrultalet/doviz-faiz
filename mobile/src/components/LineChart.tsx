import { useMemo, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';

import { useTheme } from '@/theme';
import { T } from './ui';

export type ChartSeries = { label: string; color: string; values: (number | null)[] };

type Props = {
  labels: string[];
  series: ChartSeries[];
  /** Axis and tooltip number format. */
  format: (v: number) => string;
  height?: number;
  /** Logarithmic y axis (labels only at powers of ten). */
  log?: boolean;
  /** Dashed horizontal line, e.g. 100 for confidence indexes or 0 for % changes. */
  reference?: number;
  /** Dots on every point (for short series). */
  dots?: boolean;
};

const PAD = { top: 8, right: 8, bottom: 22, left: 48 };

/** "Nice" tick values covering [min, max]. */
function niceTicks(min: number, max: number, count = 4) {
  if (min === max) return [min];
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

/**
 * Line chart for one or more series over shared x labels. Gaps (null) break the line.
 * Touch and drag to read the values of a day; the readout stays until the next touch.
 */
export function LineChart({ labels, series, format, height = 200, log, reference, dots }: Props) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  const geo = useMemo(() => {
    const all = series.flatMap((s) => s.values).filter((v): v is number => v != null && (!log || v > 0));
    if (!all.length || width === 0) return null;
    const f = (v: number) => (log ? Math.log10(v) : v);
    let lo = Math.min(...all.map(f));
    let hi = Math.max(...all.map(f));
    if (reference != null && !log) {
      lo = Math.min(lo, reference);
      hi = Math.max(hi, reference);
    }
    if (lo === hi) {
      lo -= 1;
      hi += 1;
    }
    const padY = (hi - lo) * 0.06;
    lo -= padY;
    hi += padY;
    const w = width - PAD.left - PAD.right;
    const h = height - PAD.top - PAD.bottom;
    const n = Math.max(labels.length - 1, 1);
    const x = (i: number) => PAD.left + (i / n) * w;
    const y = (v: number) => PAD.top + (1 - (f(v) - lo) / (hi - lo)) * h;
    const ticks = log
      ? Array.from({ length: Math.floor(hi) - Math.ceil(lo) + 1 }, (_, i) => Math.pow(10, Math.ceil(lo) + i))
      : niceTicks(lo + padY, hi - padY);
    const paths = series.map((s) => {
      let d = '';
      let pen = false;
      s.values.forEach((v, i) => {
        if (v == null || (log && v <= 0)) {
          pen = false;
          return;
        }
        d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
        pen = true;
      });
      return d;
    });
    const xLabelIdx = labels.length <= 1 ? [0] : [0, Math.round(n / 3), Math.round((2 * n) / 3), n];
    return { x, y, ticks, paths, xLabelIdx, n, w };
  }, [series, labels, width, height, log, reference]);

  const pick = (e: GestureResponderEvent) => {
    if (!geo) return;
    const i = Math.round(((e.nativeEvent.locationX - PAD.left) / geo.w) * geo.n);
    setActive(Math.max(0, Math.min(labels.length - 1, i)));
  };

  return (
    <View>
      <View
        style={{ height }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={(e) => Math.abs(e.nativeEvent.locationX) > 0}
        onResponderGrant={pick}
        onResponderMove={pick}
        onResponderTerminationRequest={() => true}
        accessible
        accessibilityLabel={series.map((s) => `${s.label}: son değer ${formatLast(s.values, format)}`).join('. ')}
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
            {reference != null && !log ? (
              <Line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={geo.y(reference)}
                y2={geo.y(reference)}
                stroke={t.tertiary}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            ) : null}
            {geo.xLabelIdx.map((i, k) => (
              <SvgText
                key={i}
                x={geo.x(i)}
                y={height - 6}
                fontSize={10}
                fill={t.tertiary}
                textAnchor={k === 0 ? 'start' : k === geo.xLabelIdx.length - 1 ? 'end' : 'middle'}
              >
                {labels[i]}
              </SvgText>
            ))}
            {series.map((s, k) => (
              <Path key={s.label} d={geo.paths[k]} stroke={s.color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {dots
              ? series.map((s) =>
                  s.values.map((v, i) => (v == null ? null : <Circle key={`${s.label}${i}`} cx={geo.x(i)} cy={geo.y(v)} r={2.5} fill={s.color} />)),
                )
              : null}
            {active != null ? (
              <G>
                <Line x1={geo.x(active)} x2={geo.x(active)} y1={PAD.top} y2={height - PAD.bottom} stroke={t.tertiary} strokeWidth={1} />
                {series.map((s) => {
                  const v = s.values[active];
                  return v == null || (log && v <= 0) ? null : (
                    <Circle key={s.label} cx={geo.x(active)} cy={geo.y(v)} r={4} fill={s.color} stroke={t.card} strokeWidth={2} />
                  );
                })}
              </G>
            ) : null}
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

function formatLast(values: (number | null)[], format: (v: number) => string) {
  const last = [...values].reverse().find((v) => v != null);
  return last == null ? 'yok' : format(last);
}

const styles = StyleSheet.create({
  readout: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, minHeight: 18, marginTop: 2 },
});
