import { useEffect, useRef } from "react";
import { useLocalSearchParams } from "expo-router";
import { OrientationLock } from "expo-screen-orientation";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FilamentScene } from "react-native-filament";

import { AssemblyScene } from "@/src/game/scene/AssemblyScene";
import { createClusterDriver, createOffsetDriver } from "@/src/game/scene/offsetDriver";
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
import { objectiveText, speaksSteps } from "@/src/game/core/presentation/objective";

import { useGameStore } from "@/src/game/core/store";
import {
  pressParkInfo,
  screwParkOffset,
  slideParkInfo,
} from "@/src/game/core/evaluation/engagement";
import { isPlayable, loadFurnitureById } from "@/src/game/data/furnitures/furnitures";
import { instructionText } from "@/src/game/core/presentation/instructions";
import { useStepAudio } from "@/src/game/audio/useStepAudio";

import { GreenFlash } from "@/src/game/ui/GreenFlash";
import { HintToast } from "@/src/game/ui/HintToast";
import { CenterDropRing } from "@/src/game/ui/CenterDropRing";
import { FitChip } from "@/src/game/ui/FitChip";
import { PartsTray } from "@/src/game/ui/PartsTray";
import { ClusterTray } from "@/src/game/ui/ClusterTray";
import { ResetButton } from "@/src/game/ui/ResetButton";
import { UndoButton } from "@/src/game/ui/UndoButton";
import { GameSettings } from "@/src/game/ui/GameSettings";
import { ToggleChips } from "@/src/game/ui/ToggleChips";
import { ClusterFocusControl } from "@/src/game/ui/ClusterFocusControl";
import { useScreenOrientationLock } from "@/src/hooks/use-screen-orientation-lock";
import {
  currentStageForClusterFocus,
  requiresClusterFocus,
} from "@/src/game/core/evaluation/clusters";
import { availableInMode } from "@/src/game/core/evaluation/availability";
import type { FurnitureId } from "@/src/game/core/type";

const STUDIO = {
  light: require("../assets/images/backdrops/studio-light.png"),
  dark: require("../assets/images/backdrops/studio-dark.png"),
};
const DOT_TILE = require("../assets/images/backdrops/dot-tile.png");

function GameScreen() {
  useScreenOrientationLock(OrientationLock.LANDSCAPE);
  const insets = useSafeAreaInsets();

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
  const renderStyle = useGameStore((s) => s.renderStyle);
  const backdrop = useGameStore((s) => s.backdrop);
  const theme = useGameStore((s) => s.theme);
  const activeCluster = useGameStore((s) => s.activeCluster);
  const mode = useGameStore((s) => s.mode);
  const focus = settings.focusMode;
  const firstAvailable = useGameStore((s) => {
    const f = s.furniture;
    if (!f) return undefined;
    return availableInMode(f, new Set(s.completed), s.mode, s.activeCluster)[0]
      ?.actionId;
  });
  const completedCount = useGameStore((s) => s.completed.length);
  const orientationActionId = useGameStore((s) => s.orientationActionId);
  const totalCount = furniture?.actions.length ?? 0;
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
        ? instructionText(furniture.instructions, firstAvailable, settings.textLevel)
        : null,
    completedCount,
    totalCount,
  });

  useStepAudio(
    furniture?.audio,
    needsFocusChoice || !speaksSteps(mode) ? undefined : firstAvailable,
    settings.audio,
  );

  const selectedTool = useGameStore((s) => s.selectedTool);
  const neededTool = settings.manualTools
    ? sceneState.activeTighten?.tool ?? driveAction?.tool ?? null
    : null;
  const toolReady = !neededTool || selectedTool === neededTool;

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onBegin(() => {
      lastScale.current = 1;
    })
    .onUpdate((e) => {
      onZoomDelta(e.scale - lastScale.current);
      lastScale.current = e.scale;
    });

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minPointers(2)
    .activeOffsetX([-22, 22])
    .activeOffsetY([-22, 22])
    .onStart((e) => onPanStart(e.x, e.y))
    .onUpdate((e) => {
      if (e.numberOfPointers >= 2) onPanMove(e.x, e.y);
    })
    .onEnd(() => onPanEnd())
    .onFinalize(() => onPanEnd());
  const sceneGesture = Gesture.Race(pinch, pan);

  const { gestureFor, ringOverlay } = usePartDrag({
    manipulator,
    heldDriver,
    getFocusPoint,
  });

  if (!furniture) return <View style={styles.root} />;

  return (
    <View style={[styles.root, theme === "dark" && styles.rootDark]}>
      {backdrop === "studio" ? (
        <Image
          source={theme === "dark" ? STUDIO.dark : STUDIO.light}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : backdrop === "dot" ? (
        <Image
          source={DOT_TILE}
          style={[
            StyleSheet.absoluteFill,
            { tintColor: theme === "dark" ? "rgba(255,255,255,0.12)" : "rgba(40,30,20,0.10)" },
          ]}
          resizeMode="repeat"
        />
      ) : null}
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
            left: insets.left,
            right: insets.right,
            bottom: insets.bottom,
          },
        ]}
        pointerEvents="box-none"
      >
      <View style={styles.objectiveBar} pointerEvents="none">
        <Text style={[styles.objectiveText, { fontSize: objectiveFontSize }]}>
          Stage {stage} · {objective} · {completedCount}/{totalCount}
        </Text>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${totalCount ? (completedCount / totalCount) * 100 : 0}%`,
              },
            ]}
          />
        </View>
      </View>
      {focus ? null : (
        <View style={styles.pointsChip} pointerEvents="none">
          <Text style={styles.pointsText}>
            ★ {completedCount * furniture.xpPerStep}
          </Text>
        </View>
      )}
      <CenterDropRing />
      <FitChip />
      <HintToast />
      {focus ? null : <ResetButton />}
      <UndoButton />
      <GameSettings />
      <ToggleChips />
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
        <SlideControl action={driveAction} driver={heldDriver} park={drivePark} />
      ) : null}
      {driveAction && driveKind === "press" && toolReady ? (
        <PressControl action={driveAction} driver={heldDriver} park={drivePark} />
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
        />
      </View>
      <Pressable
        style={styles.recenterButton}
        onPress={resetCamera}
        hitSlop={8}
      >
        <Text style={styles.recenterText}>⟲ Recenter</Text>
      </Pressable>
      </View>
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
  hintButton: {
    position: "absolute",
    left: 118,
    top: 102,
    width: 36,
    height: 36,
    borderRadius: 18,
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
});
