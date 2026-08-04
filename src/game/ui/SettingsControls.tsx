// The one general settings surface, shared by the homepage /settings screen and the in-game gear panel (both write to the same store). Dev/interaction experiments are grouped at the top; then display, guidance, audio.
//
// Visual language adopted from the on-release engine: a compact arrow Stepper (‹ Value ›) for multi-choice settings, Switch rows for booleans.
import { StyleSheet, Alert, Pressable, Switch, Text, View } from "react-native";
import { useGameStore } from "@/src/game/core/store";
import { useStyles, useTheme } from "@/src/game/ui/theme";
import type {
  DragPlane,
  GhostStyle,
  LightingPreset,
  ReleaseBehavior,
  SnapStyle,
} from "@/src/game/core/accessibility";
import type {
  AssemblyMode,
  BackdropId,
  RenderStyleId,
  TextLevel,
} from "@/src/game/core/type";
import type { ProfileId } from "@/src/game/core/profile";
// Built from the room's own backdrop table, so a photo added there appears here with no edit.
import type { Theme } from "@/src/game/ui/theme";

const PROFILES: { value: ProfileId; label: string }[] = [
  { value: "control", label: "Control" },
  { value: "visual", label: "Visual" },
  { value: "momentum", label: "Momentum" },
  { value: "clearPath", label: "Clear Path" },
];

// ── option tables ────────────────────────────────────────────────────────────
const SNAP: { value: SnapStyle; label: string }[] = [
  { value: "magnetic", label: "Magnetic" },
  { value: "onRelease", label: "On release" },
];
const GHOST: { value: GhostStyle; label: string }[] = [
  { value: "movingGhost", label: "Matched" },
  { value: "staticSockets", label: "All sockets" },
];
const RELEASE: { value: ReleaseBehavior; label: string }[] = [
  { value: "autoReturn", label: "Auto-return" },
  { value: "float", label: "Float" },
];
const DRAG_PLANE: { value: DragPlane; label: string }[] = [
  { value: "adaptive", label: "Adaptive" },
  { value: "level", label: "Level" },
];
const MODES: { value: AssemblyMode; label: string }[] = [
  { value: "free", label: "Free" },
  { value: "guide", label: "Guided" },
  { value: "strict", label: "Strict" },
];
const STYLES: { value: RenderStyleId; label: string }[] = [
  // The first three swap the GLB; the last two swap the MATERIAL (scene/shaders.ts).
  { value: "realistic", label: "Realistic" },
  { value: "cozy", label: "Cozy" },
  { value: "cartoon", label: "Cartoon" },
  { value: "toon", label: "Toon" },
  { value: "illustrated", label: "Illustrated" },
];
const BACKDROPS: { value: BackdropId; label: string }[] = [
  { value: "studio", label: "Studio" },
  { value: "clear", label: "Clear" },
  { value: "cozy", label: "Cozy" },
  { value: "cartoon", label: "Cartoon" },
];
const LIGHTING: { value: LightingPreset; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "studio", label: "Studio" },
  { value: "warm", label: "Warm" },
  { value: "soft", label: "Soft" },
  { value: "golden", label: "Golden" },
];
const LEVELS: { value: TextLevel; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "simple", label: "Simple" },
];

// ── primitives (her arrow Stepper + a Switch row) ────────────────────────────
function Stepper<T extends string>({
  label,
  desc,
  value,
  options,
  onChange,
}: {
  label: string;
  desc?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const styles = useStyles(makeStyles);
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const go = (dir: number) =>
    onChange(options[(idx + dir + options.length) % options.length].value);
  return (
    <View style={styles.stepperRow}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {desc ? <Text style={styles.rowDesc}>{desc}</Text> : null}
      </View>
      <View style={styles.stepper}>
        <Pressable onPress={() => go(-1)} style={styles.arrow} hitSlop={8}>
          <Text style={styles.arrowText}>‹</Text>
        </Pressable>
        <Text style={styles.stepperValue} numberOfLines={1}>
          {options[idx].label}
        </Text>
        <Pressable onPress={() => go(1)} style={styles.arrow} hitSlop={8}>
          <Text style={styles.arrowText}>›</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Two/N pills in a row (the "old" segmented style) — clearer than arrows for a small option set. */
function Segmented<T extends string>({
  label,
  desc,
  value,
  options,
  onChange,
}: {
  label: string;
  desc?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.segBlock}>
      <Text style={styles.rowLabel}>{label}</Text>
      {desc ? <Text style={styles.rowDesc}>{desc}</Text> : null}
      <View style={styles.segRow}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(o.value)}
              hitSlop={4}
              style={[styles.segBtn, active && styles.segBtnActive]}
            >
              <Text
                style={[styles.segText, active && styles.segTextActive]}
                numberOfLines={1}
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

/** Auto-pick the control: pills for a small set (<3), arrow stepper for more. */
function Choice<T extends string>(props: {
  label: string;
  desc?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return props.options.length < 3 ? <Segmented {...props} /> : <Stepper {...props} />;
}

function Row({
  label,
  desc,
  value,
  onValueChange,
}: {
  label: string;
  desc?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  const styles = useStyles(makeStyles);
  const t = useTheme();
  return (
    <View style={styles.switchRow}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {desc ? <Text style={styles.rowDesc}>{desc}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: t.surfaceInset, true: t.accent }}
        thumbColor={value ? t.onAccent : t.surface}
        ios_backgroundColor={t.surfaceInset}
      />
    </View>
  );
}

function SectionHeader({ children }: { children: string }) {
  const styles = useStyles(makeStyles);
  return <Text style={styles.section}>{children}</Text>;
}

export function SceneAppearanceControls({
  onPreferenceChange,
}: {
  onPreferenceChange?: (preference: "background" | "lighting") => void;
} = {}) {
  const styles = useStyles(makeStyles);
  const settings = useGameStore((s) => s.settings);
  const backdrop = useGameStore((s) => s.backdrop);
  const setSettings = useGameStore((s) => s.setSettings);
  const setBackdrop = useGameStore((s) => s.setBackdrop);

  return (
    <View style={styles.list}>
      <SectionHeader>Scene appearance</SectionHeader>
      <Choice
        label="Background"
        desc="Preview the scene behind your furniture"
        value={backdrop}
        options={BACKDROPS}
        onChange={(value) => {
          setBackdrop(value);
          onPreferenceChange?.("background");
        }}
      />
      <Choice
        label="Lighting"
        desc="Preview how the furniture is lit"
        value={settings.lightingPreset}
        options={LIGHTING}
        onChange={(value) => {
          setSettings({ lightingPreset: value });
          onPreferenceChange?.("lighting");
        }}
      />
    </View>
  );
}

// ── the shared controls ──────────────────────────────────────────────────────
export function SettingsControls() {
  const styles = useStyles(makeStyles);
  const settings = useGameStore((s) => s.settings);
  const profile = useGameStore((s) => s.profile);
  const applyProfile = useGameStore((s) => s.applyProfile);
  const mode = useGameStore((s) => s.mode);
  const renderStyle = useGameStore((s) => s.renderStyle);
  const backdrop = useGameStore((s) => s.backdrop);
  const theme = useGameStore((s) => s.theme);
  const setSettings = useGameStore((s) => s.setSettings);
  const setMode = useGameStore((s) => s.setMode);
  const setRenderStyle = useGameStore((s) => s.setRenderStyle);
  const setBackdrop = useGameStore((s) => s.setBackdrop);
  const setTheme = useGameStore((s) => s.setTheme);

  const changeFont = (delta: number) =>
    setSettings({
      fontScale: Math.min(1.5, Math.max(0.9, +(settings.fontScale + delta).toFixed(2))),
    });

  const completedCount = useGameStore((s) => s.completed.length);
  const reset = useGameStore((s) => s.reset);
  const confirmReset = () => {
    if (completedCount === 0) return;
    Alert.alert("Start over?", "This clears all assembly progress.", [
      { text: "Cancel", style: "cancel" },
      { text: "Reset", style: "destructive", onPress: reset },
    ]);
  };

  return (
    <View style={styles.list}>
      {/* Reset — top of the panel: infrequent (vs the on-HUD undo/redo), so it lives here instead of taking a HUD slot. */}
      <Pressable
        style={[styles.resetRow, completedCount === 0 && styles.resetRowIdle]}
        onPress={confirmReset}
        disabled={completedCount === 0}
        hitSlop={6}
      >
        <Text style={styles.resetText}>↺  Restart assembly</Text>
        <Text style={styles.resetDesc}>Clears all progress (asks first)</Text>
      </Pressable>

      {/* Profile picker — top. Applying one resets settings to its defaults (same as onboarding would); individual settings stay editable below. */}
      <SectionHeader>Profile</SectionHeader>
      <Choice
        label="Profile"
        desc="Preset that sets all the defaults below"
        value={profile}
        options={PROFILES}
        onChange={applyProfile}
      />

      {/* Dev / interaction experiments. */}
      <SectionHeader>Interaction (dev)</SectionHeader>
      <Choice
        label="Snap"
        desc="Magnetic pulls the part in; On release keeps it under the finger"
        value={settings.snapStyle}
        options={SNAP}
        onChange={(v) => setSettings({ snapStyle: v })}
      />
      <Choice
        label="Socket ghosts"
        desc="Ghost only the matched socket, or every open one"
        value={settings.ghostStyle}
        options={GHOST}
        onChange={(v) => setSettings({ ghostStyle: v })}
      />
      <Choice
        label="Released part"
        desc="Auto-return to tray, or float where you set it down (float includes canvas re-grab)"
        value={settings.releaseBehavior}
        options={RELEASE}
        onChange={(v) => setSettings({ releaseBehavior: v })}
      />
      <Choice
        label="Drag mechanism"
        desc="Adaptive matches sockets on screen and follows their height; Level fixes the plane at one height (comparison mode — struggles on multi-height sockets)"
        value={settings.dragPlane}
        options={DRAG_PLANE}
        onChange={(v) => setSettings({ dragPlane: v })}
      />
      <SectionHeader>Display</SectionHeader>
      <Choice
        label="Model look"
        desc="How the furniture is rendered"
        value={renderStyle}
        options={STYLES}
        onChange={setRenderStyle}
      />
      <Choice
        label="Build background"
        desc="Assembly scene backdrop, separate from the model"
        value={backdrop}
        options={BACKDROPS}
        onChange={setBackdrop}
      />
      <Choice
        label="Lighting"
        desc="Auto = each model look's natural rig"
        value={settings.lightingPreset}
        options={LIGHTING}
        onChange={(v) => setSettings({ lightingPreset: v })}
      />
      <Row
        label="Dark mode"
        desc="Use the dark background theme"
        value={theme === "dark"}
        onValueChange={(v) => setTheme(v ? "dark" : "light")}
      />
      <Choice
        label="Instructions"
        desc="Wording detail for each step"
        value={settings.textLevel}
        options={LEVELS}
        onChange={(v) => setSettings({ textLevel: v })}
      />
      <View style={styles.switchRow}>
        <View style={styles.rowText}>
          <Text style={styles.rowLabel}>Text size</Text>
          <Text style={styles.rowDesc}>Objective and hint text size</Text>
        </View>
        <View style={styles.fontStepper}>
          <Pressable style={styles.fontBtn} onPress={() => changeFont(-0.1)} hitSlop={6}>
            <Text style={styles.arrowText}>A-</Text>
          </Pressable>
          <Text style={styles.stepperValue}>{settings.fontScale.toFixed(1)}x</Text>
          <Pressable style={styles.fontBtn} onPress={() => changeFont(0.1)} hitSlop={6}>
            <Text style={styles.arrowText}>A+</Text>
          </Pressable>
        </View>
      </View>

      <SectionHeader>Guidance</SectionHeader>
      <Choice
        label="Mode"
        desc="How much the game guides you"
        value={mode}
        options={MODES}
        onChange={setMode}
      />
      <Row
        label="Focus mode"
        desc="Show only the current part + action"
        value={settings.focusMode}
        onValueChange={(v) => setSettings({ focusMode: v })}
      />
      <Row
        label="Auto-view"
        desc="Auto-frame the next open socket"
        value={settings.autoView}
        onValueChange={(v) => setSettings({ autoView: v })}
      />
      <Row
        label="Show instructions"
        desc="Off: only the progress bar stays at the top"
        value={settings.showInstructions}
        onValueChange={(v) => setSettings({ showInstructions: v })}
      />
      <Row
        label="Error hints"
        desc="Nudge after a part flies back"
        value={settings.softHints}
        onValueChange={(v) => setSettings({ softHints: v })}
      />
      <Row
        label="Choose tools"
        desc="Pick the tool yourself before tightening"
        value={settings.manualTools}
        onValueChange={(v) => setSettings({ manualTools: v })}
      />

      <SectionHeader>Audio</SectionHeader>
      <Row
        label="Audio steps"
        desc="Play each step's spoken clip"
        value={settings.audio}
        onValueChange={(v) => setSettings({ audio: v })}
      />
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  list: { gap: 2 },
  section: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: t.gold,
    marginTop: 16,
    marginBottom: 4,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: t.border,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: t.border,
  },
  rowText: { flex: 1, paddingRight: 12 },
  rowLabel: { fontSize: 15, fontWeight: "700", color: t.text },
  rowDesc: { fontSize: 12, color: t.textDim, marginTop: 2 },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: t.surfaceRaised,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.border,
  },
  segBlock: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: t.border,
  },
  segRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  segBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: t.surfaceRaised,
    borderWidth: 1,
    borderColor: t.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  // Active segment = ACCENT, not success green. Green means a step is DONE; a chosen
  // setting is a live selection, which is what the accent means.
  segBtnActive: { backgroundColor: t.accent, borderColor: t.accent },
  segText: { fontSize: 12.5, fontWeight: "700", color: t.textDim, textAlign: "center" },
  segTextActive: { color: t.onAccent },
  arrow: { paddingHorizontal: 12, paddingVertical: 6 },
  arrowText: { fontSize: 20, fontWeight: "700", color: t.accent, lineHeight: 22 },
  stepperValue: {
    minWidth: 92,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "700",
    color: t.text,
  },
  fontStepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: t.surfaceRaised,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.border,
  },
  fontBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  resetRow: {
    backgroundColor: t.surfaceRaised,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 4,
  },
  resetRowIdle: { opacity: 0.45 },
  resetText: { fontSize: 15, fontWeight: "700", color: t.danger },
  resetDesc: { fontSize: 12, color: t.textDim, marginTop: 2 },
  });
