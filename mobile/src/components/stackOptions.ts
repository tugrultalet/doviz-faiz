import type { NativeStackNavigationOptions } from 'expo-router';
import { Platform } from 'react-native';

import { useTheme } from '@/theme';

const ios = Platform.OS === 'ios';

/**
 * Large native title that shrinks on scroll. On iOS the bar is transparent, so
 * iOS 26 draws its Liquid Glass with a soft fade under it; Android keeps a solid bar.
 */
export function useStackOptions(): NativeStackNavigationOptions {
  const t = useTheme();
  return {
    headerLargeTitleEnabled: true,
    headerTransparent: ios,
    scrollEdgeEffects: { top: 'soft' },
    headerLargeTitleShadowVisible: false,
    headerShadowVisible: false,
    headerStyle: ios ? undefined : { backgroundColor: t.bg },
    headerTintColor: t.accent,
    headerTitleStyle: { color: t.label },
    headerLargeTitleStyle: { color: t.label },
    headerBackButtonDisplayMode: 'minimal',
    contentStyle: { backgroundColor: t.bg },
  };
}
