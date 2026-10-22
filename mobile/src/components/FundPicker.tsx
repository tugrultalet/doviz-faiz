import { useMemo, useState } from 'react';
import { FlatList, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { FUND_TYPES, indexFunds, searchFunds } from '@/lib/funds';
import type { Fund } from '@/lib/types';
import { useTheme } from '@/theme';
import { T, tap } from './ui';

const compactTl = new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 });
export const shortType = (type: string | null) => (type ? type.replace(/ Şemsiye Fonu$/, '') : 'Tür bilinmiyor');

type Props = {
  visible: boolean;
  title: string;
  funds: Fund[];
  /** Codes that cannot be chosen here (already on screen). */
  exclude?: string[];
  onPick: (code: string) => void;
  onClose: () => void;
};

/** Full-screen sheet: search box, type chips and the matching funds (largest first). */
export function FundPicker({ visible, title, funds, exclude = [], onPick, onClose }: Props) {
  const t = useTheme();
  const [query, setQuery] = useState('');
  const [typeId, setTypeId] = useState('all');
  const index = useMemo(() => indexFunds(funds), [funds]);
  const result = useMemo(() => {
    const skip = new Set(exclude);
    const r = searchFunds(index, query, { typeId, limit: 80 + skip.size });
    return { total: r.total, items: (r.items as Fund[]).filter((f) => !skip.has(f.code)).slice(0, 80) };
  }, [index, query, typeId, exclude]);

  const close = () => {
    setQuery('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View style={[styles.sheet, { backgroundColor: t.bg }]}>
        <View style={styles.header}>
          <T v="headline">{title}</T>
          <Pressable accessibilityRole="button" onPress={close} hitSlop={12}>
            <T v="headline" color={t.accent}>
              Kapat
            </T>
          </Pressable>
        </View>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Fon kodu veya adı (ör. FI5, para piyasası)"
          placeholderTextColor={t.tertiary}
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          returnKeyType="search"
          style={[styles.search, { backgroundColor: t.fill, color: t.label }]}
          accessibilityLabel="Fon ara"
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled" style={styles.chipRow}>
          {FUND_TYPES.map((ft) => {
            const on = ft.id === typeId;
            return (
              <Pressable
                key={ft.id}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  tap();
                  setTypeId(ft.id);
                }}
                style={[styles.chip, { backgroundColor: on ? t.label : t.card, borderColor: on ? t.label : t.separator }]}
              >
                <T v="sub" color={on ? t.bg : t.secondary} style={{ fontWeight: '600' }}>
                  {ft.label}
                </T>
              </Pressable>
            );
          })}
        </ScrollView>
        <FlatList
          data={result.items}
          keyExtractor={(f) => f.code}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: t.separator }]} />}
          ListEmptyComponent={<T muted style={{ padding: 16 }}>Sonuç yok.</T>}
          ListFooterComponent={
            result.total > result.items.length ? (
              <T v="caption" muted style={{ padding: 16 }}>
                {result.total - result.items.length} fon daha · aramayı daraltın
              </T>
            ) : null
          }
          renderItem={({ item: f }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                tap();
                setQuery('');
                onPick(f.code);
              }}
              style={({ pressed }) => [styles.row, { backgroundColor: pressed ? t.fill : t.card }]}
            >
              <T v="headline" num style={styles.code}>
                {f.code}
              </T>
              <View style={{ flex: 1 }}>
                <T v="sub" numberOfLines={2}>
                  {f.name}
                </T>
                <T v="caption" muted numberOfLines={1}>
                  {[shortType(f.type), f.risk ? `risk ${f.risk}` : null, f.size ? `${compactTl.format(f.size)} TL` : null].filter(Boolean).join(' · ')}
                </T>
              </View>
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, paddingTop: Platform.OS === 'ios' ? 16 : 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12 },
  search: { marginHorizontal: 16, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 17, borderCurve: 'continuous' },
  chipRow: { flexGrow: 0, marginVertical: 10 },
  chips: { paddingHorizontal: 16, gap: 6 },
  chip: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 6 },
  row: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center' },
  code: { width: 52 },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 80 },
});
