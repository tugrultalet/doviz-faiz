import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import type { FxWidgetProps } from './FxWidget';

/** Expo Go has no widget module; loading it there would crash the app. */
const supported = Platform.OS === 'ios' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

let last = '';

/** Sends the latest rates to the home-screen widget (TestFlight / App Store builds only). */
export function syncWidget(props: FxWidgetProps) {
  if (!supported) return;
  const json = JSON.stringify(props);
  if (json === last) return;
  last = json;
  try {
    // Loaded on demand so Expo Go never evaluates the native widget module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { fxWidget } = require('./FxWidget') as typeof import('./FxWidget');
    fxWidget.updateSnapshot(props);
  } catch (err) {
    console.warn('Widget güncellenemedi', err);
  }
}
