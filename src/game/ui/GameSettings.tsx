// In-game settings: a gear button that opens the shared SettingsControls in a cream modal card. Same controls as the homepage /settings screen — one source of truth, one look (adopted from the on-release engine).
import { router } from "expo-router";
import { useState } from "react";
import type { ReactNode } from "react";
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

interface GameSettingsProps {
  headerContent?: ReactNode;
  controls?: ReactNode;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  onConfirm?: () => void;
}

export function GameSettings({
  headerContent,
  controls,
  confirmLabel = "Done",
  confirmDisabled = false,
  onConfirm,
}: GameSettingsProps = {}) {
  const styles = useStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const { height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const cardMaxHeight = winH - insets.top - insets.bottom - 32;

  const closeSettings = () => setOpen(false);

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
        onRequestClose={closeSettings}
      >
        <View style={styles.backdrop} pointerEvents="box-none">
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeSettings}
          />
          <View style={[styles.card, { maxHeight: cardMaxHeight }]}>
            <Text style={styles.title}>Settings</Text>
            {headerContent}
            <ScrollView
              contentContainerStyle={styles.cardScroll}
              showsVerticalScrollIndicator={false}
            >
              {controls ?? <SettingsControls />}
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
                style={[styles.done, confirmDisabled && styles.doneDisabled]}
                onPress={() => {
                  if (confirmDisabled) return;
                  onConfirm?.();
                  closeSettings();
                }}
                hitSlop={8}
                disabled={confirmDisabled}
              >
                <Text style={styles.doneText}>{confirmLabel}</Text>
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
    // Top-left corner, above the undo button (top:54) and clear of the centred objective
    // bar. The XP that used to sit here now lives on the progress bar itself.
    left: 14,
    // 36×36 with RADIUS.control corners — the exact box IconButton(small) draws, so the
    // gear, the hint, and undo/redo below all sit on the same grid.
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: t.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  // 22 in a 36 box leaves the same breathing room as the glyphs in undo/redo; at 30 the
  // gear filled its button edge to edge once the box came down to 36.
  icon: { width: 22, height: 22 },
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
    // Purple, not green: Done is an ACTION, and every action in this palette is the accent.
    // Green is reserved for a COMPLETED step.
    backgroundColor: t.accent,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  doneDisabled: { opacity: 0.42 },
  doneText: { color: t.onAccent, fontWeight: "700", fontSize: 14 },
  });
