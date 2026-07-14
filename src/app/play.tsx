// TODO: settle down the part marked as dev-setting (float mode vs auto return)

import { useEffect, useMemo, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import type { Href } from "expo-router";
import { OrientationLock } from "expo-screen-orientation";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FilamentScene } from "react-native-filament";

import { AssemblyScene } from "@/src/game/scene/AssemblyScene";
import {
  createClusterDriver,
  createOffsetDriver,
} from "@/src/game/scene/offsetDriver";
import { useSceneState } from "@/src/game/scene/useSceneState";
import { SCENE_BACKGROUND } from "@/src/game/scene/lighting";

import { Joystick } from "@/src/game/input/Joystick";
import { useOrbitCamera } from "@/src/game/input/useOrbitCamera";
import { usePartDrag } from "@/src/game/input/usePartDrag";
import { BeatControl } from "@/src/game/input/BeatControl";
import { TapControl } from "@/src/game/input/TapControl";
import { TightenControl } from "@/src/game/input/TightenControl";
import { RotateControl } from "@/src/game/input/RotateControl";
import { SlideControl } from "@/src/game/input/SlideControl";
import { PressControl } from "@/src/game/input/PressControl";
import { ToolBar } from "@/src/game/ui/ToolBar";
import {
  objectiveText,
  speaksSteps,
} from "@/src/game/core/presentation/objective";

import { useGameStore } from "@/src/game/core/store";
import {
  pressParkInfo,
  screwParkOffset,
  slideParkInfo,
} from "@/src/game/core/evaluation/engagement";
import {
  isPlayable,
  loadFurnitureById,
} from "@/src/game/data/furnitures/furnitures";
import { instructionText } from "@/src/game/core/presentation/instructions";
import { useStepAudio } from "@/src/game/audio/useStepAudio";

import { GreenFlash } from "@/src/game/ui/GreenFlash";
import { HintToast } from "@/src/game/ui/HintToast";
import { CenterDropRing } from "@/src/game/ui/CenterDropRing";
import { FitChip } from "@/src/game/ui/FitChip";
import { PartsTray } from "@/src/game/ui/PartsTray";
import { ClusterTray } from "@/src/game/ui/ClusterTray";
import { UndoButton } from "@/src/game/ui/UndoButton";
import { GameSettings } from "@/src/game/ui/GameSettings";
import { DevAutoStep } from "@/src/game/ui/DevAutoStep";
import { ToggleChips } from "@/src/game/ui/ToggleChips";
import { ClusterFocusControl } from "@/src/game/ui/ClusterFocusControl";
import { useScreenOrientationLock } from "@/src/hooks/use-screen-orientation-lock";
import {
  currentStageForClusterFocus,
  requiresClusterFocus,
} from "@/src/game/core/evaluation/clusters";
import { availableInMode } from "@/src/game/core/evaluation/availability";
import type { FurnitureId } from "@/src/game/core/type";

// Per-backdrop images (from the on-release engine's set), each with a dark variant. The Background setting picks the key; Dark mode picks the variant.
const BACKDROPS: Record<string, { light: number; dark: number }> = {
  studio: {
    light: require("../assets/images/backdrops/studio-light.png"),
    dark: require("../assets/images/backdrops/studio-dark.png"),
  },
  cozy: {
    light: require("../assets/images/backdrops/cozy-light.png"),
    dark: require("../assets/images/backdrops/cozy-dark.png"),
  },
  cartoon: {
    light: require("../assets/images/backdrops/cartoon-light.png"),
    dark: require("../assets/images/backdrops/cartoon-dark.png"),
  },
};

function GameScreen() {
  useScreenOrientationLock(OrientationLock.LANDSCAPE);
  const insets = useSafeAreaInsets();
  const [showRoomPrompt, setShowRoomPrompt] = useState(false);

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
  const clusterDriver = useRef(createClusterDriver()).current;

  const { id } = useLocalSearchParams<{ id?: string }>();
  useEffect(() => {
    const target: FurnitureId = isPlayable(id as FurnitureId)
      ? (id as FurnitureId)
      : "DALFRED";
    if (useGameStore.getState().furniture?.meta.id === target) return;
    loadFurnitureById(target).then((f) => {
      useGameStore.getState().loadFurniture(f);
    });
  }, [id]);

  const furniture = useGameStore((s) => s.furniture);
  const stage = useGameStore((s) => {
    const f = s.furniture;
    return f
      ? currentStageForClusterFocus(f, new Set(s.completed), s.activeCluster)
      : 1;
  });
  const settings = useGameStore((s) => s.settings);
  // Dev-setting: float mode vs auto return
  const heldActionId = useGameStore((s) => s.heldActionId);
  const renderStyle = useGameStore((s) => s.renderStyle);
  const backdrop = useGameStore((s) => s.backdrop);
  const theme = useGameStore((s) => s.theme);
  const activeCluster = useGameStore((s) => s.activeCluster);
  const mode = useGameStore((s) => s.mode);
  const focus = settings.focusMode;
  const dark = theme === "dark";
  const firstAvailable = useGameStore((s) => {
    const f = s.furniture;
    if (!f) return undefined;
    return availableInMode(f, new Set(s.completed), s.mode, s.activeCluster)[0]
      ?.actionId;
  });
  const completedCount = useGameStore((s) => s.completed.length);
  const orientationActionId = useGameStore((s) => s.orientationActionId);
  const totalCount = furniture?.actions.length ?? 0;
  const taskComplete = totalCount > 0 && completedCount >= totalCount;
  const objectiveFontSize = Math.round(14 * settings.fontScale);
  const orientationAction = orientationActionId
    ? furniture?.actions.find((a) => a.actionId === orientationActionId)
    : null;
  const orientationSinkDelta =
    furniture && orientationAction
      ? screwParkOffset(
          furniture,
          orientationAction,
          new Set(useGameStore.getState().completed),
        )
      : null;
  const driveActionId = useGameStore((s) => s.driveActionId);
  const driveKind = useGameStore((s) => s.driveKind);
  const driveAction = driveActionId
    ? furniture?.actions.find((a) => a.actionId === driveActionId)
    : null;
  const drivePark =
    furniture && driveAction
      ? (driveKind === "slide" ? slideParkInfo : pressParkInfo)(
          furniture,
          driveAction,
          new Set(useGameStore.getState().completed),
        )
      : null;
  const needsFocusChoice =
    mode !== "strict" &&
    !!furniture &&
    requiresClusterFocus(furniture) &&
    !activeCluster;
  const objective = objectiveText({
    mode,
    needsFocusChoice,
    stepText:
      furniture && firstAvailable
        ? instructionText(
            furniture.instructions,
            firstAvailable,
            settings.textLevel,
          )
        : null,
    completedCount,
    totalCount,
  });

  useStepAudio(
    furniture?.audio,
    needsFocusChoice || !speaksSteps(mode) ? undefined : firstAvailable,
    settings.audio,
  );

  useEffect(() => {
    if (taskComplete) {
      setShowRoomPrompt(true);
    }
  }, [taskComplete]);

  const selectedTool = useGameStore((s) => s.selectedTool);
  const neededTool = settings.manualTools
    ? (sceneState.activeTighten?.tool ?? driveAction?.tool ?? null)
    : null;
  const toolReady = !neededTool || selectedTool === neededTool;

  // Scene gestures are MEMOIZED: the screen re-renders constantly mid-drag (fit-state churn), and handing GestureDetector fresh gesture instances reattaches native handlers — eating the first re-grab attempt and stuttering active drags (same lesson as the joystick).
  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .onBegin(() => {
          lastScale.current = 1;
        })
        .onUpdate((e) => {
          onZoomDelta(e.scale - lastScale.current);
          lastScale.current = e.scale;
        }),
    [onZoomDelta],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minPointers(2)
        .activeOffsetX([-22, 22])
        .activeOffsetY([-22, 22])
        .onStart((e) => onPanStart(e.x, e.y))
        .onUpdate((e) => {
          if (e.numberOfPointers >= 2) onPanMove(e.x, e.y);
        })
        .onEnd(() => onPanEnd())
        .onFinalize(() => onPanEnd()),
    [onPanStart, onPanMove, onPanEnd],
  );

  // Canvas strafe when NOTHING is held — one-finger drag pans the camera, gated by the canvasStrafe setting in plain JS (a strafe that "activates" with the toggle off is a harmless no-op; there is no competing gesture). While a part IS held, the canvas gesture from usePartDrag owns the finger and routes: floating part → re-grab, else → these same strafe callbacks.
  const strafing = useRef(false);
  const strafePan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .maxPointers(1)
        .activeOffsetX([-12, 12])
        .activeOffsetY([-12, 12])
        .onStart((e) => {
          if (useGameStore.getState().settings.canvasStrafe) {
            strafing.current = true;
            onPanStart(e.x, e.y);
          }
        })
        .onUpdate((e) => {
          if (strafing.current) onPanMove(e.x, e.y);
        })
        .onFinalize(() => {
          if (strafing.current) {
            strafing.current = false;
            onPanEnd();
          }
        }),
    [onPanStart, onPanMove, onPanEnd],
  );

  const { gestureFor, canvasGestureFor, ringOverlay } = usePartDrag({
    manipulator,
    heldDriver,
    getFocusPoint,
    onPanStart,
    onPanMove,
    onPanEnd,
  });

  // Composition identity changes ONLY when the held action or the canvas toggles change (touch-free moments), never on ordinary re-renders. Canvas gestures are attached ONLY when they can do something — with float and canvas-strafe both off, this is byte-identical to the classic pinch + two-finger-pan tree, so a no-op canvas gesture can never win the race and block a pinch (sloppy two-finger starts, zoom mid-drag).
  const heldAction = sceneState.heldAction;
  const canvasStrafeOn = settings.canvasStrafe;
  const floatOn = settings.releaseBehavior === "float";
  const sceneGesture = useMemo(() => {
    if (heldAction && (floatOn || canvasStrafeOn)) {
      return Gesture.Race(pinch, pan, canvasGestureFor(heldAction));
    }
    if (!heldAction && canvasStrafeOn) {
      return Gesture.Race(pinch, pan, strafePan);
    }
    return Gesture.Race(pinch, pan);
  }, [heldAction, floatOn, canvasStrafeOn, pinch, pan, strafePan, canvasGestureFor]);

  if (!furniture) return <View style={styles.root} />;

  return (
    <View style={[styles.root, theme === "dark" && styles.rootDark]}>
      {/* "clear": no image — the milk-white root (SCENE_BACKGROUND) / dark root shows through. Every other backdrop is a full-bleed image. */}
      {backdrop === "clear" ? null : (
        <Image
          source={
            (BACKDROPS[backdrop] ?? BACKDROPS.studio)[
              theme === "dark" ? "dark" : "light"
            ]
          }
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      )}
      <GestureDetector gesture={sceneGesture}>
        <View style={styles.sceneWrap}>
          <AssemblyScene
            key={renderStyle}
            cameraManipulator={manipulator}
            sceneState={sceneState}
            heldDriver={heldDriver}
            sinkDriver={sinkDriver}
            clusterDriver={clusterDriver}
          />
        </View>
      </GestureDetector>
      <View
        style={[
          styles.chrome,
          {
            top: insets.top,
            // Full landscape notch insets (~48dp) push the HUD too far in; zero (her layout) sits under the notch. Cap at 16dp — with each element's own 14dp offset that lands ~30dp from the screen edge.
            left: Math.min(insets.left, 16),
            right: Math.min(insets.right, 16),
            bottom: insets.bottom,
          },
        ]}
        pointerEvents="box-none"
      >
        {/* Instructions hidden → only the progress bar stays (slim pill). */}
        <View
          style={[
            styles.objectiveBar,
            !settings.showInstructions && styles.objectiveBarSlim,
            dark && styles.objectiveBarDark,
          ]}
          pointerEvents="none"
        >
          {settings.showInstructions ? (
            <Text style={[styles.objectiveText, dark && styles.objectiveTextDark, { fontSize: objectiveFontSize }]}>
              Stage {stage} · {objective} · {completedCount}/{totalCount}
            </Text>
          ) : null}
          <View
            style={[
              styles.progressTrack,
              !settings.showInstructions && styles.progressTrackSlim,
              dark && styles.progressTrackDark,
            ]}
          >
            <View
              style={[
                styles.progressFill,
                !settings.showInstructions && styles.progressFillSlim,
                {
                  width: `${totalCount ? (completedCount / totalCount) * 100 : 0}%`,
                },
              ]}
            />
          </View>
        </View>
        {focus ? null : (
          <View style={[styles.pointsChip, dark && styles.pointsChipDark]} pointerEvents="none">
            <Text style={[styles.pointsText, dark && styles.pointsTextDark]}>
              ★ {completedCount * furniture.xpPerStep}
            </Text>
          </View>
        )}
        <CenterDropRing />
        <FitChip />
        <HintToast />
        <UndoButton />
        <GameSettings />
        {/* Bottom-right toggles row (her togglesRow): dev auto + Focus/Auto-View. */}
        <View style={styles.togglesRow}>
          <DevAutoStep heldDriver={heldDriver} sinkDriver={sinkDriver} />
          <ToggleChips />
        </View>
        {mode !== "strict" ? <ClusterFocusControl /> : null}
        <PartsTray
          items={sceneState.trayItems}
          gestureFor={gestureFor}
          thumbs={furniture.thumbs}
          header={<ClusterTray clusterDriver={clusterDriver} />}
        />
        <ToolBar neededTool={neededTool} />
        {mode === "free" && !focus ? (
          <Pressable
            style={styles.hintButton}
            hitSlop={8}
            onPress={() => useGameStore.getState().suggestNext()}
          >
            <Text style={styles.hintButtonText}>?</Text>
          </Pressable>
        ) : null}
        {sceneState.activeTighten && toolReady ? (
          sceneState.activeTighten.tool === "mallet" ? (
            <TapControl
              action={sceneState.activeTighten}
              sinkDriver={sinkDriver}
            />
          ) : (
            <TightenControl
              action={sceneState.activeTighten}
              sinkDriver={sinkDriver}
            />
          )
        ) : null}
        {orientationAction ? (
          <RotateControl
            action={orientationAction}
            driver={heldDriver}
            sinkDelta={orientationSinkDelta}
          />
        ) : null}
        {driveAction && driveKind === "slide" && toolReady ? (
          <SlideControl
            action={driveAction}
            driver={heldDriver}
            park={drivePark}
          />
        ) : null}
        {driveAction && driveKind === "press" && toolReady ? (
          <PressControl
            action={driveAction}
            driver={heldDriver}
            park={drivePark}
          />
        ) : null}
        {sceneState.activeBeat &&
        sceneState.activeBeat.type !== "combineClusters" &&
        !sceneState.activeTighten &&
        !orientationAction &&
        !driveAction ? (
          <BeatControl action={sceneState.activeBeat} />
        ) : null}
        <View style={styles.joystickZone}>
          <Joystick
            onStart={onStickStart}
            onMove={onStickMove}
            onEnd={onStickEnd}
            dark={dark}
          />
        </View>
        <Pressable
          style={[styles.recenterButton, dark && styles.recenterButtonDark]}
          onPress={resetCamera}
          hitSlop={8}
        >
          <Text style={[styles.recenterText, dark && styles.recenterTextDark]}>⟲ Recenter</Text>
        </Pressable>

      {heldActionId && settings.releaseBehavior === "float" ? (
          // Float mode: a released part stays where it was set down; this is the way back to the tray. (In autoReturn mode a miss returns by itself.)
          <Pressable
            style={styles.putBackButton}
            onPress={() => useGameStore.getState().cancelHeld()}
            hitSlop={8}
          >
            <Text style={styles.putBackText}>↩ Put back</Text>
          </Pressable>
        ) : null}
      </View>
      {showRoomPrompt ? (
        <View style={styles.roomPromptLayer} pointerEvents="auto">
          <View style={styles.roomPromptCard}>
            <Text style={styles.roomPromptKicker}>Assembly complete</Text>
            <Text style={styles.roomPromptTitle}>Your task is finished.</Text>
            <Text style={styles.roomPromptBody}>Now enter your room and place your furniture.</Text>
            <View style={styles.roomPromptActions}>
              <Pressable
                style={styles.roomPromptSecondary}
                onPress={() => setShowRoomPrompt(false)}
                hitSlop={8}
              >
                <Text style={styles.roomPromptSecondaryText}>Stay here</Text>
              </Pressable>
              <Pressable
                style={styles.roomPromptPrimary}
                onPress={() => router.replace("/room" as Href)}
                hitSlop={8}
              >
                <Text style={styles.roomPromptPrimaryText}>Enter room</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
      {ringOverlay}
      <GreenFlash trigger={completedCount} />
    </View>
  );
}

export default function PlayRoute() {
  return (
    <FilamentScene>
      <GameScreen />
    </FilamentScene>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCENE_BACKGROUND },
  rootDark: { backgroundColor: "#17140f" },
  sceneWrap: { ...StyleSheet.absoluteFillObject },
  chrome: { position: "absolute" },
  objectiveBar: {
    position: "absolute",
    top: 10,
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.75)",
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 18,
  },
  // Instructions hidden: a slim fixed-width pill so the bar doesn't collapse without its text.
  objectiveBarSlim: { width: 260, paddingVertical: 7 },
  objectiveText: { fontSize: 14, color: "#2e2a24", fontWeight: "600" },
  // Bar-only mode: thicker track/fill so the lone bar stays clearly visible.
  progressTrackSlim: { marginTop: 0, height: 7, borderRadius: 3.5 },
  progressFillSlim: { height: 7, borderRadius: 3.5 },
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
    // Fixed size so the top-left row never shifts, whether the score is 0 or 300.
    position: "absolute",
    top: 8,
    left: 14,
    width: 70,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.75)",
    borderRadius: 14,
  },
  pointsText: { fontSize: 13, fontWeight: "700", color: "#b8741a" },
  hintButton: {
    // Same line as the settings icon (points chip → gear → ?), shared 42×36 grid.
    position: "absolute",
    left: 142,
    top: 8,
    width: 42,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  hintButtonText: { fontSize: 17, fontWeight: "800", color: "#7a6f5d" },
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
  // Dark-mode chrome (on-release engine's palette): dark translucent surfaces, light text, warm points accent.
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
  // Dev-Setting: complimentary function for float mode
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
    alignItems: "center",
    gap: 8,
    zIndex: 15,
  },
  roomPromptLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 80,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(20, 18, 15, 0.34)",
    padding: 24,
  },
  roomPromptCard: {
    width: "100%",
    maxWidth: 430,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(60,50,40,0.14)",
    backgroundColor: "#fffaf0",
    paddingHorizontal: 24,
    paddingVertical: 22,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  roomPromptKicker: { color: "#37a65a", fontSize: 13, fontWeight: "900", marginBottom: 6 },
  roomPromptTitle: { color: "#171512", fontSize: 25, fontWeight: "900" },
  roomPromptBody: { marginTop: 8, color: "#6a6258", fontSize: 15, lineHeight: 21, fontWeight: "700" },
  roomPromptActions: { marginTop: 18, flexDirection: "row", alignItems: "center", gap: 12 },
  roomPromptPrimary: {
    borderRadius: 18,
    backgroundColor: "#2f2a24",
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  roomPromptPrimaryText: { color: "#fff", fontSize: 14, fontWeight: "900" },
  roomPromptSecondary: {
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "#d9cdb8",
    backgroundColor: "rgba(255,255,255,0.64)",
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  roomPromptSecondaryText: { color: "#5f574f", fontSize: 14, fontWeight: "900" },
});
