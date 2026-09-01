import { Alert, Text, View, type LayoutChangeEvent } from "react-native";
import { Pressable } from "@/src/components/Pressable";
import { router, type Href } from "expo-router";
import { useGameStore } from "@/src/game/core/store";
import { usePrefsStore } from "@/src/game/core/prefsStore";
import { useTutorialStore } from "@/src/game/tutorial/store";
import { setMusicEnabled, setMusicVolume } from "@/src/game/audio/music";
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
const MODES: { value: AssemblyMode; label: string }[] = [
  { value: "free", label: "Free" },
  { value: "guide", label: "Guided" },
];
const STYLES: { value: RenderStyleId; label: string }[] = [
  { value: "realistic", label: "Realistic" },
  { value: "cozy", label: "Cozy" },
  { value: "cartoon", label: "Cartoon" },
  { value: "illustrated", label: "Wooden" },
];
const BACKDROPS: { value: BackdropId; label: string }[] = [
  { value: "grid", label: "Grid" },
  { value: "clear", label: "Clear" },
  { value: "calm", label: "Calm" },
  { value: "craft", label: "Craft" },
  { value: "garden", label: "Garden" },
];
const LEVELS: { value: TextLevel; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "simple", label: "Simple" },
];
const ROOM_BACKGROUNDS: { value: RoomBackgroundId; label: string }[] = ROOM_BACKGROUND_IDS.map(
  (id, i) => ({ value: id, label: i === 0 ? "Default" : `View ${i + 1}` }),
);

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
  return (
    <>
      <SectionHeader>Display</SectionHeader>
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

export function GuidanceSection({ ...focus }: FocusProps) {
  const settings = useGameStore((s) => s.settings);
  const mode = useGameStore((s) => s.mode);
  const setSettings = useGameStore((s) => s.setSettings);
  const setMode = useGameStore((s) => s.setMode);
  const { targetLayout, targetActivated } = useFocusHandlers(focus);
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
      {mode !== "free" ? (
        <Row
          label="Show instructions"
          desc="Off: only the progress bar stays at the top"
          value={settings.showInstructions}
          onValueChange={(v) => setSettings({ showInstructions: v })}
        />
      ) : null}
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

const MUSIC_STEPS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

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

const TUTORIAL_ROUTE = "/tutorial" as Href;

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
            useGameStore.getState().reset();
            useTutorialStore.getState().resetTutorial();
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
      <Row
        label="Show avatar"
        desc="Your companion wanders the room. Turning it off also frees the memory and per-frame work it costs."
        value={roomAvatarVisible}
        onValueChange={setRoomAvatarVisible}
      />
    </>
  );
}

const LANDING_ROUTE = "/" as Href;

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
            .finally(() => {
              if (router.canDismiss()) router.dismissAll();
              router.replace(LANDING_ROUTE);
            });
        },
      },
    ]);

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
