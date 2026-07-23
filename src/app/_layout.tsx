// This is the root router, where initialization code sits controlling orientation & safeArea view
import { useEffect } from "react";
import { Platform } from "react-native";
import * as NavigationBar from "expo-navigation-bar";
import { Stack } from "expo-router";
import { OrientationLock } from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "react-native-reanimated";

import { GmTestPanel } from "@/src/components/GmTestPanel";
import { useScreenOrientationLock } from "@/src/hooks/use-screen-orientation-lock";

export default function RootLayout() {
  useScreenOrientationLock(OrientationLock.LANDSCAPE);

  // Hide Android's system navigation bar (the gesture/3-button handles that were overlapping
  // the joystick). "inset-swipe" = the bar stays gone and slides back only on an edge swipe,
  // then auto-hides again — the standard game/immersive behaviour. No-op on iOS.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    NavigationBar.setVisibilityAsync("hidden");
    NavigationBar.setBehaviorAsync("inset-swipe");
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Stack screenOptions={{ headerShown: false }} />
        <GmTestPanel />
        <StatusBar style="auto" hidden />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}