// One component per settings SECTION, plus the option tables they read from. Nothing here decides which sections a surface shows — that is the composing panel's job (SettingsControls for the in-build gear panel, app/(presentation)/settings.tsx for the tabbed screen).
//
// Where a section differs between the two panels it takes a named boolean rather than a variant string, so the call site reads as a list of what that panel shows.
import { Alert, Text, View, type LayoutChangeEvent } from "react-native";
import { Pressable } from "@/src/components/Pressable";
import { router } from "expo-router";
import { useGameStore } from "@/src/game/core/store";
import { setMusicEnabled, setMusicVolume } from "@/src/game/audio/music";
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
import { useRef, useState } from "react";
import { saveSelectedAvatarMode } from "@/src/services/onboarding";

// ── option tables ────────────────────────────────────────────────────────────
const PROFILES: { value: ProfileId; label: string }[] = [
  { value: "control", label: "Control" },
  { value: "visual", label: "Visual" },
  { value: "momentum", label: "Momentum" },
  { value: "clearPath", label: "Clear Path" },
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
  // "toon" retired from the offering (the RenderStyleId and its material survive in scene/shaders).
  // "Wooden" is what the ink pass produces on this catalogue; the id stays `illustrated`.
  { value: "illustrated", label: "Wooden" },
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
export function RestartRow({ onRestarted }: { onRestarted?: () => void } = {}) {
  const completedCount = useGameStore((s) => s.completed.length);
  const reset = useGameStore((s) => s.reset);
  const confirmReset = () => {
    if (completedCount === 0) return;
    Alert.alert("Start over?", "This clears all assembly progress.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        // CLOSE THE PANEL TOO. Resetting rebuilds the project map behind this card, so leaving it up
        // hides the one thing the player just asked to see and makes them dismiss a panel they are
        // finished with. Optional because the tabbed /settings screen has nothing to close.
        onPress: () => {
          reset();
          onRestarted?.();
        },
      },
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
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const selectProfile = async (next: ProfileId) => {
    if (savingRef.current || next === profile) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await saveSelectedAvatarMode(next);
      if (result.skipped) throw new Error("Sign in again to save your avatar choice.");
      applyProfile(next);
    } catch (error) {
      console.warn("[profile] could not save avatar mode", error);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  return (
    <>
      <SectionHeader>Profile</SectionHeader>
      <Choice
        label="Profile"
        desc="Preset that sets all the defaults below"
        value={profile}
        options={PROFILES}
        onChange={selectProfile}
        disabled={saving}
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
  const setSettings = useGameStore((s) => s.setSettings);
  const setRenderStyle = useGameStore((s) => s.setRenderStyle);
  const setBackdrop = useGameStore((s) => s.setBackdrop);
  const assembleDark = useGameStore((s) => s.assembleDark);
  const setAssembleDark = useGameStore((s) => s.setAssembleDark);
  const { targetLayout, targetActivated } = useFocusHandlers(focus);
  // A FRAGMENT, not a View: the walkthrough scrolls to a row by the `y` its onLayout reports, and that y is relative to the immediate parent. Wrapping a section in its own container would measure the target against the section instead of against the scrolled list, and the panel would scroll to the wrong row.
  return (
    <>
      <SectionHeader>Display</SectionHeader>
      {/* Scoped to the BUILD, and named for it: the room, catalogue and shop are unaffected. */}
      <Row
        label="Assemble in Dark Mode"
        desc="Dark background while you build. The rest of the app is unchanged."
        value={assembleDark}
        onValueChange={setAssembleDark}
      />
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
      {/* Free mode has no instructions to show — objectiveText returns null there — so the toggle would be a switch for an empty bar. Written !== "free" rather than === "guide" so strict, live in the engine but unreachable from this panel, groups with guide. */}
      {mode !== "free" ? (
        <Row
          label="Show instructions"
          desc="Off: only the progress bar stays at the top"
          value={settings.showInstructions}
          onValueChange={(v) => setSettings({ showInstructions: v })}
        />
      ) : null}
      {/* noteBlocked no-ops outside free mode AND in focus mode. Outside free the row is gone entirely, but focus mode DISABLES it instead of hiding it: focus mode is a thing the player just switched on and can switch straight back off, so the honest answer to "where did my error hints go" belongs here, on the row, rather than leaving them hunting for a switch that vanished. Its own desc carries the reason. */}
      {mode === "free" ? (
        <Row
          label="Error hints"
          desc={
            settings.focusMode
              ? "Off while Focus mode is on"
              : "Nudge after a part flies back"
          }
          value={settings.softHints}
          onValueChange={(v) => setSettings({ softHints: v })}
          disabled={settings.focusMode}
        />
      ) : null}
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

/** The music meter's rungs: ten, so a tap moves 10% and the bar reads as a level rather than as a
 *  handful of presets. */
const MUSIC_STEPS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

/**
 * One meter, used by BOTH music rows.
 *
 * The ambient track is set in the General tab and the build track in the assembly settings — two
 * places, two store fields, one control. Written once so they cannot drift into behaving
 * differently, which is the usual fate of a duplicated slider.
 *
 * Zero IS off: a player taking the music down to nothing has already said what they want, and making
 * them find a separate toggle to finish the thought is the app arguing with them.
 */
function MusicMeter({
  label,
  playingDesc,
  level,
  onChange,
}: {
  label: string;
  playingDesc: string;
  level: number;
  onChange: (next: number) => void;
}) {
  const styles = useFixedStyles(makeSettingsStyles);
  const step = (delta: number) =>
    onChange(Math.min(1, Math.max(0, +((level ?? 0) + delta).toFixed(2))));
  return (
    <View style={styles.switchRow}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowDesc}>{level > 0 ? playingDesc : "Off — raise it to play"}</Text>
      </View>
      <View style={styles.meterRow}>
        <Pressable style={styles.fontBtn} onPress={() => step(-0.1)} hitSlop={6}>
          <Text style={styles.arrowText}>–</Text>
        </Pressable>
        <View style={styles.meter}>
          {MUSIC_STEPS.map((s) => (
            <View key={s} style={[styles.meterBar, level >= s && styles.meterBarOn]} />
          ))}
        </View>
        <Pressable style={styles.fontBtn} onPress={() => step(0.1)} hitSlop={6}>
          <Text style={styles.arrowText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * AMBIENT music — the General tab.
 *
 * On its own, with no effects beside it: this is the track that plays in the room, the catalogue and
 * the profile, which is everywhere the assembly's effects and spoken steps do not exist.
 */
export function AudioSection() {
  const settings = useGameStore((s) => s.settings);
  const setSettings = useGameStore((s) => s.setSettings);
  return (
    <>
      <SectionHeader>Audio</SectionHeader>
      <MusicMeter
        label="Music"
        playingDesc="Background music in your room and the catalogue"
        level={settings.musicVolume ?? 0}
        onChange={(next) => {
          setSettings({ musicVolume: next, music: next > 0 });
          setMusicVolume("ambient", next);
          setMusicEnabled("ambient", next > 0);
        }}
      />
    </>
  );
}

/**
 * The BUILD's audio — the assembly settings.
 *
 * Everything that only exists while assembling: the spoken step clips, the effects, and the build's
 * own music. Its music is a SEPARATE setting from the ambient one above, because wanting the
 * workshop quiet while you concentrate says nothing about wanting your room quiet.
 */
export function BuildAudioSection() {
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
      <MusicMeter
        label="Music"
        playingDesc="Background music while you build"
        level={settings.buildMusicVolume ?? 0}
        onChange={(next) => {
          setSettings({ buildMusicVolume: next, buildMusic: next > 0 });
          setMusicVolume("assembly", next);
          setMusicEnabled("assembly", next > 0);
        }}
      />
    </>
  );
}

export function AppDisplaySection() {
  const styles = useFixedStyles(makeSettingsStyles);
  const settings = useGameStore((s) => s.settings);
  const setSettings = useGameStore((s) => s.setSettings);
  const handedness = useGameStore((s) => s.handedness);
  const setHandedness = useGameStore((s) => s.setHandedness);
  const changeFont = (delta: number) =>
    setSettings({
      fontScale: Math.min(1.5, Math.max(0.9, +(settings.fontScale + delta).toFixed(2))),
    });
  return (
    <>
      <SectionHeader>Display</SectionHeader>
      {/* The app-wide dark switch is gone: dark is a BUILD preference now ("Assemble in Dark Mode",
          in the build's own Display section). One switch, in the place it applies. */}
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
      {/* The "Reading font" row was removed 2026-08-19 with OpenDyslexic itself. Every reading
          surface uses Lexend now, and Text size above is what remains for legibility here. */}
      {/* Handedness is answered in onboarding's first question and never asked again — so until now
          a mis-tap there was permanent short of redoing onboarding. It sits in the GENERAL settings
          rather than the build's own, because it is a fact about the player rather than a
          preference about one build, and because a left-hander who realises mid-catalogue should
          not have to start an assembly to fix it.

          Not `setSettings`: handedness lives beside theme and renderStyle rather than inside the
          settings object, because applyProfile replaces that object wholesale and would reset it
          every time the player changed avatar. */}
      <Row
        label="Left-handed layout"
        desc="Mirrors the assembly controls, trays and buttons"
        value={handedness === "left"}
        onValueChange={(v) => setHandedness(v ? "left" : "right")}
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
