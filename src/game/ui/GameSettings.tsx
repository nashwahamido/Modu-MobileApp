// In-game settings: a gear button that opens the shared SettingsControls in a cream modal card. Same controls as the homepage /settings screen — one source of truth, one look (adopted from the on-release engine).
import { router } from "expo-router";
import { useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Theme, useStyles } from "@/src/game/ui/theme";
import { SettingsControls } from "@/src/game/ui/SettingsControls";

const SETTINGS_ICON = require("@/src/assets/images/ui/setting_icon.png");

export function GameSettings() {
  const styles = useStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const { height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const cardMaxHeight = winH - insets.top - insets.bottom - 32;

  return (
    <>
      {/* Settings icon — rounded-square chip with a minimalist sliders glyph. subject to change*/}
      <Pressable
        style={[styles.gear]}
        onPress={() => setOpen(true)}
        hitSlop={8}
        accessibilityLabel="Settings"
      >
        <Image
          source={SETTINGS_ICON}
          style={[styles.icon]}
          resizeMode="contain"
        />
      </Pressable>

      {/* Real Modal so the scrim covers the WHOLE screen: this component lives inside the inset HUD container, where a plain absolute-fill overlay could only cover the container, leaving uncovered screen edges. */}
      <Modal
        visible={open}
        transparent
        animationType="fade"
        supportedOrientations={[
          "landscape",
          "landscape-left",
          "landscape-right",
          "portrait",
        ]}
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.backdrop} pointerEvents="box-none">
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
          />
          <View style={[styles.card, { maxHeight: cardMaxHeight }]}>
            <Text style={styles.title}>Settings</Text>
            <ScrollView
              contentContainerStyle={styles.cardScroll}
              showsVerticalScrollIndicator={false}
            >
              <SettingsControls />
            </ScrollView>
            <View style={styles.footer}>
              <Pressable
                onPress={() => {
                  setOpen(false);
                  router.navigate("/");
                }}
                hitSlop={8}
                accessibilityLabel="Return to home"
              >
                <Text style={styles.homeText}>⌂ Home</Text>
              </Pressable>
              <Pressable
                style={styles.done}
                onPress={() => setOpen(false)}
                hitSlop={8}
              >
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  gear: {
    position: "absolute",
    top: 8,
    left: 92,
    width: 42,
    height: 36,
    borderRadius: 12,
    backgroundColor: t.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: { width: 30, height: 30 },
  // The PNG is dark artwork; invert it (tint white) for the dark chip.
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: t.scrim,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    width: 340,
    maxWidth: "90%",
    backgroundColor: t.bg,
    borderRadius: 18,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  title: { fontSize: 17, fontWeight: "800", color: t.text, marginBottom: 2 },
  cardScroll: { paddingBottom: 4 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  homeText: { fontSize: 14, fontWeight: "700", color: t.textDim },
  done: {
    backgroundColor: t.success,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  doneText: { color: t.text, fontWeight: "700", fontSize: 14 },
  });
