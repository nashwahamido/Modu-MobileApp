// This is the root router, where initialization code sits controlling orientation & safeArea view
import { Stack } from "expo-router";
import { OrientationLock } from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "react-native-reanimated";

import { useScreenOrientationLock } from "@/src/hooks/use-screen-orientation-lock";

export default function RootLayout() {
  useScreenOrientationLock(OrientationLock.LANDSCAPE);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Stack screenOptions={{ headerShown: false }} />
        <StatusBar style="auto" hidden />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
