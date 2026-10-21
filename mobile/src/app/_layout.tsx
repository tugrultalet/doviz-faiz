import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Appearance } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useAppStore } from '@/features/store';
import { useTheme } from '@/theme';

export default function RootLayout() {
  const t = useTheme();
  const appearance = useAppStore((s) => s.appearance);

  // Native controls (tab bar, headers, keyboard) follow the Görünüm choice too. Not on web.
  useEffect(() => {
    if (typeof Appearance.setColorScheme === 'function') Appearance.setColorScheme(appearance === 'system' ? 'unspecified' : appearance);
  }, [appearance]);

  const base = t.scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, primary: t.accent, background: t.bg, card: t.bg, text: t.label, border: t.separator },
  };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: t.bg }}>
      <ThemeProvider value={navTheme}>
        <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
          <Stack.Screen name="(tabs)" />
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
