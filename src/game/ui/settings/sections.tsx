// One component per settings SECTION, plus the option tables they read from. Nothing here decides which sections a surface shows — that is the composing panel's job (SettingsControls for the in-build gear panel, app/(presentation)/settings.tsx for the tabbed screen).
//
// Where a section differs between the two panels it takes a named boolean rather than a variant string, so the call site reads as a list of what that panel shows.
import { Alert, Text, View, type LayoutChangeEvent } from "react-native";
import { Pressable } from "@/src/components/Pressable";
import { router, type Href } from "expo-router";
import { useGameStore } from "@/src/game/core/store";
import { usePrefsStore } from "@/src/game/core/prefsStore";
import { useTutorialStore } from "@/src/game/tutorial/store";
import { setMusicEnabled, setMusicVolume } from "@/src/game/audio/music";
// NOT services/auth's bare signOut: this one also clears the zustand stores, so the next account cannot inherit this player's build progress and half-placed furniture, and it resets a demo account before its session ends. src/dev is not __DEV__-gated — the showcase runs from release builds — and useSessionGate already reaches into it for the same reason.
import { signOutAccount } from "@/src/dev/accounts";
import {
  ActionRow,
  Choice,
  Row,
  SectionHeader,
  useSettingsStyles,
} from "@/src/game/ui/settings/SettingsPrimitives";
import type { ReleaseBehavior } from "@/src/game/core/accessibility";
import type {
  AssemblyMode,
  BackdropId,
  RenderStyleId,
  TextLevel,
} from "@/src/game/core/type";
import type { ProfileId } from "@/src/game/core/profile";
import { useRef, useState } from "react";
import { saveSelectedAvatarMode } from "@/src/services/onboarding";
import { ROOM_BACKGROUND_IDS, type RoomBackgroundId } from "@/src/room/ui/roomBackdrops";

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
// DRAG_PLANE_RETIRED. The "Drag mechanism" row is gone and every build is "adaptive" — the drag plane
// matches sockets on screen and follows their height, full stop. settings.dragPlane still EXISTS and
// usePartDrag still branches on it, but only into the "level" comparison engine, which nothing can now
// select: the profiles all default to "adaptive" and RETIRED_SETTINGS (src/game/core/store.ts) drops any
// value a player saved back when the row was offered. Those branches are dead rather than wrong, and
// they are left in place as the comparison path they were written to be.
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
// LIGHTING_RETIRED. The "Lighting" row is gone from every surface — the gear panel had already
// dropped it (a rig is a pre-build mood, not something to reach for with a part in hand), and it
// left the /settings Assembly tab on 2026-08-25, which was its last home. settings.lightingPreset is
// STILL LIVE: AssemblyScene reads it through getLightRig, so every build now runs the "auto" rig each
// model look was authored with. It is listed in RETIRED_SETTINGS (src/game/core/store.ts) so a player
// who once chose "warm" is not stuck with it forever with no control left to change it back.
// Restoring the row means putting a Choice over that same field back into BuildDisplaySection.
const LEVELS: { value: TextLevel; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "simple", label: "Simple" },
];
// bg7 first: it is the default. Labelled by position, not by scene, because the photos are plain
// numbered scenery with no theme of their own to name.
const ROOM_BACKGROUNDS: { value: RoomBackgroundId; label: string }[] = ROOM_BACKGROUND_IDS.map(
  (id, i) => ({ value: id, label: i === 0 ? "Default" : `View ${i + 1}` }),
);

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
      desc="Clears all progress"
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

/** How a part behaves in the hand — what happens when you let go, and whether you pick the tool yourself. Main settings only, and that is the whole reason "Choose tools" lives here rather than under Guidance: swapping the tool policy mid-build changes the next step under the player's finger, so it is a before-you-start choice like the release behaviour beside it, not a dial to reach for with a part in hand. */
export function InteractionSection() {
  const settings = useGameStore((s) => s.settings);
  const setSettings = useGameStore((s) => s.setSettings);
  return (
    <>
      <SectionHeader>Interaction</SectionHeader>
      <Choice
        label="Released part"
        desc="Auto-return to tray, or float where you set it down (float includes canvas re-grab)"
        value={settings.releaseBehavior}
        options={RELEASE}
        onChange={(v) => setSettings({ releaseBehavior: v })}
      />
      <Row
        label="Choose tools"
        desc="Pick the tool yourself before tightening"
        value={settings.manualTools}
        onValueChange={(v) => setSettings({ manualTools: v })}
      />
    </>
  );
}

/** How the BUILD looks. `showFocusMode` is off in the gear panel: Focus mode already has a HUD chip (ToggleChips) that is faster to reach than opening a panel, so a second home behind it is noise rather than a missing control. That flag moved here with the row itself when Focus left Guidance — it belongs to whichever section renders the row, or the gear panel silently regains a control it deliberately dropped. There is no `showLighting` twin any more: the Lighting row is gone from every surface, see LIGHTING_RETIRED above. */
export function BuildDisplaySection({
  showFocusMode = true,
  ...focus
}: FocusProps & { showFocusMode?: boolean }) {
  const settings = useGameStore((s) => s.settings);
  const renderStyle = usePrefsStore((s) => s.renderStyle);
  const backdrop = usePrefsStore((s) => s.backdrop);
  const setSettings = useGameStore((s) => s.setSettings);
  const setRenderStyle = usePrefsStore((s) => s.setRenderStyle);
  const setBackdrop = usePrefsStore((s) => s.setBackdrop);
  const assembleDark = usePrefsStore((s) => s.assembleDark);
  const setAssembleDark = usePrefsStore((s) => s.setAssembleDark);
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
      {/* Display rather than Guidance, because what it changes is what you can SEE: everything but the current part and action is taken off the scene. Guidance is about how much the game TELLS you; this is about how much of the model is drawn. Error hints under Guidance still reads this same flag to explain itself — moving the switch does not move that dependency, and the two sections are free to sit apart. */}
      {showFocusMode ? (
        <Row
          label="Focus mode"
          desc="Show only the current part + action"
          value={settings.focusMode}
          onValueChange={(v) => setSettings({ focusMode: v })}
        />
      ) : null}
    </>
  );
}

/** How much the game TELLS you: the mode, and the two kinds of prompt it produces. Carries no gear-panel flags of its own any more — every row here is safe to change with a part in hand, and the two that were not (Focus mode, Choose tools) left for Display and Interaction along with the props that hid them. */
export function GuidanceSection({ ...focus }: FocusProps) {
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
  const styles = useSettingsStyles();
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

/** The tutorial route. Cast for the same reason every other caller casts it (GmTestPanel, avatar-recommendation): it lives in the (game) group, which typed routes do not surface as a literal. */
const TUTORIAL_ROUTE = "/tutorial" as Href;

/**
 * Replay the guided first build.
 *
 * Onboarding is otherwise the ONLY way in (avatar-recommendation, on the way out of the avatar
 * choice) and it runs once per account — so a player who skipped it, or who changed profile
 * afterwards and wants to meet their new companion's version of it, had no way back short of a dev
 * build. That is what this row is for.
 *
 * LAST in the assembly tab, under the settings rather than among them: everything above it changes a
 * value and leaves you on the page, and this one leaves the screen entirely for a full 3D scene.
 */
export function RedoTutorialSection() {
  const confirmRedo = () =>
    Alert.alert(
      "Redo the tutorial?",
      "You'll build the practice table again, step by step. Any assembly in progress is cleared.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Start",
          onPress: () => {
            // reset() clears the build the tutorial is about to replace; resetTutorial() drops any run
            // already in progress so the screen configures from scratch. NOT applyProfile, which
            // onboarding calls here too: it rewrites the settings object wholesale, and a player
            // reaching this row has just walked past every one of those settings on this very page.
            useGameStore.getState().reset();
            useTutorialStore.getState().resetTutorial();
            // This screen is a MODAL over the room ((presentation) group), so the modal layer has to
            // go first — otherwise replace() swaps the modal and the tutorial's 3D scene mounts on
            // top of the room's, with both engines live. Same two calls as the dev switcher's leaveTo.
            if (router.canDismiss()) router.dismissAll();
            router.replace(TUTORIAL_ROUTE);
          },
        },
      ],
    );

  return (
    <>
      <SectionHeader>Tutorial</SectionHeader>
      <ActionRow
        label="↺  Redo tutorial"
        desc="Replay the guided first build"
        onPress={confirmRedo}
        tone="text"
      />
    </>
  );
}

export function AppDisplaySection() {
  const handedness = usePrefsStore((s) => s.handedness);
  const setHandedness = usePrefsStore((s) => s.setHandedness);
  const roomBackground = usePrefsStore((s) => s.roomBackground);
  const setRoomBackground = usePrefsStore((s) => s.setRoomBackground);
  const roomAvatarVisible = usePrefsStore((s) => s.roomAvatarVisible);
  const setRoomAvatarVisible = usePrefsStore((s) => s.setRoomAvatarVisible);
  return (
    <>
      <SectionHeader>Display</SectionHeader>
      {/* The app-wide dark switch is gone: dark is a BUILD preference now ("Assemble in Dark Mode",
          in the build's own Display section). One switch, in the place it applies. */}
      {/* The "Reading font" row went on 2026-08-19 with OpenDyslexic itself, and "Text size" followed
          it out. settings.fontScale is STILL LIVE and still read by the objective bar, the hint toast
          and the loading screen — it simply has no player-facing control any more, so it sits at
          whatever the active profile sets (1.0 on control, 1.1 on the larger-type profile). Restoring
          the row means a stepper over that same field; nothing downstream has to change. The dev
          EngineTestScreen keeps its own stepper and is unaffected. */}
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
      <Choice
        label="Room Background"
        desc="The view outside your room's window. Switches with the day/sunset/night light on the room screen."
        value={roomBackground}
        options={ROOM_BACKGROUNDS}
        onChange={setRoomBackground}
      />
      {/* Beside Room Background because the two are the same kind of choice — what the room LOOKS like
          — and unlike Left-handed layout above, which is a fact about the player. Which companion
          appears is not asked here: that follows the onboarding profile (roomAvatarKindForProfile),
          and this only says whether one is there at all. */}
      <Row
        label="Show avatar"
        desc="Your companion wanders the room. Turning it off also frees the memory and per-frame work it costs."
        value={roomAvatarVisible}
        onValueChange={setRoomAvatarVisible}
      />
    </>
  );
}

/** The landing screen — the app's index route, which has no group. Public to useSessionGate, so a signed-out player stays put here instead of being bounced on to /auth. */
const LANDING_ROUTE = "/" as Href;

/** Account-level actions. Both go through a confirm dialog — this is the first player-facing sign-out in the app, and the reason it was kept to the dev panel until now is that a bare row is one stray tap from ending the session. */
export function AccountSection() {
  const confirmLogOut = () =>
    Alert.alert("Log out?", "You'll need to sign in again to reach your room.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: () => {
          signOutAccount()
            .catch((err) => console.warn("[settings] sign out failed", err))
            // Navigate either way: a failed supabase.auth.signOut() still means the player asked to leave, and useSessionGate bounces anything without a session anyway.
            .finally(() => {
              // THE MODAL LAYER GOES FIRST, for the same reason RedoTutorialSection dismisses before it replaces: this screen is a modal in (presentation) sitting ON TOP of the room, so a bare replace() swaps the modal and leaves the room mounted underneath — with its Filament engine, its shell GLB and every texture still resident, under a login screen that will never show them. Signing out is the one moment the room is certainly finished with, so it should cost nothing to keep. Dismissing first takes the room off the stack, which unmounts its scene and lets the engine actually die.
              if (router.canDismiss()) router.dismissAll();
              // The LANDING, not the picker: signing out returns the player to the app's front door, the same screen a fresh install opens on. "Choose Account" is one tap away from there, and index.tsx only skips it while a session exists — which is exactly what we just ended.
              router.replace(LANDING_ROUTE);
            });
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
