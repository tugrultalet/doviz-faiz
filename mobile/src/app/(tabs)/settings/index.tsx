import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Card, Screen, SectionTitle, Segmented, T, tap } from '@/components/ui';
import { SETTINGS, autoSetting, parseDays } from '@/features/model';
import { useAppStore, type Appearance, type SettingKey } from '@/features/store';
import { API_URL } from '@/lib/api';
import { fmtTime, nf } from '@/lib/format';
import { useTheme } from '@/theme';

export default function SettingsScreen() {
  const t = useTheme();
  const appearance = useAppStore((s) => s.appearance);
  const setAppearance = useAppStore((s) => s.setAppearance);
  const overrides = useAppStore((s) => s.overrides);
  const resetOverrides = useAppStore((s) => s.resetOverrides);
  const market = useAppStore((s) => s.market);
  const days = useAppStore((s) => s.days);
  const ctx = { market: market.data, days: parseDays(days) };

  return (
    <Screen>
      <SectionTitle>Görünüm</SectionTitle>
      <Segmented<Appearance>
        options={[
          { key: 'system', label: 'Sistem' },
          { key: 'light', label: 'Açık' },
          { key: 'dark', label: 'Koyu' },
        ]}
        value={appearance}
        onChange={setAppearance}
      />

      <SectionTitle
        right={
          Object.keys(overrides).length ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                tap();
                resetOverrides();
              }}
            >
              <T v="sub" color={t.accent} style={{ fontWeight: '600' }}>
                Otomatiğe döndür
              </T>
            </Pressable>
          ) : null
        }
      >
        Vergi ve oranlar
      </SectionTitle>
      <T v="caption" muted>
        Boş bıraktığınız değerler otomatik hesaplanır. Değiştirdiğiniz değerler mavi görünür.
      </T>
      <Card style={{ padding: 0, gap: 0 }}>
        {SETTINGS.map((s, i) => (
          <SettingRow key={s.key} k={s.key} label={s.label} unit={s.unit} last={i === SETTINGS.length - 1} auto={autoSetting(s.key, ctx)} />
        ))}
      </Card>

      <SectionTitle>Veri</SectionTitle>
      <Card>
        <T v="sub">Kaynak: TCMB EVDS (yedek: Avrupa Merkez Bankası).</T>
        <T v="caption" muted>
          Sunucu: {API_URL}
        </T>
        {market.at ? (
          <T v="caption" muted>
            Son güncelleme: {fmtTime(market.at)}
          </T>
        ) : null}
        <T v="caption" muted>
          Hesaplar geçmiş kur trendine dayanır. Yatırım tavsiyesi değildir.
        </T>
      </Card>
    </Screen>
  );
}

function SettingRow({ k, label, unit, last, auto }: { k: SettingKey; label: string; unit: string; last: boolean; auto: { value: number | null; hint?: string } }) {
  const t = useTheme();
  const value = useAppStore((s) => s.overrides[k]);
  const setOverride = useAppStore((s) => s.setOverride);
  // Text while typing ("0," is not a number yet); the store keeps the number.
  const [draft, setDraft] = useState<string | null>(null);
  const overridden = value != null;
  const shown = draft ?? (overridden ? nf(2).format(value).replace(/,00$/, '') : '');

  return (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.separator }]}>
      <View style={styles.rowTop}>
        <T v="sub" style={{ flex: 1 }}>
          {label}
        </T>
        <TextInput
          value={shown}
          placeholder={auto.value == null ? '–' : nf(2).format(auto.value).replace(/,00$/, '')}
          placeholderTextColor={t.tertiary}
          keyboardType="decimal-pad"
          selectTextOnFocus
          onChangeText={(text) => {
            setDraft(text);
            const n = Number(text.replace(',', '.'));
            setOverride(k, text.trim() === '' || !Number.isFinite(n) ? null : n);
          }}
          onBlur={() => setDraft(null)}
          style={[styles.input, { color: overridden ? t.accent : t.label, backgroundColor: t.fill }]}
          accessibilityLabel={label}
        />
        <T v="sub" muted style={{ width: 34 }}>
          {unit}
        </T>
      </View>
      {auto.hint ? (
        <T v="caption" muted>
          {auto.hint}
        </T>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 14, paddingVertical: 10, gap: 4 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { width: 76, textAlign: 'right', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, fontSize: 16, fontVariant: ['tabular-nums'] },
});
