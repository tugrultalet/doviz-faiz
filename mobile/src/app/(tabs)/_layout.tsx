import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useTheme } from '@/theme';

/** System tab bar: Liquid Glass on iOS 26, Material 3 navigation bar on Android. */
export default function TabsLayout() {
  const t = useTheme();
  return (
    <NativeTabs tintColor={t.accent}>
      <NativeTabs.Trigger name="(fx)">
        <NativeTabs.Trigger.Label>Döviz</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'chart.line.uptrend.xyaxis', selected: 'chart.line.uptrend.xyaxis' }} md="show_chart" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="gold">
        <NativeTabs.Trigger.Label>Altın</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'circle.hexagongrid', selected: 'circle.hexagongrid.fill' }} md="paid" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="funds">
        <NativeTabs.Trigger.Label>Fon</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'chart.pie', selected: 'chart.pie.fill' }} md="pie_chart" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="stats">
        <NativeTabs.Trigger.Label>İstatistik</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'chart.bar', selected: 'chart.bar.fill' }} md="bar_chart" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Ayarlar</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
