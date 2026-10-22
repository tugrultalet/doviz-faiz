import type { NativeStackNavigationOptions } from 'expo-router';
import { Platform } from 'react-native';

import { useTheme } from '@/theme';

const ios = Platform.OS === 'ios';

/**
 * Small native title in the bar (no large title): the page starts right under the bar and more
 * data fits on the screen. On iOS the bar is transparent, so iOS 26 draws its Liquid Glass with a
 * soft fade under it; Android keeps a solid bar.
 */
export function useStackOptions(): NativeStackNavigationOptions {
  const t = useTheme();
  return {
    headerLargeTitleEnabled: false,
    headerTransparent: ios,
    scrollEdgeEffects: { top: 'soft' },
    headerLargeTitleShadowVisible: false,
    headerShadowVisible: false,
    headerStyle: ios ? undefined : { backgroundColor: t.bg },
    headerTintColor: t.accent,
    headerTitleStyle: { color: t.label, fontSize: 17, fontWeight: '600' },
    headerLargeTitleStyle: { color: t.label },
    headerBackButtonDisplayMode: 'minimal',
    contentStyle: { backgroundColor: t.bg },
  };
}
