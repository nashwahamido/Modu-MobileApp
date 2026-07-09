// The 3D game screen — assembles the LACK table via react-native-filament.
import { useEffect, useRef, useState } from "react";
import { ImageBackground, Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { FilamentScene } from "react-native-filament";

// scene
import { AssemblyScene } from "@/src/adhd/scene/AssemblyScene";
// scene control
import { createOffsetDriver } from "@/src/adhd/scene/offsetDriver";
import { useSceneState } from "@/src/adhd/scene/useSceneState";

// input
import { Joystick } from "@/src/adhd/input/Joystick";
import { useOrbitCamera } from "@/src/adhd/input/useOrbitCamera";
import { usePartDrag } from "@/src/adhd/input/usePartDrag";
import { BeatControl } from "@/src/adhd/input/BeatControl";
import { TapControl } from "@/src/adhd/input/TapControl";
import { TightenControl } from "@/src/adhd/input/TightenControl";
import { RotateControl } from "@/src/adhd/input/RotateControl";

// assembly data
import { useGameStore } from "@/src/adhd/core/store";
import { FurnitureStyle } from "@/src/adhd/core/type";
import { LACK } from "@/src/adhd/furnitures/LACK";
import { instructionText } from "@/src/adhd/core/presentation/instructions";

// This screen assembles the LACK table.
const ACTIVE_FURNITURE = LACK;

// Background images (static requires — Metro can't bundle a dynamic path).
// One light + dark backdrop per visual style. Cartoonish reuses the realistic
// backdrops for now (its own art comes with the cartoon table).
const BACKDROPS: Record<
  FurnitureStyle,
  { light: number; dark: number }
> = {
  realistic: {
    light: require("@/src/adhd/assets/images/studio-bg.png"),
    dark: require("@/src/adhd/assets/images/dark.png"),
  },
  cozy: {
    light: require("@/src/adhd/assets/images/cozy-bg.png"),
    dark: require("@/src/adhd/assets/images/cozy-dark.png"),
  },
  cartoonish: {
    light: require("@/src/adhd/assets/images/cartoonish-bg.png"),
    dark: require("@/src/adhd/assets/images/cartoonish-dark.png"),
  },
};

// ui related
import { GreenFlash } from "@/src/adhd/ui/GreenFlash";
import { FitChip } from "@/src/adhd/ui/FitChip";
import { PartsTray } from "@/src/adhd/ui/PartsTray";
import { BaseStashControl } from "@/src/adhd/ui/BaseStashControl";
import { DevAutoStep } from "@/src/adhd/ui/DevAutoStep";
import { SettingsPanel } from "@/src/adhd/ui/SettingsPanel";

/** Compact on-screen toggle (bottom-right): Focus / Hints / Auto-View. */
function ToggleChip({
  label,
  on,
  onToggle,
  dark,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
  dark?: boolean;
}) {
  return (
    <Pressable
      style={[
        styles.chip,
        dark && styles.chipDark,
        on && (dark ? styles.chipOnDark : styles.chipOn),
      ]}
      onPress={onToggle}
      hitSlop={6}
    >
      <Text
        style={[
          styles.chipText,
          dark && styles.chipTextDark,
          on && styles.chipTextOn,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function GameScreen() {
  const {
    manipulator,
    onStickStart,
    onStickMove,
    onStickEnd,
    onZoomDelta,
    onPanStart,
    onPanMove,
    onPanEnd,
    resetCamera,
    getFocusPoint,
  } = useOrbitCamera();
  const lastScale = useRef(1);
  const sceneState = useSceneState();
  const heldDriver = useRef(createOffsetDriver()).current;
  const sinkDriver = useRef(createOffsetDriver()).current;

  useEffect(() => {
    if (!useGameStore.getState().furniture) useGameStore.getState().loadFurniture(ACTIVE_FURNITURE);
  }, []);

  // Primitive selectors only — object-returning selectors re-render forever.
  const furniture = useGameStore((s) => s.furniture);
  // The base-stash control is a multi-cluster feature (DALFRED's base/seat).
  // Single-cluster furniture like LACK must not show it — stashing would hide
  // the whole assembly during the fastener stage.
  const multiCluster = furniture
    ? new Set(Object.values(furniture.parts).map((p) => p.cluster)).size > 1
    : false;
  const stage = useGameStore((s) => s.stage());
  const settings = useGameStore((s) => s.settings);
  const setSettings = useGameStore((s) => s.setSettings);
  const firstAvailable = useGameStore((s) => s.available()[0]?.actionId);
  const completedCount = useGameStore((s) => s.completed.length);
  const orientationActionId = useGameStore((s) => s.orientationActionId);
  const heldActionId = useGameStore((s) => s.heldActionId);
  const undoneCount = useGameStore((s) => s.undoneActions.length);
  const [showSettings, setShowSettings] = useState(false);
  const totalCount = furniture?.actions.length ?? 0;
  const dark = settings.darkMode;
  const objectiveFontSize = Math.round(14 * settings.fontScale);
  const orientationAction = orientationActionId
    ? furniture?.actions.find((a) => a.actionId === orientationActionId)
    : null;
  const objective = furniture && firstAvailable
    ? instructionText(furniture.instructions, firstAvailable, settings.textLevel)
    : "All done!";

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onBegin(() => {
      lastScale.current = 1;
    })
    .onUpdate((e) => {
      onZoomDelta(e.scale - lastScale.current);
      lastScale.current = e.scale;
    });

  // Two-finger drag pans the scene (strafe). A translation threshold keeps a
  // pinch (distance change, little centroid travel) from triggering it.
  const pan = Gesture.Pan()
    .runOnJS(true)
    .minPointers(2)
    // No averageTouches: track the primary finger so lifting the second one
    // doesn't snap the tracked point (which lurched the scene on release).
    .activeOffsetX([-22, 22])
    .activeOffsetY([-22, 22])
    .onStart((e) => onPanStart(e.x, e.y))
    // Ignore the centroid snap when a finger lifts (2→1) — that jump would
    // strafe the scene right before the gesture ends.
    .onUpdate((e) => {
      if (e.numberOfPointers >= 2) onPanMove(e.x, e.y);
    })
    .onEnd(() => onPanEnd())
    .onFinalize(() => onPanEnd());
  // Race, not Simultaneous: the gesture is EITHER a zoom or a pan, never both,
  // so a pinch no longer drifts the scene and a pan no longer changes zoom.
  const { gestureFor, canvasGesture, ringOverlay } = usePartDrag({
    manipulator,
    heldDriver,
    getFocusPoint,
    onPanStart,
    onPanMove,
    onPanEnd,
  });

  // One-finger canvas drag pans the table (or moves a floating part); two-finger
  // pan / pinch drive the camera. They never collide (different finger counts).
  const sceneGesture = Gesture.Race(pinch, pan, canvasGesture);

  if (!furniture) return <View style={styles.root} />;

  return (
    <ImageBackground
      source={BACKDROPS[settings.style][settings.darkMode ? "dark" : "light"]}
      resizeMode="cover"
      style={[styles.root, settings.darkMode && styles.rootDark]}
    >
      <GestureDetector gesture={sceneGesture}>
        <View style={styles.sceneWrap}>
          <AssemblyScene
            key={`${settings.style}:${settings.toonShader}`}
            cameraManipulator={manipulator}
            sceneState={sceneState}
            heldDriver={heldDriver}
            sinkDriver={sinkDriver}
          />
        </View>
      </GestureDetector>
      {settings.showHints ? (
        <View style={[styles.objectiveBar, dark && styles.objectiveBarDark]} pointerEvents="none">
          <Text style={[styles.objectiveText, dark && styles.objectiveTextDark, { fontSize: objectiveFontSize }]}>
            Stage {stage} · {objective} · {completedCount}/{totalCount}
          </Text>
          <View style={[styles.progressTrack, dark && styles.progressTrackDark]}>
            <View
              style={[
                styles.progressFill,
                { width: `${totalCount ? (completedCount / totalCount) * 100 : 0}%` },
              ]}
            />
          </View>
        </View>
      ) : null}
      {settings.focusMode ? null : (
        <View style={[styles.pointsChip, dark && styles.pointsChipDark]} pointerEvents="none">
          <Text style={[styles.pointsText, dark && styles.pointsTextDark]}>★ {completedCount * furniture.xpPerStep}</Text>
        </View>
      )}
      <FitChip />
      <PartsTray
        items={sceneState.trayItems}
        gestureFor={gestureFor}
        header={multiCluster ? <BaseStashControl /> : undefined}
        thumbs={furniture.thumbs}
        dark={dark}
      />
      {sceneState.activeTighten ? (
        sceneState.activeTighten.tool === "mallet" ? (
          <TapControl action={sceneState.activeTighten} sinkDriver={sinkDriver} />
        ) : (
          <TightenControl action={sceneState.activeTighten} sinkDriver={sinkDriver} />
        )
      ) : null}
      {orientationAction ? (
        <RotateControl action={orientationAction} />
      ) : null}
      {sceneState.activeBeat && !sceneState.activeTighten && !orientationAction && settings.showHints ? (
        <BeatControl action={sceneState.activeBeat} />
      ) : null}
      <View style={styles.joystickZone}>
        <Joystick onStart={onStickStart} onMove={onStickMove} onEnd={onStickEnd} dark={settings.darkMode} />
      </View>
      {settings.focusMode ? null : (
        <Pressable style={[styles.recenterButton, dark && styles.recenterButtonDark]} onPress={resetCamera} hitSlop={8}>
          <Text style={[styles.recenterText, dark && styles.recenterTextDark]}>⟲ Recenter</Text>
        </Pressable>
      )}
      {heldActionId && !settings.autoReturn ? (
        <Pressable
          style={styles.putBackButton}
          onPress={() => useGameStore.getState().cancelHeld()}
          hitSlop={8}
        >
          <Text style={styles.putBackText}>↩ Put back</Text>
        </Pressable>
      ) : null}
      {settings.focusMode ? null : (
        <Pressable
          style={[styles.settingsButton, dark && styles.settingsButtonDark]}
          onPress={() => setShowSettings(true)}
          hitSlop={8}
        >
          <Text style={[styles.settingsIcon, dark && styles.settingsIconDark]}>⚙</Text>
        </Pressable>
      )}
      {settings.focusMode ? null : (
      <View style={styles.undoRedoRow}>
        <Pressable
          style={[styles.ctrlButton, dark && styles.ctrlButtonDark, completedCount === 0 && styles.ctrlDisabled]}
          onPress={() => useGameStore.getState().undoLastAction()}
          disabled={completedCount === 0}
          hitSlop={8}
        >
          <Text style={[styles.ctrlText, dark && styles.ctrlTextDark]}>↶</Text>
        </Pressable>
        <Pressable
          style={[styles.ctrlButton, dark && styles.ctrlButtonDark, undoneCount === 0 && styles.ctrlDisabled]}
          onPress={() => useGameStore.getState().redoLastAction()}
          disabled={undoneCount === 0}
          hitSlop={8}
        >
          <Text style={[styles.ctrlText, dark && styles.ctrlTextDark]}>↷</Text>
        </Pressable>
      </View>
      )}
      <View style={styles.togglesRow}>
        <DevAutoStep heldDriver={heldDriver} sinkDriver={sinkDriver} />
        <ToggleChip
          label="Focus"
          on={settings.focusMode}
          onToggle={() => setSettings({ focusMode: !settings.focusMode })}
          dark={dark}
        />
        {settings.focusMode ? null : (
          <ToggleChip
            label="Auto-View"
            on={settings.autoView}
            onToggle={() => setSettings({ autoView: !settings.autoView })}
            dark={dark}
          />
        )}
      </View>
      {ringOverlay}
      <GreenFlash trigger={completedCount} />
      {showSettings ? (
        <SettingsPanel onClose={() => setShowSettings(false)} />
      ) : null}
    </ImageBackground>
  );
}

export default function GameScreenRoute() {
  return (
    <FilamentScene>
      <GameScreen />
    </FilamentScene>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#a8cfe0" },
  rootDark: { backgroundColor: "#4a6385" },
  sceneWrap: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  objectiveBar: {
    position: "absolute",
    top: 10,
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.75)",
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 18,
  },
  objectiveText: { fontSize: 14, color: "#2e2a24", fontWeight: "600" },
  progressTrack: {
    marginTop: 6,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(60,50,40,0.15)",
    alignSelf: "stretch",
    overflow: "hidden",
  },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: "#37c871" },
  pointsChip: {
    position: "absolute",
    top: 10,
    left: 14,
    backgroundColor: "rgba(255,255,255,0.75)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
  },
  pointsText: { fontSize: 13, fontWeight: "700", color: "#b8741a" },
  joystickZone: { position: "absolute", left: 28, bottom: 28 },
  recenterButton: {
    position: "absolute",
    left: 14,
    top: 102,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(60,50,40,0.15)",
  },
  recenterText: { fontSize: 12, fontWeight: "700", color: "#2e2a24" },
  settingsButton: {
    position: "absolute",
    top: 8,
    left: 92,
    backgroundColor: "rgba(255,255,255,0.75)",
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsIcon: { fontSize: 20, color: "#2e2a24" },
  undoRedoRow: { position: "absolute", top: 54, left: 14, flexDirection: "row", gap: 8 },
  ctrlButton: {
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: 12,
    width: 42,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(60,50,40,0.15)",
  },
  ctrlDisabled: { opacity: 0.4 },
  ctrlText: { fontSize: 18, fontWeight: "700", color: "#2e2a24" },
  putBackButton: {
    position: "absolute",
    left: 14,
    top: 150,
    backgroundColor: "rgba(232,132,44,0.92)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(60,50,40,0.15)",
  },
  putBackText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  togglesRow: {
    position: "absolute",
    right: 14,
    bottom: 16,
    flexDirection: "row",
    gap: 8,
  },
  chip: {
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(60,50,40,0.15)",
  },
  chipOn: { backgroundColor: "#6f8a68", borderColor: "#6f8a68" },
  chipText: { fontSize: 12, fontWeight: "700", color: "#2e2a24" },
  chipTextOn: { color: "#fff" },

  // ── Dark-mode chrome: dark translucent surfaces, light text/icons, and a
  // deeper selected-green than the light theme's #6f8a68. ──
  objectiveBarDark: { backgroundColor: "rgba(22,30,44,0.82)" },
  objectiveTextDark: { color: "#eef1f6" },
  progressTrackDark: { backgroundColor: "rgba(255,255,255,0.16)" },
  pointsChipDark: { backgroundColor: "rgba(22,30,44,0.82)" },
  pointsTextDark: { color: "#f0b866" },
  recenterButtonDark: {
    backgroundColor: "rgba(22,30,44,0.86)",
    borderColor: "rgba(255,255,255,0.18)",
  },
  recenterTextDark: { color: "#eef1f6" },
  settingsButtonDark: { backgroundColor: "rgba(22,30,44,0.82)" },
  settingsIconDark: { color: "#eef1f6" },
  ctrlButtonDark: {
    backgroundColor: "rgba(22,30,44,0.86)",
    borderColor: "rgba(255,255,255,0.18)",
  },
  ctrlTextDark: { color: "#eef1f6" },
  chipDark: {
    backgroundColor: "rgba(22,30,44,0.86)",
    borderColor: "rgba(255,255,255,0.18)",
  },
  chipOnDark: { backgroundColor: "#3e5a37", borderColor: "#3e5a37" },
  chipTextDark: { color: "#eef1f6" },
});