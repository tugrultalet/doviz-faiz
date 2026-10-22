import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { useTheme } from '@/theme';
import { T, tap } from './ui';

/** "AI" pill at the top right of every tab: opens the voice advisor call. */
export function AdvisorButton() {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Sesli yatırım danışmanı"
      hitSlop={8}
      onPress={() => {
        tap();
        router.push('/advisor');
      }}
      style={({ pressed }) => [styles.pill, { backgroundColor: t.accent, opacity: pressed ? 0.7 : 1 }]}
    >
      <T v="sub" color="#FFFFFF" style={styles.label}>
        ✦ AI
      </T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  label: { fontWeight: '700', letterSpacing: 0.3 },
});
