import { Stack } from 'expo-router';

import { useStackOptions } from '@/components/stackOptions';

export default function Layout() {
  const options = useStackOptions();
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="index" options={{ title: 'Altın' }} />
    </Stack>
  );
}
