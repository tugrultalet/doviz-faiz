import * as Updates from 'expo-updates';
import { useEffect } from 'react';

/**
 * On launch, downloads an over-the-air update and restarts into it right away, so a fix reaches
 * the phone on the first open instead of the second. Off in development and in Expo Go.
 */
export function useOtaUpdate() {
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;
    void (async () => {
      try {
        const check = await Updates.checkForUpdateAsync();
        if (!check.isAvailable) return;
        const fetched = await Updates.fetchUpdateAsync();
        if (fetched.isNew) await Updates.reloadAsync();
      } catch {
        // No network or server error: the app keeps running the code it has.
      }
    })();
  }, []);
}
