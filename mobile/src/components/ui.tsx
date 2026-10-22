import * as Haptics from 'expo-haptics';
import { useState, type PropsWithChildren, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/theme';

export const tap = () => {
  if (Platform.OS !== 'web') void Haptics.selectionAsync();
};

/** Scrolling page under a large native title, with pull to refresh. */
export function Screen({ children, refreshing, onRefresh }: PropsWithChildren<{ refreshing?: boolean; onRefresh?: () => void }>) {
  const t = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.screen}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

type Variant = 'title' | 'headline' | 'body' | 'sub' | 'caption' | 'big';
const variants: Record<Variant, object> = {
  big: { fontSize: 24, fontWeight: '700', fontVariant: ['tabular-nums'] },
  title: { fontSize: 18, fontWeight: '700' },
  headline: { fontSize: 16, fontWeight: '600' },
  body: { fontSize: 16 },
  sub: { fontSize: 14 },
  caption: { fontSize: 12, lineHeight: 16 },
};

/** Text in the app's type scale. `muted` = secondary color, `num` = tabular digits. */
export function T({ v = 'body', muted, num, color, style, ...rest }: TextProps & { v?: Variant; muted?: boolean; num?: boolean; color?: string }) {
  const t = useTheme();
  return (
    <Text
      {...rest}
      style={[variants[v], { color: color ?? (muted ? t.secondary : t.label) }, num && { fontVariant: ['tabular-nums'] }, style]}
    />
  );
}

export function Card({ children, style, tint }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; tint?: string }>) {
  const t = useTheme();
  return <View style={[styles.card, { backgroundColor: tint ?? t.card }, style]}>{children}</View>;
}

export function SectionTitle({ children, right }: PropsWithChildren<{ right?: ReactNode }>) {
  return (
    <View style={styles.sectionTitle}>
      <T v="title" accessibilityRole="header">
        {children}
      </T>
      {right}
    </View>
  );
}

export function Badge({ children, color, bg }: PropsWithChildren<{ color?: string; bg?: string }>) {
  const t = useTheme();
  return (
    <View style={[styles.badge, { backgroundColor: bg ?? t.fill }]}>
      <T v="caption" color={color ?? t.secondary} style={{ fontWeight: '600' }}>
        {children}
      </T>
    </View>
  );
}

/** iOS-style segmented control. */
export function Segmented<K extends string>({ options, value, onChange }: { options: { key: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  const t = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: t.fill }]} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (!active) {
                tap();
                onChange(o.key);
              }
            }}
            style={[styles.segment, active && { backgroundColor: t.scheme === 'dark' ? '#636366' : '#FFFFFF', ...styles.segmentActive }]}
          >
            <T v="sub" numberOfLines={1} style={{ fontWeight: active ? '600' : '500' }}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Labeled number input; `auto` marks a value that follows live data until the user types. */
export function Field({
  label,
  hint,
  suffix,
  big,
  auto,
  style,
  ...input
}: TextInputProps & { label: string; hint?: string; suffix?: string; big?: boolean; auto?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View style={style}>
      <T v="caption" muted style={styles.fieldLabel}>
        {label}
      </T>
      <View style={[styles.field, { backgroundColor: t.card, borderColor: t.separator }]}>
        <TextInput
          {...input}
          placeholderTextColor={t.tertiary}
          style={[
            styles.fieldInput,
            { color: auto ? t.secondary : t.label, fontSize: big ? 24 : 17, fontWeight: big ? '700' : '500' },
          ]}
        />
        {suffix ? <T muted>{suffix}</T> : null}
      </View>
      {hint ? (
        <T v="caption" muted style={styles.hint}>
          {hint}
        </T>
      ) : null}
    </View>
  );
}

/** Header row that shows or hides its content. */
export function Collapsible({ title, children, initiallyOpen = false }: PropsWithChildren<{ title: string; initiallyOpen?: boolean }>) {
  const t = useTheme();
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <Card style={{ padding: 0 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => {
          tap();
          setOpen(!open);
        }}
        style={styles.collapsibleHead}
      >
        <T v="headline">{title}</T>
        <T color={t.accent} v="headline">
          {open ? 'Gizle' : 'Göster'}
        </T>
      </Pressable>
      {open ? <View style={styles.collapsibleBody}>{children}</View> : null}
    </Card>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useTheme();
  return (
    <Card tint={t.badSoft}>
      <T v="sub" color={t.bad}>
        {message}
      </T>
      {onRetry ? (
        <Pressable accessibilityRole="button" onPress={onRetry} style={{ marginTop: 8 }}>
          <T v="headline" color={t.accent}>
            Tekrar dene
          </T>
        </Pressable>
      ) : null}
    </Card>
  );
}

/** Two equal columns that wrap. */
export function Grid({ children, gap = 10 }: PropsWithChildren<{ gap?: number }>) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>{children}</View>;
}
export const half = { flexBasis: '47%', flexGrow: 1 } as const;

/** Swatch + label for chart legends. */
export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <View style={styles.legend}>
      {items.map((i) => (
        <View key={i.label} style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: i.color }]} />
          <T v="caption" muted>
            {i.label}
          </T>
        </View>
      ))}
    </View>
  );
}

export const Swatch = ({ color }: { color: string }) => <View style={[styles.swatch, { backgroundColor: color }]} />;

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 40, gap: 10 },
  card: { borderRadius: 14, padding: 12, gap: 4, borderCurve: 'continuous' },
  sectionTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  segmented: { flexDirection: 'row', borderRadius: 10, padding: 2, gap: 2 },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, paddingHorizontal: 4, borderRadius: 8 },
  segmentActive: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  fieldLabel: { marginBottom: 4, marginLeft: 2 },
  field: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, gap: 6, borderCurve: 'continuous' },
  fieldInput: { flex: 1, paddingVertical: 8, fontVariant: ['tabular-nums'], minWidth: 0 },
  hint: { marginTop: 4, marginLeft: 2 },
  collapsibleHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 11 },
  collapsibleBody: { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
});
