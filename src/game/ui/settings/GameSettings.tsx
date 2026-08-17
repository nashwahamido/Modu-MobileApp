// In-game settings: a gear button that opens the shared SettingsControls in a cream modal card. Same controls as the homepage /settings screen — one source of truth, one look (adopted from the on-release engine).
import { router } from "expo-router";
import { useHudIcon } from "@/src/game/ui/hud/hudIcons";
import { useEffect, useRef, useState } from "react";
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
import { useSafeInsets } from "@/src/hooks/use-safe-insets";
import { ELEVATION, RADIUS, Theme, useFixedStyles, FONT } from "@/src/game/ui/system/theme";
import {
  SettingsControls,
  type SettingsFocusTarget,
} from "@/src/game/ui/settings/SettingsControls";
import { GrainOverlay } from "@/src/game/ui/system/Button";


interface GameSettingsProps {
  headerContent?: ReactNode;
  controls?: ReactNode;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  onConfirm?: () => void;
  tutorialTarget?: SettingsFocusTarget | null;
  onTutorialTargetActivated?: () => void;
}

export function GameSettings({
  headerContent,
  controls,
  confirmLabel = "Done",
  confirmDisabled = false,
  onConfirm,
  tutorialTarget = null,
  onTutorialTargetActivated,
}: GameSettingsProps = {}) {
  const styles = useFixedStyles(makeStyles);
  const settingsIcon = useHudIcon("settings");
  const [open, setOpen] = useState(false);
  const [tutorialTargetY, setTutorialTargetY] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const tutorialWasOpen = useRef(false);
  const tutorialSelectionMade = useRef(false);
  const { height: winH } = useWindowDimensions();
  // The FLOORED insets, not the raw ones: immersive mode reports 0 on both test devices, so reading them directly made this the full window height and the card ran off the top and bottom edges.
  const insets = useSafeInsets();
  const cardMaxHeight = winH - insets.top - insets.bottom;

  const closeSettings = () => {
    const shouldAdvanceTutorial =
      tutorialTarget !== null && tutorialSelectionMade.current;
    tutorialSelectionMade.current = false;
    setOpen(false);
    if (shouldAdvanceTutorial) {
      requestAnimationFrame(() => onTutorialTargetActivated?.());
    }
  };

  useEffect(() => {
    setTutorialTargetY(null);
    tutorialSelectionMade.current = false;
    if (!tutorialTarget && tutorialWasOpen.current) {
      tutorialWasOpen.current = false;
      setOpen(false);
    }
  }, [tutorialTarget]);

  useEffect(() => {
    if (!open || tutorialTargetY === null) return;
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(0, tutorialTargetY - 12),
        animated: true,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, tutorialTargetY]);

  return (
    <>
      {/* Settings icon — rounded-square chip with a minimalist sliders glyph. subject to change*/}
      <Pressable
        style={({ pressed }) => [styles.gear, pressed && { opacity: 0.6 }]}
        onPress={() => {
          if (tutorialTarget) {
            tutorialWasOpen.current = true;
            tutorialSelectionMade.current = false;
          }
          setOpen(true);
        }}
        hitSlop={8}
        accessibilityLabel="Settings"
      >
        <GrainOverlay radius={RADIUS.control} />
        <Image
          source={settingsIcon}
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
        <View
          style={[styles.backdrop, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
          pointerEvents="box-none"
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeSettings}
          />
          <View style={[styles.card, { maxHeight: cardMaxHeight }]}>
            <Text style={styles.title}>Settings</Text>
            {headerContent}
            <ScrollView
              ref={scrollRef}
              style={styles.cardScrollView}
              contentContainerStyle={styles.cardScroll}
              showsVerticalScrollIndicator={false}
            >
              {controls ?? (
                <SettingsControls
                  focusTarget={tutorialTarget}
                  onFocusTargetLayout={setTutorialTargetY}
                  onFocusTargetActivated={() => {
                    tutorialSelectionMade.current = true;
                  }}
                />
              )}
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
                <View style={styles.homeRow}>
                  <Image
                    source={require("@/src/assets/ui/icons/icon-home.png")}
                    style={styles.homeIcon}
                    resizeMode="contain"
                  />
                  <Text style={styles.homeText}>Home</Text>
                </View>
              </Pressable>
              <Pressable
                style={[styles.done, confirmDisabled && styles.doneDisabled]}
                onPress={() => {
                  if (confirmDisabled) return;
                  onConfirm?.();
                  // Viewing the highlighted setting is enough during the
                  // walkthrough. Players may keep the current value and use
                  // Done to return to the assembly before the next cue.
                  if (tutorialTarget) {
                    tutorialSelectionMade.current = true;
                  }
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
    // Top-left corner, above the undo button (top:54) and clear of the centred objective bar. The XP that used to sit here now lives on the progress bar itself.
    left: 14,
    // 36×36 with RADIUS.control corners — the exact box IconButton(small) draws, so the gear, the hint, and undo/redo below all sit on the same grid.
    width: 36,
    height: 36,
    borderRadius: RADIUS.control,
    borderWidth: 1,
    backgroundColor: t.surface,
    borderColor: t.border,
    ...ELEVATION.card,
    alignItems: "center",
    justifyContent: "center",
  },
  // 22 in a 36 box leaves the same breathing room as the glyphs in undo/redo; at 30 the gear filled its button edge to edge once the box came down to 36.
  icon: {
    // Matches HUD_ICON so the gear sits at the same weight as undo, recenter and pause.
    width: 24,
    height: 24,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
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
  title: { fontFamily: FONT, fontSize: 17, fontWeight: "800", color: t.text, marginBottom: 2 },
  // flexShrink is the whole fix for the cut-off card: without it a ScrollView sizes to its CONTENT and overflows a maxHeight parent instead of scrolling inside it, pushing the title off the top and the footer off the bottom.
  cardScrollView: { flexShrink: 1 },
  cardScroll: { paddingBottom: 4 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  homeText: { fontFamily: FONT, fontSize: 14, fontWeight: "700", color: t.textDim },
  homeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  homeIcon: { width: 20, height: 20 },
  done: {
    // Purple, not green: Done is an ACTION, and every action in this palette is the accent. Green is reserved for a COMPLETED step.
    backgroundColor: t.accent,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  doneDisabled: { opacity: 0.42 },
  doneText: { color: t.onAccent, fontFamily: FONT, fontWeight: "700", fontSize: 14 },
  });