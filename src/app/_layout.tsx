// This is the root router, where initialization code sits
// controlling dark/light theme

import { Stack } from 'expo-router';
import { OrientationLock } from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { useScreenOrientationLock } from '@/src/hooks/use-screen-orientation-lock';

export default function RootLayout() {
  // The whole app is landscape. app.json's "orientation" covers fresh native
  // builds; this runtime lock covers every screen regardless, including dev
  // clients built before the app.json change.
  useScreenOrientationLock(OrientationLock.LANDSCAPE);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="auto" hidden />
    </GestureHandlerRootView>
  );
}
