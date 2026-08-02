// TODO: settle down the part marked as dev-setting (float mode vs auto return)

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { OrientationLock } from "expo-screen-orientation";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HUD_SIDE_MARGIN, HUD_VERTICAL_MARGIN } from "@/src/hooks/use-safe-insets";
import { FilamentScene } from "react-native-filament";

import { AssemblyScene } from "@/src/game/scene/AssemblyScene";
import { useAssemblyDrivers } from "@/src/game/scene/useAssemblyDrivers";
import { useSceneState } from "@/src/game/scene/useSceneState";

//Input Controls
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
import {
  pressParkInfo,
  screwParkOffset,
  slideParkInfo,
} from "@/src/game/core/evaluation/engagement";

import { useGameStore } from "@/src/game/core/store";
import { useBuildPersistence } from "@/src/hooks/useBuildPersistence";

import {
  isPlayable,
  loadFurnitureById,
} from "@/src/game/content/furnitures/furnitures";

// UI Elemets
import { BuildComplete } from "@/src/game/ui/BuildComplete";
import { FinishBuildButton } from "@/src/game/ui/FinishBuildButton";
import { GreenFlash } from "@/src/game/ui/GreenFlash";
import { HintToast } from "@/src/game/ui/HintToast";
import { CenterDropRing } from "@/src/game/ui/CenterDropRing";
import { FitChip } from "@/src/game/ui/FitChip";
import { PartsTray } from "@/src/game/ui/PartsTray";
import { ClusterTray } from "@/src/game/ui/ClusterTray";
import { ClusterCelebration } from "@/src/game/ui/ClusterCelebration";
import { UndoButton } from "@/src/game/ui/UndoButton";
import { GameSettings } from "@/src/game/ui/GameSettings";
import { ToggleChips } from "@/src/game/ui/ToggleChips";
import { BuildMap, ClusterFocusControl } from "@/src/game/ui/ClusterFocusControl";
import { useScreenOrientationLock } from "@/src/hooks/use-screen-orientation-lock";
import { Button } from "@/src/game/ui/Button";
import { ObjectiveBar } from "@/src/game/ui/ObjectiveBar";
import {
  HintButton,
  HUD_ICON,
  IconButtonBare,
  RecenterButton,
  hudControlStyles as hudControls,
  hudChrome as styles,
} from "@/src/game/ui/hudChrome";
import { useTheme } from "@/src/game/ui/theme";
import {
  combineReady,
  requiresClusterFocus,
} from "@/src/game/core/evaluation/clusters";
import { availableInMode } from "@/src/game/core/evaluation/availability";
import type { FurnitureId } from "@/src/game/core/type";
import { LoadingOverlay } from "@/src/game/ui/LoadingOverlay";
import type { Milestone } from "@/src/game/ui/loadingProgress";
import { SceneBackdrop } from "@/src/game/ui/SceneBackdrop";

// Dev
import { DevAutoStep } from "@/src/dev/DevAutoStep";
import { DevMenu } from "@/src/dev/DevMenu";

function GameScreen() {
  useScreenOrientationLock(OrientationLock.LANDSCAPE);
  const insets = useSafeAreaInsets();

  const lastScale = useRef(1);
  const sceneState = useSceneState();
  const {
    heldDriver,
    sinkDriver,
    clusterDriver,
    pushDrivers,
    slideDriver,
    carryShared,
    stickShared,
  } = useAssemblyDrivers();
  const {
    manipulator,
    stickActive,
    onStickStart,
    onStickMove,
    onStickEnd,
    onZoomDelta,
    onPanStart,
    onPanMove,
    onPanEnd,
    resetCamera,
    getFocusPoint,
  } = useOrbitCamera({ stickShared });

  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  // Loading screen: covers the scene from target change until data + model are ready. retryKey remounts AssemblyScene to restart a failed GLB load.
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

  //Loading err handling: RNF's useModel has NO error state — a failed GLB just stays "loading" forever — so a stuck model is only detectable by time. 45 s is generous for the 66 MB EKET streaming from Metro in dev.
  useEffect(() => {
    if (!loaderVisible || loadError || modelReady) return;
    const watchdog = setTimeout(() => setLoadError(true), 45000);
    return () => clearTimeout(watchdog);
  }, [loaderVisible, loadError, modelReady, retryKey]);
  // Subscribe to `completed` by REFERENCE and derive from it off the hot path:
  // setDragFit writes on every drag frame.
  const completed = useGameStore((s) => s.completed);
  const completedSet = useMemo(() => new Set(completed), [completed]);
  const activeCluster = useGameStore((s) => s.activeCluster);
  const mode = useGameStore((s) => s.mode);
  const settings = useGameStore((s) => s.settings);

  // Dev-setting: float mode vs auto return
  const heldActionId = useGameStore((s) => s.heldActionId);
  const renderStyle = useGameStore((s) => s.renderStyle);
  const backdrop = useGameStore((s) => s.backdrop);
  const theme = useGameStore((s) => s.theme);
  const focus = settings.focusMode;
  const dark = theme === "dark";
  const t = useTheme();
  const rootStyle = useMemo(() => [styles.root, { backgroundColor: t.bg }], [t]);
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
  // which telescoping level the active beat tests, when it's one of the authored drag-out-to-test beats
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

  // Recenter re-frames the camera on the build, on an empty canvas it just jumps the view for no visible reason.
  // `modes` is the honest source — "hidden" is a part still in the tray
  // socket_hint is only a ghost preview of where a held part will go, not a part on the canvas.
  const sceneHasParts = Object.values(sceneState.modes).some(
    (m) => m !== "hidden" && m !== "socket_hint",
  );

  const hintGroup = useGameStore((s) => s.hintGroup);
  const hintPulse = useGameStore((s) => s.hintPulse);

  // select tool
  const selectedTool = useGameStore((s) => s.selectedTool);
  const rawTool = sceneState.activeTighten?.tool ?? driveAction?.tool ?? null;
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

  // Canvas strafe when NOTHING is held — one-finger drag pans the camera (always on, no toggle). While a part IS held, the canvas gesture from usePartDrag owns the finger and routes: floating part → re-grab, else → these same strafe callbacks.
  // strafing guards onFinalize: a Pan that FAILS (lost the race) still finalizes, and that must not fire a spurious onPanEnd.
  const strafing = useRef(false);
  const strafePan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .maxPointers(1)
        .activeOffsetX([-12, 12])
        .activeOffsetY([-12, 12])
        .onStart((e) => {
          strafing.current = true;
          onPanStart(e.x, e.y);
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

  // Composition identity changes ONLY when the held action changes (touch-free moments), never on ordinary re-renders. The one-finger canvas gesture is always live: held → usePartDrag's canvas gesture (re-grab or strafe fallback), empty scene → strafePan.
  const heldAction = sceneState.heldAction;
  const sceneGesture = useMemo(() => {
    if (heldAction) {
      return Gesture.Race(pinch, pan, canvasGestureFor(heldAction));
    }
    return Gesture.Race(pinch, pan, strafePan);
  }, [heldAction, pinch, pan, strafePan, canvasGestureFor]);

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

  if (!furniture) return <View style={rootStyle}>{loadingOverlay}</View>;

  return (
    <SceneBackdrop
      backdrop={backdrop}
      dark={theme === "dark"}
      style={rootStyle}
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
            stickShared={stickShared}
            stickActive={stickActive}
            onModelReady={() => setModelReady(true)}
          />
        </View>
      </GestureDetector>
      <View
        style={[
          styles.chrome,
          {
            top: Math.max(insets.top, HUD_VERTICAL_MARGIN),
            // The app runs immersive (status + nav bars hidden in _layout), and Android reports ZERO insets once those bars are gone — even though the display cutout is still physically there. So the side margin cannot come from the inset alone: HUD_SIDE_MARGIN is the floor that actually clears a landscape cutout, and max() still honours a larger inset if a device reports one.
            left: Math.max(insets.left, HUD_SIDE_MARGIN),
            right: Math.max(insets.right, HUD_SIDE_MARGIN),
            bottom: Math.max(insets.bottom, HUD_VERTICAL_MARGIN),
          },
        ]}
        pointerEvents="box-none"
      >
        {/* Pause sits to the LEFT of the progress bar, grouped with it so the pair stays
            centred together whatever width the bar takes. */}
        <View style={styles.topRow} pointerEvents="box-none">
          <IconButtonBare
            source={require("@/src/assets/ui/icons/icon-pause.png")}
            size={HUD_ICON}
            onPress={() => useGameStore.getState().setMapOpen(true)}
            accessibilityLabel="Pause and show the build map"
          />
          {/* Instructions hidden → only the progress bar stays (slim pill). */}
          <ObjectiveBar
            // The sentence only. The step count rides on the progress row inside the bar — keeping it
            // out of here is what stops the line's length changing with the count.
            line={settings.showInstructions ? objective : null}
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
            style={hudControls.hintButton}
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
            style={hudControls.recenterButton}
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
      <FinishBuildButton />
      <BuildComplete />
      {loadingOverlay}
    </SceneBackdrop>
  );
}

export default function PlayRoute() {
  return (
    <FilamentScene>
      <GameScreen />
    </FilamentScene>
  );
}