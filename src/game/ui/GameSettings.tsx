import { router } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGameStore } from "@/src/game/core/store";
import type { AssemblyMode, BackdropId, RenderStyleId, TextLevel } from "@/src/game/core/type";

/**
 * Top-left gear on the 3D screen. Opens a centered settings modal (Nashwa's UI
 * style — cream card, Switch rows + segmented selectors, a Done button) that
 * surfaces every player-facing feature so they can change it mid-build:
 * assembly mode (free/guide/strict), 3D render style, dark mode, focus mode +
 * auto-view, instruction wording, audio steps, free-mode err hints, tool
 * choice, and text size. Only the LOOK is Nashwa's — the options are our full set.
 */
const MODES: { id: AssemblyMode; label: string }[] = [
  { id: "free", label: "Free" },
  { id: "guide", label: "Guide" },
  { id: "strict", label: "Strict" },
];
const STYLES: { id: RenderStyleId; label: string }[] = [
  { id: "realistic", label: "Realistic" },
  { id: "cozy", label: "Cozy" },
  { id: "cartoon", label: "Cartoon" },
];
const BACKDROPS: { id: BackdropId; label: string }[] = [
  { id: "clean", label: "Clean" },
  { id: "studio", label: "Studio" },
  { id: "dot", label: "Dot" },
];
const LEVELS: { id: TextLevel; label: string }[] = [
  { id: "standard", label: "Standard" },
  { id: "simple", label: "Simple" },
];

function Segmented<T extends string>({
  label,
  desc,
  value,
  options,
  onChange,
  dark,
}: {
  label: string;
  desc?: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  dark: boolean;
}) {
  return (
    <View style={styles.block}>
      <Text style={[styles.rowLabel, dark && styles.textLight]}>{label}</Text>
      {desc ? (
        <Text style={[styles.rowDesc, dark && styles.rowDescDark]}>{desc}</Text>
      ) : null}
      <View style={styles.segment}>
        {options.map((o) => {
          const active = o.id === value;
          return (
            <Pressable
              key={o.id}
              onPress={() => onChange(o.id)}
              hitSlop={4}
              style={[
                styles.segBtn,
                dark && styles.segBtnDark,
                active && styles.segBtnActive,
              ]}
            >
              <Text
                style={[styles.segText, active && styles.segTextActive]}
                numberOfLines={2}
              >
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ToggleRow({
  label,
  desc,
  value,
  onValueChange,
  dark,
}: {
  label: string;
  desc?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  dark: boolean;
}) {
  return (
    <View style={[styles.row, dark && styles.rowDark]}>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, dark && styles.textLight]}>{label}</Text>
        {desc ? (
          <Text style={[styles.rowDesc, dark && styles.rowDescDark]}>{desc}</Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: "#c9c2b4", true: "#6f8a68" }}
        thumbColor="#fff"
      />
    </View>
  );
}

export function GameSettings() {
  const [open, setOpen] = useState(false);
  const { height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const cardMaxHeight = winH - insets.top - insets.bottom - 32;
  const mode = useGameStore((s) => s.mode);
  const renderStyle = useGameStore((s) => s.renderStyle);
  const backdrop = useGameStore((s) => s.backdrop);
  const theme = useGameStore((s) => s.theme);
  const dark = theme === "dark";
  const settings = useGameStore((s) => s.settings);
  const setMode = useGameStore((s) => s.setMode);
  const setRenderStyle = useGameStore((s) => s.setRenderStyle);
  const setBackdrop = useGameStore((s) => s.setBackdrop);
  const setTheme = useGameStore((s) => s.setTheme);
  const setSettings = useGameStore((s) => s.setSettings);

  const changeFont = (delta: number) =>
    setSettings({
      fontScale: Math.min(1.5, Math.max(0.9, +(settings.fontScale + delta).toFixed(2))),
    });

  return (
    <>
      <Pressable
        style={[styles.gear, dark && styles.gearDark]}
        onPress={() => setOpen(true)}
        hitSlop={8}
        accessibilityLabel="Settings"
      >
        <Text style={[styles.gearText, dark && styles.textLight]}>⚙</Text>
      </Pressable>

      {open ? (
        <View style={styles.backdrop} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View
            style={[styles.card, dark && styles.cardDark, { maxHeight: cardMaxHeight }]}
          >
            <Text style={[styles.title, dark && styles.textLight]}>Settings</Text>
            <ScrollView
              contentContainerStyle={styles.cardScroll}
              showsVerticalScrollIndicator={false}
            >
              <Segmented
                label="Mode"
                desc="How much the game guides you"
                value={mode}
                options={MODES}
                onChange={setMode}
                dark={dark}
              />
              <Segmented
                label="Model look"
                desc="How the furniture is rendered"
                value={renderStyle}
                options={STYLES}
                onChange={setRenderStyle}
                dark={dark}
              />
              <Segmented
                label="Background"
                desc="Scene backdrop, separate from the model"
                value={backdrop}
                options={BACKDROPS}
                onChange={setBackdrop}
                dark={dark}
              />
              <Segmented
                label="Instructions"
                desc="Wording detail for each step"
                value={settings.textLevel}
                options={LEVELS}
                onChange={(v) => setSettings({ textLevel: v })}
                dark={dark}
              />
              <ToggleRow
                label="Audio steps"
                desc="Speak each step aloud"
                value={settings.audio}
                onValueChange={(v) => setSettings({ audio: v })}
                dark={dark}
              />
              <ToggleRow
                label="Dark mode"
                desc="Use the dark background theme"
                value={dark}
                onValueChange={(v) => setTheme(v ? "dark" : "light")}
                dark={dark}
              />
              <ToggleRow
                label="Focus mode"
                desc="Strip the screen to the current part"
                value={settings.focusMode}
                onValueChange={(v) => setSettings({ focusMode: v })}
                dark={dark}
              />
              <ToggleRow
                label="Auto-view"
                desc="Keep the next target in view"
                value={settings.autoView}
                onValueChange={(v) => setSettings({ autoView: v })}
                dark={dark}
              />
              <ToggleRow
                label="Err hints"
                desc="Nudge after a part flies back"
                value={settings.softHints}
                onValueChange={(v) => setSettings({ softHints: v })}
                dark={dark}
              />
              <ToggleRow
                label="Choose tools"
                desc="Pick the tool yourself before tightening"
                value={settings.manualTools}
                onValueChange={(v) => setSettings({ manualTools: v })}
                dark={dark}
              />
              <View style={[styles.row, dark && styles.rowDark]}>
                <View style={styles.rowText}>
                  <Text style={[styles.rowLabel, dark && styles.textLight]}>Text size</Text>
                  <Text style={[styles.rowDesc, dark && styles.rowDescDark]}>
                    Objective and hint text size
                  </Text>
                </View>
                <View style={styles.stepper}>
                  <Pressable
                    style={[styles.stepBtn, dark && styles.stepBtnDark]}
                    onPress={() => changeFont(-0.1)}
                    hitSlop={6}
                  >
                    <Text style={[styles.stepText, dark && styles.textLight]}>A-</Text>
                  </Pressable>
                  <Text style={[styles.stepVal, dark && styles.textLight]}>
                    {settings.fontScale.toFixed(1)}x
                  </Text>
                  <Pressable
                    style={[styles.stepBtn, dark && styles.stepBtnDark]}
                    onPress={() => changeFont(0.1)}
                    hitSlop={6}
                  >
                    <Text style={[styles.stepText, dark && styles.textLight]}>A+</Text>
                  </Pressable>
                </View>
              </View>
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
                <Text style={[styles.homeText, dark && styles.homeTextDark]}>⌂ Home</Text>
              </Pressable>
              <Pressable style={styles.done} onPress={() => setOpen(false)} hitSlop={8}>
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  gear: {
    position: "absolute",
    top: 10,
    left: 92,
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.75)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
  },
  gearDark: { backgroundColor: "rgba(22,30,44,0.82)" },
  gearText: { fontSize: 20, color: "#2e2a24" },

  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(20,18,15,0.35)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 30,
  },
  card: {
    width: 340,
    maxWidth: "88%",
    backgroundColor: "#f7f3ea",
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  cardDark: { backgroundColor: "#1b2230" },
  title: { fontSize: 17, fontWeight: "800", color: "#2e2a24", marginBottom: 4 },
  cardScroll: { paddingVertical: 2 },

  block: { paddingVertical: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(60,50,40,0.08)",
  },
  rowDark: { borderTopColor: "rgba(255,255,255,0.08)" },
  rowText: { flex: 1, paddingRight: 12 },
  rowLabel: { fontSize: 15, fontWeight: "700", color: "#2e2a24" },
  rowDesc: { fontSize: 12, color: "#7a7163", marginTop: 2 },
  rowDescDark: { color: "#9aa4b4" },

  segment: { flexDirection: "row", gap: 6, marginTop: 10 },
  segBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: "#ece6d8",
    borderWidth: 1,
    borderColor: "rgba(60,50,40,0.12)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  segBtnDark: {
    backgroundColor: "#2a3446",
    borderColor: "rgba(255,255,255,0.12)",
  },
  segBtnActive: { backgroundColor: "#6f8a68", borderColor: "#6f8a68" },
  segText: { fontSize: 12, fontWeight: "700", color: "#5a5346", textAlign: "center" },
  segTextActive: { color: "#fff" },

  stepper: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepBtn: {
    minWidth: 40,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#ece6d8",
    borderWidth: 1,
    borderColor: "rgba(60,50,40,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnDark: {
    backgroundColor: "#2a3446",
    borderColor: "rgba(255,255,255,0.12)",
  },
  stepText: { fontSize: 14, fontWeight: "800", color: "#2e2a24" },
  stepVal: { fontSize: 13, fontWeight: "700", color: "#2e2a24", minWidth: 34, textAlign: "center" },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  homeText: { fontSize: 14, fontWeight: "800", color: "#7b5a36" },
  homeTextDark: { color: "#c9a86e" },
  done: {
    backgroundColor: "#6f8a68",
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  doneText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  textLight: { color: "#eef1f6" },
});
