import { useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { useAppStore } from '@/features/store';

/** iOS grouped colors with the website's series colors (validated dataviz palette). */
const palette = {
  light: {
    bg: '#F2F2F7',
    card: '#FFFFFF',
    fill: '#E9E9EE',
    label: '#000000',
    secondary: '#5E5E63',
    tertiary: '#8A8A8E',
    separator: '#D1D1D6',
    grid: '#E5E5EA',
    accent: '#2A78D6',
    accentSoft: '#E6EFFB',
    good: '#0A7A3D',
    goodSoft: '#E3F4EA',
    bad: '#B3261E',
    badSoft: '#FBE7E5',
    usd: '#2A78D6',
    eur: '#EB6834',
    parity: '#1BAF7A',
    gold: '#EDA100',
  },
  dark: {
    bg: '#000000',
    card: '#1C1C1E',
    fill: '#2C2C2E',
    label: '#FFFFFF',
    secondary: '#AEAEB2',
    tertiary: '#8E8E93',
    separator: '#38383A',
    grid: '#2C2C2E',
    accent: '#3987E5',
    accentSoft: '#15243A',
    good: '#6FD39A',
    goodSoft: '#173524',
    bad: '#F2948D',
    badSoft: '#3D1A17',
    usd: '#3987E5',
    eur: '#D95926',
    parity: '#199E70',
    gold: '#C98500',
  },
};

export type Theme = (typeof palette)['light'] & { scheme: 'light' | 'dark' };

/** The scheme in effect after the user's Görünüm choice. */
export function useScheme(): 'light' | 'dark' {
  const system = useColorScheme();
  const appearance = useAppStore((s) => s.appearance);
  if (appearance !== 'system') return appearance;
  return system === 'dark' ? 'dark' : 'light';
}

export function useTheme(): Theme {
  const scheme = useScheme();
  return useMemo(() => ({ ...palette[scheme], scheme }), [scheme]);
}
