import { useEffect, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { avatarForProfile } from "@/src/game/core/avatar";
import type { AccessibilitySettings, ControlGuidanceLevel } from "@/src/game/core/accessibility";
import {
  CONTROL_GUIDANCE_PRESETS,
  controlGuidanceIsCustomized,
} from "@/src/game/core/controlGuidance";
import { useGameStore } from "@/src/game/core/store";
import { ELEVATION, RADIUS, Theme, useStyles } from "@/src/game/ui/theme";

const LEVELS: ControlGuidanceLevel[] = ["minimal", "balanced", "detailed"];

interface Props {
  onBlockingChange?: (blocked: boolean) => void;
  guidanceEnabled: boolean;
  onGuidanceChange: (enabled: boolean) => void;
}

export function ControlSupportPanel({
  onBlockingChange,
  guidanceEnabled,
  onGuidanceChange,
}: Props) {
  const styles = useStyles(makeStyles);
  const settings = useGameStore((s) => s.settings);
  const setSettings = useGameStore((s) => s.setSettings);
  const [open, setOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [choiceMade, setChoiceMade] = useState(false);
  const [showExploreToast, setShowExploreToast] = useState(false);
  const guidanceLevel = settings.controlGuidanceLevel;
  const levelCustomized = controlGuidanceIsCustomized(settings);

  useEffect(() => {
    onBlockingChange?.(open || paused || !choiceMade);
  }, [choiceMade, onBlockingChange, open, paused]);

  useEffect(() => {
    if (!showExploreToast) return;
    const timeout = setTimeout(() => setShowExploreToast(false), 2800);
    return () => clearTimeout(timeout);
  }, [showExploreToast]);

  const chooseLevel = (next: ControlGuidanceLevel) => {
    setSettings({
      ...CONTROL_GUIDANCE_PRESETS[next],
      controlGuidanceLevel: next,
    });
  };
  const setBoolean = (key: keyof AccessibilitySettings, value: boolean) => {
    setSettings({ [key]: value });
  };

  return (
    <>
      <View style={styles.launcher} pointerEvents="box-none">
        <View style={styles.avatarFrame}>
          <Image source={avatarForProfile("control")} style={styles.avatar} resizeMode="cover" />
        </View>
        <Pressable
          style={({ pressed }) => [styles.supportButton, pressed && styles.pressed]}
          onPress={() => setOpen(true)}
          accessibilityLabel="Open adjustable support"
        >
          <Text style={styles.supportLabel}>Support</Text>
        </Pressable>
        {showExploreToast ? (
          <View style={styles.exploreToast} pointerEvents="none">
            <Text style={styles.introTitle}>Explore your way.</Text>
            <Text style={styles.introText}>Turn guidance on anytime from Support.</Text>
          </View>
        ) : null}
      </View>

      <Modal
        visible={!choiceMade}
        transparent
        animationType="fade"
        supportedOrientations={["landscape", "landscape-left", "landscape-right"]}
        onRequestClose={() => {}}
      >
        <View style={styles.choiceRoot}>
          <View style={styles.choiceCard}>
            <Image source={avatarForProfile("control")} style={styles.choiceAvatar} resizeMode="cover" />
            <View style={styles.choiceCopy}>
              <Text style={styles.choiceTitle}>Would you like some guidance to get started?</Text>
              <Text style={styles.choiceText}>You can change this anytime from Support.</Text>
              <View style={styles.choiceActions}>
                <Pressable
                  style={({ pressed }) => [styles.primaryChoice, pressed && styles.pressed]}
                  onPress={() => {
                    onGuidanceChange(true);
                    chooseLevel(guidanceLevel);
                    setChoiceMade(true);
                  }}
                >
                  <Text style={styles.primaryChoiceText}>Guide me</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.secondaryChoice, pressed && styles.pressed]}
                  onPress={() => {
                    onGuidanceChange(false);
                    setChoiceMade(true);
                    setShowExploreToast(true);
                  }}
                >
                  <Text style={styles.secondaryChoiceText}>Explore on my own</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        supportedOrientations={["landscape", "landscape-left", "landscape-right"]}
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <View>
                <Text style={styles.panelTitle}>Adjustable Support</Text>
                <Text style={styles.panelSubtitle}>Choose how much help feels right.</Text>
              </View>
              <Pressable style={styles.closeButton} onPress={() => setOpen(false)} hitSlop={8}>
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>

            <SupportToggle
              label="Guided tutorial"
              value={guidanceEnabled}
              onChange={onGuidanceChange}
              emphasized
            />
            <View style={styles.divider} />
            <Text style={styles.sectionLabel}>Guidance level</Text>
            <View style={styles.levelTrack}>
              <View style={styles.trackLine} />
              {LEVELS.map((candidate) => {
                const selected = guidanceLevel === candidate;
                return (
                  <Pressable
                    key={candidate}
                    style={styles.levelStop}
                    onPress={() => chooseLevel(candidate)}
                  >
                    <View style={[styles.levelDot, selected && styles.levelDotSelected]} />
                    <Text style={[styles.levelLabel, selected && styles.levelLabelSelected]}>
                      {capitalize(candidate)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {levelCustomized ? (
              <Text style={styles.customLabel}>Customized from {capitalize(guidanceLevel)}</Text>
            ) : null}

            <View style={styles.divider} />
            <SupportToggle
              label="Hints"
              value={settings.softHints}
              onChange={(value) => setBoolean("softHints", value)}
            />
            <SupportToggle
              label="Sound"
              value={settings.audio}
              onChange={(value) => setBoolean("audio", value)}
            />
            <SupportToggle
              label="Text instructions"
              value={settings.showInstructions}
              onChange={(value) => setBoolean("showInstructions", value)}
            />
            <SupportToggle
              label="Focus mode"
              value={settings.focusMode}
              onChange={(value) => setBoolean("focusMode", value)}
            />
            <SupportToggle
              label="UI overlay"
              value={settings.showUiOverlay}
              onChange={(value) => setBoolean("showUiOverlay", value)}
            />

            <Pressable
              style={({ pressed }) => [styles.pauseButton, pressed && styles.pressed]}
              onPress={() => {
                setOpen(false);
                setPaused(true);
              }}
            >
              <Text style={styles.pauseLabel}>Ⅱ&nbsp;&nbsp; Pause assembly</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={paused}
        transparent
        animationType="fade"
        supportedOrientations={["landscape", "landscape-left", "landscape-right"]}
        onRequestClose={() => setPaused(false)}
      >
        <View style={styles.pauseRoot}>
          <View style={styles.pauseCard}>
            <Image source={avatarForProfile("control")} style={styles.pauseAvatar} resizeMode="cover" />
            <Text style={styles.pauseTitle}>Assembly paused</Text>
            <Text style={styles.pauseText}>Take your time. Your progress is saved.</Text>
            <Pressable style={styles.resumeButton} onPress={() => setPaused(false)}>
              <Text style={styles.resumeLabel}>Resume when ready</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

function SupportToggle({
  label,
  value,
  onChange,
  emphasized = false,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  emphasized?: boolean;
}) {
  const styles = useStyles(makeStyles);
  return (
    <View style={[styles.toggleRow, emphasized && styles.toggleRowEmphasized]}>
      <Text style={[styles.toggleLabel, emphasized && styles.toggleLabelEmphasized]}>{label}</Text>
      <Switch
        style={styles.toggleSwitch}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: styles.toggleTrack.color }}
      />
    </View>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    launcher: {
      position: "absolute",
      top: 4,
      // Keep a deliberate gap from the Settings control instead of visually
      // merging Felix into the left-hand utility stack.
      left: 106,
      height: 44,
      flexDirection: "row",
      alignItems: "center",
      zIndex: 30,
    },
    avatarFrame: {
      width: 44,
      height: 44,
      borderRadius: 22,
      overflow: "hidden",
      borderWidth: 2,
      borderColor: t.accent,
      backgroundColor: t.surface,
      zIndex: 2,
    },
    avatar: { width: 72, height: 72, marginLeft: -14, marginTop: -7 },
    supportButton: {
      height: 36,
      marginLeft: -7,
      paddingLeft: 14,
      paddingRight: 12,
      borderRadius: RADIUS.pill,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.borderStrong,
      ...ELEVATION.card,
    },
    supportLabel: { color: t.text, fontSize: 12, fontWeight: "800" },
    pressed: { opacity: 0.72 },
    exploreToast: {
      position: "absolute",
      left: 142,
      top: 0,
      width: 205,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 12,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
    },
    introTitle: { color: t.text, fontSize: 10, fontWeight: "800" },
    introText: { color: t.textDim, fontSize: 9, fontWeight: "600", marginTop: 1 },
    choiceRoot: { flex: 1, backgroundColor: t.scrim, alignItems: "center", justifyContent: "center" },
    choiceCard: {
      width: 570,
      minHeight: 210,
      padding: 24,
      borderRadius: RADIUS.panel,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.borderStrong,
      flexDirection: "row",
      alignItems: "center",
      gap: 22,
      ...ELEVATION.card,
    },
    choiceAvatar: { width: 132, height: 132, borderRadius: 66 },
    choiceCopy: { flex: 1 },
    choiceTitle: { color: t.text, fontSize: 20, lineHeight: 27, fontWeight: "900" },
    choiceText: { color: t.textDim, fontSize: 11, fontWeight: "600", marginTop: 5 },
    choiceActions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 20 },
    primaryChoice: { height: 42, paddingHorizontal: 22, borderRadius: RADIUS.pill, backgroundColor: t.accent, alignItems: "center", justifyContent: "center" },
    primaryChoiceText: { color: t.onAccent, fontSize: 12, fontWeight: "900" },
    secondaryChoice: { height: 42, paddingHorizontal: 18, borderRadius: RADIUS.pill, backgroundColor: t.surfaceRaised, borderWidth: 1, borderColor: t.borderStrong, alignItems: "center", justifyContent: "center" },
    secondaryChoiceText: { color: t.text, fontSize: 12, fontWeight: "800" },
    modalRoot: {
      flex: 1,
      backgroundColor: t.scrim,
      alignItems: "flex-end",
      justifyContent: "center",
      paddingVertical: 12,
      paddingRight: 24,
    },
    panel: {
      width: 360,
      maxHeight: "100%",
      paddingHorizontal: 22,
      paddingVertical: 12,
      borderRadius: RADIUS.panel,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.borderStrong,
      ...ELEVATION.card,
    },
    panelHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
    panelTitle: { color: t.text, fontSize: 18, fontWeight: "900" },
    panelSubtitle: { color: t.textDim, fontSize: 11, fontWeight: "600", marginTop: 2 },
    closeButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: t.surfaceRaised, alignItems: "center", justifyContent: "center" },
    closeText: { color: t.text, fontSize: 22, lineHeight: 24, fontWeight: "500" },
    sectionLabel: { color: t.text, fontSize: 12, fontWeight: "800", marginTop: 9 },
    levelTrack: { height: 46, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginTop: 5 },
    trackLine: { position: "absolute", left: 22, right: 22, top: 9, height: 4, borderRadius: 2, backgroundColor: t.surfaceInset },
    levelStop: { width: 88, alignItems: "center" },
    levelDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: t.surfaceRaised, borderWidth: 2, borderColor: t.borderStrong },
    levelDotSelected: { backgroundColor: t.accent, borderColor: t.accent },
    levelLabel: { color: t.textDim, fontSize: 10, fontWeight: "700", marginTop: 6 },
    levelLabelSelected: { color: t.accent, fontWeight: "900" },
    customLabel: { color: t.accent, fontSize: 10, fontWeight: "800", textAlign: "center", marginTop: -7 },
    divider: { height: 1, backgroundColor: t.border, marginVertical: 4 },
    toggleRow: { minHeight: 30, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    toggleRowEmphasized: { minHeight: 38, marginTop: 7, paddingHorizontal: 10, borderRadius: 12, backgroundColor: t.surfaceRaised },
    toggleLabel: { color: t.text, fontSize: 13, fontWeight: "700" },
    toggleLabelEmphasized: { color: t.accent, fontWeight: "900" },
    toggleSwitch: { transform: [{ scaleX: 0.82 }, { scaleY: 0.82 }] },
    toggleTrack: { color: t.accent },
    pauseButton: { height: 36, marginTop: 7, borderRadius: RADIUS.control, backgroundColor: t.surfaceRaised, alignItems: "center", justifyContent: "center" },
    pauseLabel: { color: t.text, fontSize: 12, fontWeight: "800" },
    pauseRoot: { flex: 1, backgroundColor: t.scrim, alignItems: "center", justifyContent: "center" },
    pauseCard: { width: 360, alignItems: "center", padding: 24, borderRadius: RADIUS.panel, backgroundColor: t.surface, borderWidth: 1, borderColor: t.borderStrong, ...ELEVATION.card },
    pauseAvatar: { width: 78, height: 78, borderRadius: 39, marginBottom: 10 },
    pauseTitle: { color: t.text, fontSize: 22, fontWeight: "900" },
    pauseText: { color: t.textDim, fontSize: 12, fontWeight: "600", marginTop: 6 },
    resumeButton: { marginTop: 18, height: 44, paddingHorizontal: 26, borderRadius: RADIUS.pill, backgroundColor: t.accent, alignItems: "center", justifyContent: "center" },
    resumeLabel: { color: t.onAccent, fontSize: 13, fontWeight: "900" },
  });
