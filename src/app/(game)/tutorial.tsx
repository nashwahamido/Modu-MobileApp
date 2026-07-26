import { useEffect, useMemo, useRef } from "react";
import { router } from "expo-router";
import { OrientationLock } from "expo-screen-orientation";
import { Image, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FilamentScene } from "react-native-filament";

import { AssemblyScene } from "@/src/game/scene/AssemblyScene";
import { useAssemblyDrivers } from "@/src/game/scene/useAssemblyDrivers";
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
import { ObjectiveBar } from "@/src/game/ui/ObjectiveBar";
import { HintButton, RecenterButton } from "@/src/game/ui/HudControls";
import { Theme, useStyles } from "@/src/game/ui/theme";
import { useStepObjective } from "@/src/game/core/presentation/useStepObjective";

import { useGameStore } from "@/src/game/core/store";
import { useCurrentUserId, useRepos } from "@/src/data";
import {
  pressParkInfo,
  screwParkOffset,
  slideParkInfo,
} from "@/src/game/core/evaluation/engagement";
import {
  loadFurnitureById,
} from "@/src/game/content/furnitures/furnitures";

import { GreenFlash } from "@/src/game/ui/GreenFlash";
import { HintToast } from "@/src/game/ui/HintToast";
import { CenterDropRing } from "@/src/game/ui/CenterDropRing";
import { FitChip } from "@/src/game/ui/FitChip";
import { PartsTray } from "@/src/game/ui/PartsTray";
import { ClusterTray } from "@/src/game/ui/ClusterTray";
import { UndoButton } from "@/src/game/ui/UndoButton";
import { TutorialGameSettings } from "@/src/game/tutorial/TutorialGameSettings";
import { ClusterFocusControl } from "@/src/game/ui/ClusterFocusControl";
import { backdropSource } from "@/src/game/ui/backdrops";
import { useScreenOrientationLock } from "@/src/hooks/use-screen-orientation-lock";
import {
  currentStageForClusterFocus,
  requiresClusterFocus,
} from "@/src/game/core/evaluation/clusters";
import { availableInMode } from "@/src/game/core/evaluation/availability";
import { TutorialTarget } from "@/src/game/tutorial/TutorialTarget";
import { MascotGuideOverlay } from "@/src/game/tutorial/MascotGuideOverlay";
import { useTutorialStore } from "@/src/game/tutorial/store";
import { furnitureForProfile } from "@/src/game/core/profile";
import {
  TUTORIAL_STEP_REWARD_TOKENS,
  type ToolTutorialKind,
} from "@/src/game/tutorial/steps";

function TutorialScreen() {
  useScreenOrientationLock(OrientationLock.LANDSCAPE);
  const insets = useSafeAreaInsets();
  const styles = useStyles(makeStyles);

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
  } = useOrbitCamera({ stableFraming: true });
  const lastScale = useRef(1);
  const joystickTutorialStartedAt = useRef<number | null>(null);
  const oneFingerPanStartedAt = useRef<{ x: number; y: number } | null>(null);
  const sceneState = useSceneState();
  const {
    heldDriver,
    sinkDriver,
    clusterDriver,
    pushDrivers,
    slideDriver,
    carryShared,
  } = useAssemblyDrivers();

  useEffect(() => {
    let active = true;
    const state = useGameStore.getState();
    useTutorialStore.getState().configureTutorial({
      profile: state.profile,
      mode: state.mode,
      manualTools: state.settings.manualTools,
      softHints: state.settings.softHints,
      oneFingerPanEnabled: state.settings.canvasStrafe,
    });
    loadFurnitureById("tutorial").then((f) => {
      if (active) useGameStore.getState().loadFurniture(f);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () =>
      useGameStore.subscribe((state, previous) => {
        const tutorial = useTutorialStore.getState();
        if (!previous.heldActionId && state.heldActionId) {
          tutorial.completeEvent("part_picked_up");
        }
        if (state.completed.length < previous.completed.length) {
          tutorial.completeEvent("step_undone");
        }
        if (
          state.completed.length > previous.completed.length &&
          state.undoneActions.length < previous.undoneActions.length
        ) {
          tutorial.completeEvent("step_redone");
        }
        if (state.completed.length > previous.completed.length) {
          const added = state.completed.slice(previous.completed.length);
          for (const id of added) {
            const action = state.furniture?.actions.find(
              (candidate) => candidate.actionId === id,
            );
            if (action?.type === "placePart") {
              if (previous.driveActionId === id) {
                tutorial.completeEvent("tool_used");
              } else {
                tutorial.completeEvent("part_snapped");
              }
            }
            if (action?.type === "tightenFastener") {
              tutorial.completeEvent("tool_used");
            }
          }
        }
        if (
          state.settings.autoView !== previous.settings.autoView
        ) {
          tutorial.completeEvent("auto_view_toggled");
        }
        if (
          state.settings.focusMode !== previous.settings.focusMode
        ) {
          tutorial.completeEvent("focus_mode_toggled");
        }
        if (
          state.settings.releaseBehavior !==
          previous.settings.releaseBehavior
        ) {
          tutorial.completeEvent("release_behavior_changed");
        }
        if (
          state.settings.textLevel !== previous.settings.textLevel ||
          state.settings.showInstructions !==
            previous.settings.showInstructions
        ) {
          tutorial.completeEvent("instruction_preferences_changed");
        }
        if (!previous.selectedTool && state.selectedTool) {
          tutorial.completeEvent("toolbar_used");
        }
      }),
    [],
  );

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
  // Recenter means nothing until there IS a build on the canvas — same rule as play.tsx.
  const sceneHasParts = Object.values(sceneState.modes).some(
    (m) => m !== "hidden" && m !== "socket_hint",
  );
  const dark = theme === "dark";
  const firstAvailable = useGameStore((s) => {
    const f = s.furniture;
    if (!f) return undefined;
    return availableInMode(f, new Set(s.completed), s.mode, s.activeCluster)[0]
      ?.actionId;
  });
  const completedCount = useGameStore((s) => s.completed.length);
  const guideCompleted = useTutorialStore((s) => s.completed);
  const guideStepCount = useTutorialStore((s) => s.steps.length);
  const orientationActionId = useGameStore((s) => s.orientationActionId);
  const totalCount = furniture?.actions.length ?? 0;

  // Record the tutorial furniture as a completed build once it's assembled — so the player owns it
  // (it's a placeable built_item) and it counts toward assembly_count, like any build. Fires once.
  const repos = useRepos();
  const me = useCurrentUserId();
  const tutorialRecorded = useRef(false);
  const tutorialBuilt = totalCount > 0 && completedCount >= totalCount;
  useEffect(() => {
    if (tutorialBuilt && !tutorialRecorded.current) {
      tutorialRecorded.current = true;
      repos.builds.complete(me, "tutorial").catch((err) => {
        // Re-arm so a later render can retry: the flag is set BEFORE the call to keep the effect from
        // firing twice, which would otherwise turn a transient failure into a permanently unrecorded
        // tutorial (and a missing placeable item).
        tutorialRecorded.current = false;
        console.warn("[tutorial] could not record the completed build", err);
      });
    }
  }, [tutorialBuilt, me, repos]);
  const displayedCompletedCount = guideCompleted
    ? guideStepCount + completedCount
    : completedCount;
  const displayedTotalCount = guideCompleted
    ? guideStepCount + totalCount
    : totalCount;
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
  const objective = useStepObjective({
    furniture,
    firstAvailable,
    needsFocusChoice,
    mode,
    textLevel: settings.textLevel,
    audioOn: settings.audio,
    completedCount,
    totalCount,
  });

  const selectedTool = useGameStore((s) => s.selectedTool);
  const neededTool = settings.manualTools
    ? (sceneState.activeTighten?.tool ?? driveAction?.tool ?? null)
    : null;
  const toolReady = !neededTool || selectedTool === neededTool;
  const activeToolKind: ToolTutorialKind | null =
    driveKind === "press"
      ? "press"
      : sceneState.activeTighten
        ? sceneState.activeTighten.tool === "mallet"
          ? "tap"
          : "tighten"
        : sceneState.activeBeat
          ? "beat"
          : null;
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
          if (Math.abs(e.scale - 1) > 0.04) {
            useTutorialStore.getState().completeEvent("pinch_zoomed");
          }
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
            oneFingerPanStartedAt.current = { x: e.x, y: e.y };
            onPanStart(e.x, e.y);
          }
        })
        .onUpdate((e) => {
          if (strafing.current) {
            onPanMove(e.x, e.y);
            const start = oneFingerPanStartedAt.current;
            if (start && Math.hypot(e.x - start.x, e.y - start.y) > 28) {
              useTutorialStore
                .getState()
                .completeEvent("one_finger_panned");
            }
          }
        })
        .onFinalize(() => {
          if (strafing.current) {
            strafing.current = false;
            oneFingerPanStartedAt.current = null;
            onPanEnd();
          }
        }),
    [onPanStart, onPanMove, onPanEnd],
  );

  const { gestureFor, canvasGestureFor, clusterGestureFor, ringOverlay } = usePartDrag({
    manipulator,
    heldDriver,
    slideDriver,
    carryShared,
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
      {backdropSource(backdrop, theme === "dark") ? (
        <Image
          source={backdropSource(backdrop, theme === "dark")}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : null}
      <GestureDetector gesture={sceneGesture}>
        <View style={styles.sceneWrap}>
          <TutorialTarget id="scene" style={styles.sceneTarget}>
            <AssemblyScene
              key={renderStyle}
              cameraManipulator={manipulator}
              sceneState={sceneState}
              heldDriver={heldDriver}
              sinkDriver={sinkDriver}
              clusterDriver={clusterDriver}
              pushDrivers={pushDrivers}
              slideDriver={slideDriver}
              carryShared={carryShared}
            />
          </TutorialTarget>
        </View>
      </GestureDetector>
      <TutorialTarget
        id="assemblyArea"
        style={styles.assemblyTarget}
        pointerEvents="none"
      />
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
        {/* Instructions hidden → only the progress bar stays (slim pill). Shared with play.tsx, so the tutorial HUD can never drift from the real one. */}
        <View style={styles.objectiveWrap} pointerEvents="none">
          <ObjectiveBar
            line={
              settings.showInstructions
                ? guideCompleted
                  ? `Finish the tutorial cabinet · ${displayedCompletedCount}/${displayedTotalCount}`
                  : `Stage ${stage} · ${objective} · ${completedCount}/${totalCount}`
                : null
            }
            fontSize={objectiveFontSize}
            value={displayedCompletedCount}
            total={displayedTotalCount}
            xp={completedCount * furniture.xpPerStep}
          />
        </View>
        <CenterDropRing />
        <FitChip />
        <HintToast />
        <UndoButton />
        <TutorialTarget
          id="undo"
          style={styles.undoTarget}
          pointerEvents="none"
        />
        <TutorialGameSettings />
        <TutorialTarget
          id="settings"
          style={styles.settingsTarget}
          pointerEvents="none"
        />
        {mode !== "strict" ? <ClusterFocusControl /> : null}
        <PartsTray
          items={sceneState.trayItems}
          gestureFor={gestureFor}
          thumbs={furniture.thumbs}
          header={
            <ClusterTray
              clusterDriver={clusterDriver}
              clusterGestureFor={clusterGestureFor}
            />
          }
        />
        <TutorialTarget
          id="partsTray"
          style={styles.partsTrayTarget}
          pointerEvents="none"
        />
        <ToolBar neededTool={neededTool} />
        <TutorialTarget
          id="toolbar"
          style={styles.toolbarTarget}
          pointerEvents="none"
        />
        {mode === "free" && !focus ? (
          <TutorialTarget id="hint" style={styles.hintButton}>
            <HintButton
              onPress={() => {
                useGameStore.getState().suggestNext();
                useTutorialStore.getState().completeEvent("hint_requested");
              }}
            />
          </TutorialTarget>
        ) : null}
        {activeToolKind ? (
          <TutorialTarget
            id="tool"
            style={styles.toolTarget}
            pointerEvents="none"
          />
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
        <TutorialTarget id="joystick" style={styles.joystickZone}>
          <Joystick
            onStart={() => {
              joystickTutorialStartedAt.current = Date.now();
              onStickStart();
            }}
            onMove={(x, y) => {
              onStickMove(x, y);
              const startedAt = joystickTutorialStartedAt.current;
              if (
                startedAt &&
                Date.now() - startedAt > 800 &&
                Math.hypot(x, y) > 0.15
              ) {
                useTutorialStore
                  .getState()
                  .completeEvent("joystick_moved");
              }
            }}
            onEnd={() => {
              joystickTutorialStartedAt.current = null;
              onStickEnd();
            }}
            dark={dark}
          />
        </TutorialTarget>
        <TutorialTarget id="recenter" style={styles.recenterButton}>
          <RecenterButton
            enabled={sceneHasParts}
            onPress={() => {
              resetCamera();
              useTutorialStore
                .getState()
                .completeEvent("camera_recentered");
            }}
          />
        </TutorialTarget>

      </View>
      {ringOverlay}
      <GreenFlash trigger={completedCount} />
      <MascotGuideOverlay
        activeToolKind={activeToolKind}
        assemblyComplete={totalCount > 0 && completedCount >= totalCount}
        audioEnabled={settings.audio}
        onClaimReward={() => {}}
        onSimulatePinch={() => {
          if (!manipulator) return;
          onZoomDelta(0.18);
          useTutorialStore.getState().completeEvent("pinch_zoomed");
        }}
        onContinueToAssembly={() => {
          const tutorial = useTutorialStore.getState();
          const finishedAllSteps =
            tutorial.completed &&
            tutorial.currentIndex === tutorial.steps.length - 1 &&
            tutorial.stepRewardsClaimed >=
              tutorial.steps.length * TUTORIAL_STEP_REWARD_TOKENS;
          const game = useGameStore.getState();
          const requiredActions = game.furniture?.actions.length ?? 0;
          const finishedAssembly =
            requiredActions > 0 && game.completed.length >= requiredActions;
          if (!finishedAllSteps || !finishedAssembly) return;
          router.replace({
            pathname: "/play",
            params: { id: furnitureForProfile(game.profile) },
          });
        }}
      />
    </View>
  );
}

export default function TutorialRoute() {
  return (
    <FilamentScene>
      <TutorialScreen />
    </FilamentScene>
  );
}

/** Theme-driven, mirroring play.tsx: shared HUD elements copy the game screen's themed styles so the two HUDs look identical. */
const makeStyles = (t: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: SCENE_BACKGROUND },
    rootDark: { backgroundColor: "#17140f" },
    sceneWrap: { ...StyleSheet.absoluteFillObject },
    sceneTarget: { flex: 1 },
    assemblyTarget: {
      position: "absolute",
      left: "22%",
      top: "24%",
      width: "50%",
      height: "52%",
    },
    chrome: { position: "absolute" },
    // The pill itself is the shared ObjectiveBar (ui/ObjectiveBar); this just centres it, as in play.tsx.
    objectiveWrap: { position: "absolute", top: 10, alignSelf: "center" },
    // Beside the gear on play.tsx's 36px grid: gear 36 wide at left:14, +8 gap → 58 (HintButton owns the square sizing).
    hintButton: { position: "absolute", left: 58, top: 8 },
    joystickZone: { position: "absolute", left: 14, bottom: 16 },
    partsTrayTarget: {
      position: "absolute",
      right: 10,
      top: 70,
      bottom: 70,
      width: 124,
    },
    toolbarTarget: {
      position: "absolute",
      alignSelf: "center",
      bottom: 16,
      width: 118,
      height: 48,
    },
    toolTarget: {
      position: "absolute",
      right: 150,
      bottom: 28,
      width: 140,
      height: 160,
    },
    undoTarget: {
      position: "absolute",
      top: 54,
      left: 14,
      width: 92,
      height: 36,
    },
    settingsTarget: {
      position: "absolute",
      top: 8,
      left: 92,
      width: 42,
      height: 36,
    },
    recenterButton: { position: "absolute", left: 14, top: 102 },
  });
