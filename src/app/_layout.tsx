// This is the root router, where initialization code sits controlling orientation & safeArea view
import { useEffect } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import * as NavigationBar from "expo-navigation-bar";
import { Stack } from "expo-router";
import { OrientationLock } from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "react-native-reanimated";

import { useDevAutoSignIn } from "@/src/dev/devAuth";
import { GmTestPanel } from "@/src/dev/GmTestPanel";
import { AuthProvider } from "@/src/hooks/useAuth";
import { useCatalogSync } from "@/src/hooks/useCatalogSync";
import { useSessionGate } from "@/src/hooks/useSessionGate";
import { useScreenOrientationLock } from "@/src/hooks/use-screen-orientation-lock";
import { useGameStore } from "@/src/game/core/store";
import { setMusicEnabled, setMusicVolume } from "@/src/game/audio/music";
import { useRouteMusic } from "@/src/game/audio/useRouteMusic";

// The gated app tree. Lives INSIDE AuthProvider so useDevAutoSignIn reads the one shared session. While the dev session is coming up it holds render, so no screen mounts (and queries the DB) until a real user id is available — everything under here reads the same auth state in the same commit.
function AppContent() {
  const holdForDevAuth = useDevAutoSignIn();
  // Called before the early return below: hooks cannot be conditional.
  useSessionGate();
  useCatalogSync();
  // Music lives at the ROOT, not on the screens: the track follows the route, and the setting is
  // applied here so it holds across every screen rather than only where someone remembered to wire
  // it. Zero volume is off — see the settings meter.
  const musicOn = useGameStore((s) => s.settings.music);
  const musicVolume = useGameStore((s) => s.settings.musicVolume);
  useEffect(() => {
    setMusicVolume(musicVolume);
    setMusicEnabled(musicOn);
  }, [musicOn, musicVolume]);
  useRouteMusic();

  if (holdForDevAuth) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#000" }}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        {/* The (presentation) group is the modal LAYER: it presents over the current scene (hub or task) without unmounting it, so nothing behind it reloads. */}
        <Stack.Screen name="(presentation)" options={{ presentation: "modal" }} />
      </Stack>
      {__DEV__ && <GmTestPanel />}
      <StatusBar style="auto" hidden />
    </>
  );
}

export default function RootLayout() {
  useScreenOrientationLock(OrientationLock.LANDSCAPE);

  // Hide Android's system navigation bar (the gesture/3-button handles that were overlapping the joystick). "inset-swipe" = the bar stays gone and slides back only on an edge swipe, then auto-hides again — the standard game/immersive behaviour. No-op on iOS.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    NavigationBar.setVisibilityAsync("hidden");
    NavigationBar.setBehaviorAsync("inset-swipe");
  }, []);

  return (
    <AuthProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AppContent />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </AuthProvider>
  );
}