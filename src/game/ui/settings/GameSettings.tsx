import { router } from "expo-router";
import { useHudIcon } from "@/src/game/ui/hud/hudIcons";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Image, Modal, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Pressable } from "@/src/components/Pressable";
import { useSafeInsets } from "@/src/hooks/use-safe-insets";
import {
  ELEVATION,
  RADIUS,
  Theme,
  useFixedStyles,
  useIsTablet,
  useScaledStyles,
  useUiScale,
  FONT,
} from "@/src/game/ui/system/theme";
import { useMirror } from "@/src/game/ui/system/handedness";
import { SettingsSizeScope } from "@/src/game/ui/settings/SettingsPrimitives";
import {
  SettingsControls,
  type SettingsFocusTarget,
} from "@/src/game/ui/settings/SettingsControls";
import { GrainOverlay } from "@/src/game/ui/system/Button";
import { useGameStore } from "@/src/game/core/store";

interface GameSettingsProps {
  headerContent?: ReactNode;
  controls?: ReactNode;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  onConfirm?: () => void;
  tutorialTarget?: SettingsFocusTarget | null;
  onTutorialTargetActivated?: () => void;
  onClosed?: () => void;
}

export function GameSettings({
  headerContent,
  controls,
  confirmLabel = "Done",
  confirmDisabled = false,
  onConfirm,
  tutorialTarget = null,
  onTutorialTargetActivated,
  onClosed,
}: GameSettingsProps = {}) {
  const chrome = useFixedStyles(makeChromeStyles);
  const k = useUiScale();
  const styles = useScaledStyles(makeCardStyles, k);
  const isTablet = useIsTablet();
  const m = useMirror();
  const settingsIcon = useHudIcon("settings");
  const [open, setOpen] = useState(false);
  const [tutorialTargetY, setTutorialTargetY] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const tutorialWasOpen = useRef(false);
  const tutorialSelectionMade = useRef(false);
  const { height: winH } = useWindowDimensions();
  const insets = useSafeInsets();
  const cardMaxHeight = winH - insets.top - insets.bottom;
  const cardWidth = CARD_W * k * (isTablet ? TABLET_WIDEN : 1);

  useEffect(() => {
    useGameStore.getState().setSettingsOpen(open);
    return () => useGameStore.getState().setSettingsOpen(false);
  }, [open]);

  const closeSettings = () => {
    const shouldAdvanceTutorial =
      tutorialTarget !== null && tutorialSelectionMade.current;
    tutorialSelectionMade.current = false;
    setOpen(false);
    if (shouldAdvanceTutorial) {
      requestAnimationFrame(() => onTutorialTargetActivated?.());
    }
    requestAnimationFrame(() => onClosed?.());
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
      <Pressable
        style={({ pressed }) => [m(chrome.gear), pressed && { opacity: 0.6 }]}
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
          style={[chrome.icon]}
          resizeMode="contain"
        />
      </Pressable>

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
          <View style={[styles.card, { width: cardWidth, maxHeight: cardMaxHeight }]}>
            <Text style={styles.title}>Settings</Text>
            {headerContent}
            <ScrollView
              ref={scrollRef}
              style={styles.cardScrollView}
              contentContainerStyle={styles.cardScroll}
              showsVerticalScrollIndicator={false}
            >
              <SettingsSizeScope k={k} wide={isTablet}>
                {controls ?? (
                  <SettingsControls
                    onRestarted={closeSettings}
                    focusTarget={tutorialTarget}
                    onFocusTargetLayout={setTutorialTargetY}
                    onFocusTargetActivated={() => {
                      tutorialSelectionMade.current = true;
                    }}
                  />
                )}
              </SettingsSizeScope>
            </ScrollView>
            <View style={styles.footer}>
              <Pressable
                onPress={() => {
                  setOpen(false);
                  router.replace("/room");
                }}
                hitSlop={8}
                accessibilityLabel="Return to room"
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

const CARD_W = 340;

const TABLET_WIDEN = 1.12;

const makeChromeStyles = (t: Theme) =>
  StyleSheet.create({
  gear: {
    position: "absolute",
    top: 8,
    left: 14,
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
  icon: {
    width: 24,
    height: 24,
  },
  });

const makeCardStyles = (t: Theme) =>
  StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: t.scrim,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
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
    backgroundColor: t.accent,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  doneDisabled: { opacity: 0.42 },
  doneText: { color: t.onAccent, fontFamily: FONT, fontWeight: "700", fontSize: 14 },
  });