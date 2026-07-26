// TODO: settle down the part marked as dev-setting (float mode vs auto return)

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { OrientationLock } from "expo-screen-orientation";
import { ImageBackground, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FilamentScene } from "react-native-filament";

import { AssemblyScene } from "@/src/game/scene/AssemblyScene";
import { useAssemblyDrivers } from "@/src/game/scene/useAssemblyDrivers";
import { useSceneState } from "@/src/game/scene/useSceneState";

import { Joystick } from "@/src/game/input/Joystick";
import { useOrbitCamera } from "@/src/game/input/useOrbitCamera";
import { usePartDrag } from "@/src/game/input/usePartDrag";
import { BeatControl } from "@/src/game/input/BeatControl";
import { TapControl } from "@/src/game/input/TapControl";
import { TightenControl } from "@/src/game/input/TightenControl";
import { RotateControl } from "@/src/game/input/RotateControl";
import { SlideControl } from "@/src/game/input/SlideControl";
import { PressControl } from "@/src/game/input/PressControl";
import { HookPressControl } from "@/src/game/input/HookPressControl";
import { ScrewControl } from "@/src/game/input/ScrewControl";
import { InsertPressControl } from "@/src/game/input/InsertPressControl";
import { DrawTurnControl } from "@/src/game/input/DrawTurnControl";
import { SeatSlideControl } from "@/src/game/input/SeatSlideControl";
import { PushTestControl } from "@/src/game/input/PushTestControl";
import { clusterSink } from "@/src/game/scene/combineDriver";
import { ToolBar } from "@/src/game/ui/ToolBar";
import { useStepObjective } from "@/src/game/core/presentation/useStepObjective";

import { useGameStore } from "@/src/game/core/store";
import { useBuildPersistence } from "@/src/hooks/useBuildPersistence";
import {
  pressParkInfo,
  screwParkOffset,
  slideParkInfo,
} from "@/src/game/core/evaluation/engagement";
import {
  isPlayable,
  loadFurnitureById,
} from "@/src/game/content/furnitures/furnitures";

import { BuildComplete } from "@/src/game/ui/BuildComplete";
import { GreenFlash } from "@/src/game/ui/GreenFlash";
import { HintToast } from "@/src/game/ui/HintToast";
import { CenterDropRing } from "@/src/game/ui/CenterDropRing";
import { FitChip } from "@/src/game/ui/FitChip";
import { PartsTray } from "@/src/game/ui/PartsTray";
import { ClusterTray } from "@/src/game/ui/ClusterTray";
import { ClusterCelebration } from "@/src/game/ui/ClusterCelebration";
import { UndoButton } from "@/src/game/ui/UndoButton";
import { GameSettings } from "@/src/game/ui/GameSettings";
import { DevAutoStep } from "@/src/dev/DevAutoStep";
import { DevMenu } from "@/src/dev/DevMenu";
import { ToggleChips } from "@/src/game/ui/ToggleChips";
import { BuildMap, ClusterFocusControl } from "@/src/game/ui/ClusterFocusControl";
import { useScreenOrientationLock } from "@/src/hooks/use-screen-orientation-lock";
import { Button, IconButton } from "@/src/game/ui/Button";
import { PauseIcon } from "@/src/game/ui/Icons";
import { ObjectiveBar } from "@/src/game/ui/ObjectiveBar";
import { HintButton, RecenterButton } from "@/src/game/ui/HudControls";
import { SPACE, Theme, useTheme } from "@/src/game/ui/theme";
import {
  buildPhase,
  combineReady,
  requiresClusterFocus,
} from "@/src/game/core/evaluation/clusters";
import { availableInMode } from "@/src/game/core/evaluation/availability";
import type { FurnitureId } from "@/src/game/core/type";
import { LoadingOverlay } from "@/src/game/ui/LoadingOverlay";
import type { Milestone } from "@/src/game/ui/loadingProgress";
import { backdropSource } from "@/src/game/ui/backdrops";

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
  const {
    heldDriver,
    sinkDriver,
    clusterDriver,
    pushDrivers,
    slideDriver,
    carryShared,
  } = useAssemblyDrivers();

  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  // Loading overlay state: covers the scene from target change until data + model are ready (spec: 2026-07-18-loading-screen-design.md). retryKey remounts AssemblyScene to restart a failed GLB load.
  const [modelReady, setModelReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loaderVisible, setLoaderVisible] = useState(true);
  const [retryKey, setRetryKey] = useState(0);

  const target: FurnitureId = isPlayable(id as FurnitureId)
    ? (id as FurnitureId)
    : "dalfred-stool";
  // Autosave progress and resume it next time this furniture is opened (through the repo seam).
  useBuildPersistence(target);
  useEffect(() => {
    setModelReady(false);
    setLoadError(false);
    setLoaderVisible(true);
    if (useGameStore.getState().furniture?.meta.id === target) return;
    loadFurnitureById(target)
      .then((f) => {
        useGameStore.getState().loadFurniture(f);
      })
      .catch(() => setLoadError(true));
  }, [target, retryKey]);

  const furniture = useGameStore((s) => s.furniture);
  const furnitureMatches = furniture?.meta.id === target;
  const milestone: Milestone = !furnitureMatches ? 0 : modelReady ? 1 : 0.35;
  // RNF's useModel has NO error state — a failed GLB just stays "loading" forever — so a stuck model is only detectable by time. 45 s is generous for the 66 MB EKET streaming from Metro in dev.
  useEffect(() => {
    if (!loaderVisible || loadError || modelReady) return;
    const watchdog = setTimeout(() => setLoadError(true), 45000);
    return () => clearTimeout(watchdog);
  }, [loaderVisible, loadError, modelReady, retryKey]);
  // The objective bar reports the BUILD MAP's phase (base → seat → combine), not the authored stage number — those count beats across the whole build and would read
  // "Stage 4" on a three-node map.
  // These two derivations walk the whole action graph. Subscribing to `completed` by
  // REFERENCE and deriving in a useMemo keeps them off the hot path: as written inside
  // selectors they re-ran on every store write, including each setDragFit during a drag.
  const completed = useGameStore((s) => s.completed);
  const completedSet = useMemo(() => new Set(completed), [completed]);
  const activeCluster = useGameStore((s) => s.activeCluster);
  const mode = useGameStore((s) => s.mode);
  const stage = useMemo(
    () => (furniture ? buildPhase(furniture, completedSet, activeCluster).index : 1),
    [furniture, completedSet, activeCluster],
  );
  const settings = useGameStore((s) => s.settings);
  // Dev-setting: float mode vs auto return
  const heldActionId = useGameStore((s) => s.heldActionId);
  const renderStyle = useGameStore((s) => s.renderStyle);
  const backdrop = useGameStore((s) => s.backdrop);
  const theme = useGameStore((s) => s.theme);
  const focus = settings.focusMode;
  const dark = theme === "dark";
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const firstAvailable = useMemo(
    () =>
      furniture
        ? availableInMode(furniture, completedSet, mode, activeCluster)[0]?.actionId
        : undefined,
    [furniture, completedSet, mode, activeCluster],
  );
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
      ? (driveKind === "press" ? pressParkInfo : slideParkInfo)(
          furniture,
          driveAction,
          new Set(useGameStore.getState().completed),
        )
      : null;
  // which telescoping level the active beat tests, when it's one of the authored drag-out-to-test beats (spec.testActionIds)
  const pushTestLevel = Object.entries(
    furniture?.pushOpen?.testActionIds ?? {},
  ).find(([, id]) => id === sceneState.activeBeat?.actionId)?.[0];
  // a combine drive moves the whole cluster, not the held part — one rigid body on the shared ClusterDriver (runners stay put during a combine; they only telescope in the test beats)
  const combineDriveSink = useMemo(() => {
    if (!furniture || driveAction?.type !== "combineClusters") return null;
    return clusterSink(clusterDriver);
  }, [furniture, driveAction, clusterDriver]);
  const needsFocusChoice =
    mode !== "strict" &&
    !!furniture &&
    requiresClusterFocus(furniture) &&
    !activeCluster &&
    // once every cluster is built, no focus means the combine stage, not an unanswered chooser
    !combineReady(furniture, new Set(useGameStore.getState().completed));
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

  // Recenter re-frames the camera on the build, so it means nothing until there IS a build:
  // on an empty canvas it just jumps the view for no visible reason. `modes` is the honest
  // source — "hidden" is a part still in the tray, and socket_hint is only a ghost preview
  // of where a held part will go, not a part on the canvas.
  const sceneHasParts = Object.values(sceneState.modes).some(
    (m) => m !== "hidden" && m !== "socket_hint",
  );

  const hintGroup = useGameStore((s) => s.hintGroup);
  const hintPulse = useGameStore((s) => s.hintPulse);

  const selectedTool = useGameStore((s) => s.selectedTool);
  const rawTool = sceneState.activeTighten?.tool ?? driveAction?.tool ?? null;
  // "hand" is not equippable, so it is not NEEDED — otherwise the step would sit there
  // waiting for a tool the player has no way to pick up.
  const neededTool =
    settings.manualTools && rawTool !== "hand" ? rawTool : null;
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

  const { gestureFor, canvasGestureFor, clusterGestureFor, ringOverlay } =
    usePartDrag({
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
  }, [
    heldAction,
    floatOn,
    canvasStrafeOn,
    pinch,
    pan,
    strafePan,
    canvasGestureFor,
  ]);

  // The overlay must cover BOTH returns: the furniture-null early return IS the data-loading window it exists for.
  const loadingOverlay = loaderVisible ? (
    <LoadingOverlay
      key={retryKey}
      milestone={milestone}
      error={loadError}
      onRetry={() => {
        setLoadError(false);
        setModelReady(false);
        setRetryKey((k) => k + 1);
      }}
      onBack={() => router.back()}
      onFadedOut={() => setLoaderVisible(false)}
    />
  ) : null;

  if (!furniture) return <View style={styles.root}>{loadingOverlay}</View>;

  return (
    <ImageBackground
      // Focus Mode renders its backdrop this way (ImageBackground as the root).
      // A separate <Image style={absoluteFill}> here scaled the artwork
      // differently for the same file, so mirror the working structure exactly.
      // "clear": no source — the milk-white root (SCENE_BACKGROUND) / dark root shows through.
      source={backdropSource(backdrop, theme === "dark")}
      resizeMode="cover"
      style={styles.root}
    >
      <GestureDetector gesture={sceneGesture}>
        <View style={styles.sceneWrap}>
          <AssemblyScene
            key={`${renderStyle}:${retryKey}`}
            cameraManipulator={manipulator}
            sceneState={sceneState}
            heldDriver={heldDriver}
            sinkDriver={sinkDriver}
            clusterDriver={clusterDriver}
            pushDrivers={pushDrivers}
            slideDriver={slideDriver}
            carryShared={carryShared}
            onModelReady={() => setModelReady(true)}
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
        {/* Pause sits to the LEFT of the progress bar, grouped with it so the pair stays
            centred together whatever width the bar takes. */}
        <View style={styles.topRow} pointerEvents="box-none">
          <IconButton
            icon={<PauseIcon size={18} color={t.text} />}
            onPress={() => useGameStore.getState().setMapOpen(true)}
            small
            accessibilityLabel="Pause and show the build map"
          />
          {/* Instructions hidden → only the progress bar stays (slim pill). */}
          <ObjectiveBar
            line={
              settings.showInstructions
                ? `Stage ${stage} · ${objective} · ${completedCount}/${totalCount}`
                : null
            }
            fontSize={objectiveFontSize}
            value={completedCount}
            total={totalCount}
            xp={completedCount * furniture.xpPerStep}
          />
        </View>
        <CenterDropRing />
        <FitChip />
        <HintToast />
        {/* Focus mode clears the workbench: everything below is chrome the task doesn't
            need. What survives is the shortlist — joystick, the next part (PartsTray), the
            progress bar, and Settings — plus the Focus toggle itself, since hiding it would
            trap the player in focus mode. */}
        {focus ? null : <UndoButton />}
        <GameSettings />
        <View style={styles.togglesRow}>
          {focus ? null : (
            <DevAutoStep heldDriver={heldDriver} sinkDriver={sinkDriver} />
          )}
          {focus ? null : <DevMenu />}
          <ToggleChips />
        </View>
        {!focus && mode !== "strict" ? <ClusterFocusControl /> : null}
        <PartsTray
          items={sceneState.trayItems}
          gestureFor={gestureFor}
          thumbs={furniture.thumbs}
          highlightGroup={hintGroup}
          highlightPulse={hintPulse}
          header={
            focus ? undefined : (
              <ClusterTray
                clusterDriver={clusterDriver}
                clusterGestureFor={clusterGestureFor}
              />
            )
          }
        />
        <ToolBar neededTool={neededTool} />
        {mode === "free" && !focus ? (
          <HintButton
            style={styles.hintButton}
            onPress={() => useGameStore.getState().suggestNext()}
          />
        ) : null}
        {sceneState.activeTighten && toolReady ? (
          sceneState.activeTighten.tool === "mallet" ||
          sceneState.activeTighten.motion === "strike" ||
          sceneState.activeTighten.motion === "press" ? (
            <TapControl
              action={sceneState.activeTighten}
              sinkDriver={sinkDriver}
            />
          ) : sceneState.activeTighten.motion === "drawTurn" ? (
            <DrawTurnControl
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
        {sceneState.activeInsertPress && !sceneState.activeTighten ? (
          <InsertPressControl
            action={sceneState.activeInsertPress}
            sinkDriver={sinkDriver}
          />
        ) : null}
        {sceneState.stagedSeat &&
        sceneState.stagedSeat.partId &&
        furniture.parts[sceneState.stagedSeat.partId]?.stageOffset ? (
          <SeatSlideControl
            action={sceneState.stagedSeat}
            offset={furniture.parts[sceneState.stagedSeat.partId]!.stageOffset!}
            heldDriver={heldDriver}
            slideDriver={slideDriver}
          />
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
            driver={combineDriveSink ?? heldDriver}
            park={drivePark}
          />
        ) : null}
        {driveAction && driveKind === "press" && toolReady ? (
          drivePark?.lock ? (
            <HookPressControl
              action={driveAction}
              driver={heldDriver}
              park={drivePark}
            />
          ) : (
            <PressControl
              action={driveAction}
              driver={heldDriver}
              park={drivePark}
            />
          )
        ) : null}
        {driveAction && driveKind === "screw" && drivePark && toolReady ? (
          <ScrewControl
            action={driveAction}
            driver={clusterDriver}
            park={drivePark}
          />
        ) : null}
        {sceneState.activeBeat &&
        sceneState.activeBeat.type !== "combineClusters" &&
        !sceneState.activeTighten &&
        !orientationAction &&
        !driveAction ? (
          furniture.pushOpen && pushTestLevel ? (
            <PushTestControl
              key={sceneState.activeBeat.actionId}
              action={sceneState.activeBeat}
              spec={furniture.pushOpen}
              level={pushTestLevel}
              pushDrivers={pushDrivers}
            />
          ) : (
            <BeatControl
              action={sceneState.activeBeat}
              pushDrivers={pushDrivers}
            />
          )
        ) : null}
        <View style={styles.joystickZone}>
          <Joystick
            onStart={onStickStart}
            onMove={onStickMove}
            onEnd={onStickEnd}
            dark={dark}
          />
        </View>
        {focus ? null : (
          <RecenterButton
            enabled={sceneHasParts}
            onPress={resetCamera}
            style={styles.recenterButton}
          />
        )}

        {heldActionId && settings.releaseBehavior === "float" ? (
          // Float mode: a released part stays where it was set down; this is the way back to the tray. (In autoReturn mode a miss returns by itself.)
          <Button
            label="↩ Put back"
            small
            variant="primary"
            style={styles.putBackButton}
            onPress={() => useGameStore.getState().cancelHeld()}
          />
        ) : null}
      </View>
      {/* OUTSIDE the inset `chrome` container, with the other full-screen overlays. Inside
          it, the map's scrim could only dim the chrome's own bounds — which left a lighter
          rectangle of undimmed scene around the edges. */}
      {/* Strict mode never offered the chooser, so it does not get the map either. Focus
          mode DOES: pause is reachable there, and the map is what pause opens. */}
      {mode !== "strict" ? <BuildMap /> : null}
      {ringOverlay}
      <GreenFlash trigger={completedCount} />
      <ClusterCelebration />
      <BuildComplete />
      {loadingOverlay}
    </ImageBackground>
  );
}

export default function PlayRoute() {
  return (
    <FilamentScene>
      <GameScreen />
    </FilamentScene>
  );
}

/** Theme-driven: every colour comes from ui/theme.ts, so the HUD follows the palette and
 *  the hand-rolled `…Dark` variants that used to shadow every rule are gone. */
const makeStyles = (t: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    sceneWrap: { ...StyleSheet.absoluteFillObject },
    chrome: { position: "absolute" },

    // The row owns the position now; the bar is just a flex child of it.
    topRow: {
      position: "absolute",
      top: 10,
      alignSelf: "center",
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.sm,
    },
    // The bar itself (pill + XP row) is the shared ObjectiveBar component (ui/ObjectiveBar).

    // Row 1, beside the gear: the gear is 36 wide at left:14, +8 gap → 58 (HintButton owns the square sizing).
    hintButton: { position: "absolute", left: 58, top: 8 },
    // Its own row, directly under undo (top:54 + 36 + 12 gap). Icon-only, so it is the same
    // 36x36 square as everything else in the column rather than a wide text pill.
    recenterButton: { position: "absolute", left: 14, top: 102 },

    // The way back to the tray in float mode. PRIMARY: while a part is in the air, this is
    // the one thing the player might need, so it is the one thing that carries the accent.
    // Below Recenter. Only visible in float mode, while a part is in the air.
    putBackButton: { position: "absolute", left: 14, top: 150 },

    // Left edge aligned with Recenter and the gear (all left:14); bottom aligned with the
    // toolbar row (bottom:16) so the left column and the bottom row share their corner.
    joystickZone: { position: "absolute", left: 14, bottom: 16 },
    togglesRow: {
      position: "absolute",
      right: 14,
      bottom: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.sm,
      zIndex: 15,
    },
  });