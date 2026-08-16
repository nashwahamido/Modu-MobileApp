// One component per settings SECTION, plus the option tables they read from. Nothing here decides which sections a surface shows — that is the composing panel's job (SettingsControls for the in-build gear panel, app/(presentation)/settings.tsx for the tabbed screen).
//
// Where a section differs between the two panels it takes a named boolean rather than a variant string, so the call site reads as a list of what that panel shows.
import { Alert, Pressable, Text, View, type LayoutChangeEvent } from "react-native";
import { router } from "expo-router";
import { useGameStore } from "@/src/game/core/store";
import { useFixedStyles } from "@/src/game/ui/system/theme";
import { signOut } from "@/src/services/auth";
import { SIGN_IN_ROUTE } from "@/src/hooks/useSessionGate";
import {
  ActionRow,
  Choice,
  Row,
  SectionHeader,
  makeSettingsStyles,
} from "@/src/game/ui/settings/SettingsPrimitives";
import type {
  DragPlane,
  GhostStyle,
  LightingPreset,
  ReleaseBehavior,
} from "@/src/game/core/accessibility";
import type {
  AssemblyMode,
  BackdropId,
  RenderStyleId,
  TextLevel,
} from "@/src/game/core/type";
import type { ProfileId } from "@/src/game/core/profile";

// ── option tables ────────────────────────────────────────────────────────────
const PROFILES: { value: ProfileId; label: string }[] = [
  { value: "control", label: "Control" },
  { value: "visual", label: "Visual" },
  { value: "momentum", label: "Momentum" },
  { value: "clearPath", label: "Clear Path" },
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
// "strict" is a live AssemblyMode the engine still honours, but no profile pins it (see PROFILE_MODE) and nothing ships in it, so it is not offered here. Add the row back the day a profile wants it.
const MODES: { value: AssemblyMode; label: string }[] = [
  { value: "free", label: "Free" },
  { value: "guide", label: "Guided" },
];
const STYLES: { value: RenderStyleId; label: string }[] = [
  // The first three swap the GLB; the last two swap the MATERIAL (scene/shaders.ts).
  { value: "realistic", label: "Realistic" },
  { value: "cozy", label: "Cozy" },
  { value: "cartoon", label: "Cartoon" },
  // "toon" retired from the offering (the RenderStyleId and its material survive in scene/shaders,
  // so a profile saved on it still renders — it just can't be chosen anew).
  { value: "illustrated", label: "Illustrated" },
];
// Built from the room's own backdrop table, so a photo added there appears here with no edit.
const BACKDROPS: { value: BackdropId; label: string }[] = [
  // Grid first: it is the default and the neutral one, so it heads the list rather than sitting among the scenery.
  { value: "grid", label: "Grid" },
  { value: "clear", label: "Clear" },
  { value: "calm", label: "Calm" },
  { value: "craft", label: "Craft" },
  { value: "garden", label: "Garden" },
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

// ── tutorial focus plumbing ──────────────────────────────────────────────────
/** A row the settings walkthrough can scroll to and wait on. Every id here must name a row the IN-BUILD panel renders — the walkthrough opens that panel, not the /settings screen. */
export type SettingsFocusTarget = "backdrop" | "instructions";

export interface FocusProps {
  focusTarget?: SettingsFocusTarget | null;
  onFocusTargetLayout?: (y: number) => void;
  onFocusTargetActivated?: () => void;
}

function useFocusHandlers({
  focusTarget = null,
  onFocusTargetLayout,
  onFocusTargetActivated,
}: FocusProps) {
  const targetLayout =
    (target: SettingsFocusTarget) => (event: LayoutChangeEvent) => {
      if (focusTarget === target) {
        onFocusTargetLayout?.(event.nativeEvent.layout.y);
      }
    };
  const targetActivated = (target: SettingsFocusTarget) => {
    if (focusTarget === target) onFocusTargetActivated?.();
  };
  return { targetLayout, targetActivated };
}

// ── sections ─────────────────────────────────────────────────────────────────

/** Restart — top of every assembly surface: infrequent (vs the on-HUD undo/redo), so it lives here instead of taking a HUD slot. */
export function RestartRow() {
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
    <ActionRow
      label="↺  Restart assembly"
      desc="Clears all progress (asks first)"
      onPress={confirmReset}
      disabled={completedCount === 0}
    />
  );
}

/** Applying a profile resets settings to its defaults (same as onboarding would); individual settings stay editable below it. Main settings only — it is a before-you-start choice, and offering it mid-build means one tap wipes every preference the player just tuned. */
export function ProfileSection() {
  const profile = useGameStore((s) => s.profile);
  const applyProfile = useGameStore((s) => s.applyProfile);
  return (
    <>
      <SectionHeader>Profile</SectionHeader>
      <Choice
        label="Profile"
        desc="Preset that sets all the defaults below"
        value={profile}
        options={PROFILES}
        onChange={applyProfile}
      />
    </>
  );
}

/** The interaction experiments still being settled (see the TODO at the top of core/accessibility.ts). Main settings only. */
export function InteractionDevSection() {
  const settings = useGameStore((s) => s.settings);
  const setSettings = useGameStore((s) => s.setSettings);
  return (
    <>
      <SectionHeader>Interaction (dev)</SectionHeader>
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
    </>
  );
}

/** How the BUILD looks. `showLighting` is off in the gear panel: the rig is a pre-build mood, not something to reach for with a part in hand. */
export function BuildDisplaySection({
  showLighting = true,
  ...focus
}: FocusProps & { showLighting?: boolean }) {
  const settings = useGameStore((s) => s.settings);
  const renderStyle = useGameStore((s) => s.renderStyle);
  const backdrop = useGameStore((s) => s.backdrop);
  const theme = useGameStore((s) => s.theme);
  const setSettings = useGameStore((s) => s.setSettings);
  const setRenderStyle = useGameStore((s) => s.setRenderStyle);
  const setBackdrop = useGameStore((s) => s.setBackdrop);
  const setTheme = useGameStore((s) => s.setTheme);
  const { targetLayout, targetActivated } = useFocusHandlers(focus);
  // A FRAGMENT, not a View: the walkthrough scrolls to a row by the `y` its onLayout reports, and that y is relative to the immediate parent. Wrapping a section in its own container would measure the target against the section instead of against the scrolled list, and the panel would scroll to the wrong row.
  return (
    <>
      <SectionHeader>Display</SectionHeader>
      <Choice
        label="Model look"
        desc="How the furniture is rendered"
        value={renderStyle}
        options={STYLES}
        onChange={setRenderStyle}
      />
      <View onLayout={targetLayout("backdrop")}>
        <Choice
          label="Background"
          desc="Assembly scene backdrop, separate from the model"
          value={backdrop}
          options={BACKDROPS}
          onChange={(v) => {
            setBackdrop(v);
            targetActivated("backdrop");
          }}
        />
      </View>
      {/* Dark mode is reachable from INSIDE a build again, next to the Background it flips: every
          backdrop has a dark variant and the scene ground follows the theme, so leaving the
          assembly for the app settings screen just to switch was a detour for a display choice.
          Same store field as the general tab's toggle — the two rows can never disagree. */}
      <Row
        label="Dark mode"
        desc="Use the dark background theme"
        value={theme === "dark"}
        onValueChange={(v) => setTheme(v ? "dark" : "light")}
      />
      {showLighting ? (
        <Choice
          label="Lighting"
          desc="Auto = each model look's natural rig"
          value={settings.lightingPreset}
          options={LIGHTING}
          onChange={(v) => setSettings({ lightingPreset: v })}
        />
      ) : null}
      <View onLayout={targetLayout("instructions")}>
        <Choice
          label="Instructions"
          desc="Wording detail for each step"
          value={settings.textLevel}
          options={LEVELS}
          onChange={(v) => {
            setSettings({ textLevel: v });
            targetActivated("instructions");
          }}
        />
      </View>
    </>
  );
}

/** How much the game guides you. Both flags are off in the gear panel: swapping the tool policy mid-build changes the next step under the player's finger, and Focus already has a HUD chip (ToggleChips) that is faster to reach than opening this panel. */
export function GuidanceSection({
  showManualTools = true,
  showFocusMode = true,
  ...focus
}: FocusProps & { showManualTools?: boolean; showFocusMode?: boolean }) {
  const settings = useGameStore((s) => s.settings);
  const mode = useGameStore((s) => s.mode);
  const setSettings = useGameStore((s) => s.setSettings);
  const setMode = useGameStore((s) => s.setMode);
  const { targetLayout, targetActivated } = useFocusHandlers(focus);
  // Fragment for the same reason as BuildDisplaySection — see the note there.
  return (
    <>
      <SectionHeader>Guidance</SectionHeader>
      <Choice
        label="Mode"
        desc="How much the game guides you"
        value={mode}
        options={MODES}
        onChange={setMode}
      />
      {showFocusMode ? (
        <Row
          label="Focus mode"
          desc="Show only the current part + action"
          value={settings.focusMode}
          onValueChange={(v) => setSettings({ focusMode: v })}
        />
      ) : null}
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
      {showManualTools ? (
        <Row
          label="Choose tools"
          desc="Pick the tool yourself before tightening"
          value={settings.manualTools}
          onValueChange={(v) => setSettings({ manualTools: v })}
        />
      ) : null}
    </>
  );
}

export function AudioSection() {
  const settings = useGameStore((s) => s.settings);
  const setSettings = useGameStore((s) => s.setSettings);
  return (
    <>
      <SectionHeader>Audio</SectionHeader>
      <Row
        label="Audio steps"
        desc="Play each step's spoken clip"
        value={settings.audio}
        onValueChange={(v) => setSettings({ audio: v })}
      />
      <Row
        label="Sound effects"
        desc="Taps, screws and completion sounds"
        value={settings.soundEffects}
        onValueChange={(v) => setSettings({ soundEffects: v })}
      />
    </>
  );
}

/** App chrome, not build chrome: these follow the player across the room, the catalogue and an assembly alike, which is why they sit in the general tab and not with the build settings. */
export function AppDisplaySection() {
  const styles = useFixedStyles(makeSettingsStyles);
  const settings = useGameStore((s) => s.settings);
  const theme = useGameStore((s) => s.theme);
  const setSettings = useGameStore((s) => s.setSettings);
  const setTheme = useGameStore((s) => s.setTheme);
  const changeFont = (delta: number) =>
    setSettings({
      fontScale: Math.min(1.5, Math.max(0.9, +(settings.fontScale + delta).toFixed(2))),
    });
  return (
    <>
      <SectionHeader>Display</SectionHeader>
      <Row
        label="Dark mode"
        desc="Use the dark background theme"
        value={theme === "dark"}
        onValueChange={(v) => setTheme(v ? "dark" : "light")}
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
      <Row
        label="Reading font"
        desc="OpenDyslexic for instructions, hints and the tutorial"
        value={settings.readingFont}
        onValueChange={(v) => setSettings({ readingFont: v })}
      />
    </>
  );
}

/** Account-level actions. Both go through a confirm dialog — this is the first player-facing sign-out in the app, and the reason it was kept to the dev panel until now is that a bare row is one stray tap from ending the session. */
export function AccountSection() {
  const confirmLogOut = () =>
    Alert.alert("Log out?", "You'll need to sign in again to reach your room.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: () => {
          signOut()
            .catch((err) => console.warn("[settings] sign out failed", err))
            // Navigate either way: a failed supabase.auth.signOut() still means the player asked to leave, and useSessionGate bounces anything without a session anyway.
            .finally(() => router.replace(SIGN_IN_ROUTE));
        },
      },
    ]);

  // Deliberately inert: there is no deletion path in src/data or the backend yet, and a row that half-deletes an account is worse than one that says so.
  const confirmDelete = () =>
    Alert.alert(
      "Delete account",
      "Account deletion isn't available yet. Reach out to us and we'll remove your data for you.",
      [{ text: "OK" }],
    );

  return (
    <>
      <SectionHeader>Account</SectionHeader>
      <ActionRow
        label="Log out"
        desc="Sign out of this account"
        onPress={confirmLogOut}
        tone="text"
      />
      <ActionRow
        label="Delete account"
        desc="Permanently remove your account and data"
        onPress={confirmDelete}
      />
    </>
  );
}