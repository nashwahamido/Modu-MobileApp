// TODO: settle down the part marked as dev-setting (float mode vs auto return)

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { OrientationLock } from "expo-screen-orientation";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useHudInsets } from '@/src/hooks/use-safe-insets';
import { FilamentScene } from "react-native-filament";

import { AssemblyScene } from "@/src/game/scene/AssemblyScene";
import { useAssemblyDrivers } from "@/src/game/scene/useAssemblyDrivers";
import { useSceneState } from "@/src/game/scene/useSceneState";

//Input Controls
import { Joystick } from "@/src/game/input/camera/Joystick";
import { useOrbitCamera } from "@/src/game/input/camera/useOrbitCamera";
import { useAssemblySfx } from "@/src/game/audio/useAssemblySfx";
import { usePartDrag } from "@/src/game/input/drag/usePartDrag";
import { BeatControl } from "@/src/game/input/slide/BeatControl";
import { TapControl } from "@/src/game/input/pad/TapControl";
import { TightenControl } from "@/src/game/input/dial/TightenControl";
import { RotateControl } from "@/src/game/input/dial/RotateControl";
import { SlideControl } from "@/src/game/input/slide/SlideControl";
import { PressControl } from "@/src/game/input/pad/PressControl";
import { HookPressControl } from "@/src/game/input/slide/HookPressControl";
import { ScrewControl } from "@/src/game/input/dial/ScrewControl";
import { InsertPressControl } from "@/src/game/input/pad/InsertPressControl";
import { DrawTurnControl } from "@/src/game/input/dial/DrawTurnControl";
import { SeatSlideControl } from "@/src/game/input/slide/SeatSlideControl";
import { PushTestControl } from "@/src/game/input/slide/PushTestControl";
import { clusterSink } from "@/src/game/scene/combineDriver";
import { ToolBar } from "@/src/game/ui/hud/ToolBar";
import { ToolboxCoach } from "@/src/game/ui/hud/ToolboxCoach";
import { useStepObjective } from "@/src/game/core/presentation/useStepObjective";
import {
  pressParkInfo,
  screwParkOffset,
  slideParkInfo,
} from "@/src/game/core/evaluation/engagement";

import { useGameStore } from "@/src/game/core/store";
import { useBuildPersistence } from "@/src/hooks/useBuildPersistence";
import { asFurnitureId } from "@/src/game/core/ids";

import { isBundled, loadFurnitureById } from "@/src/game/content/furnitures/furnitures";
// RECIPE LANE — held back from this commit along with src/game/recipe/ and src/game/content/loadFurniture.ts. Three blocks in this file are commented out under this marker; restore all three together with those modules, and nothing else in the app touches them.
// import { loadPlayableFurniture } from "@/src/game/content/loadFurniture";
// import { useCatalogRow, useCatalogStore } from "@/src/data/catalog/buildStore";

// UI Elemets
import { BuildComplete } from "@/src/game/ui/celebration/BuildComplete";
import { FinishBuildButton } from "@/src/game/ui/hud/FinishBuildButton";
import { GreenFlash } from "@/src/game/ui/feedback/GreenFlash";
import { HintToast } from "@/src/game/ui/feedback/HintToast";
import { SpotOrbitCue } from "@/src/game/ui/feedback/SpotOrbitCue";
import { CenterDropRing } from "@/src/game/ui/feedback/CenterDropRing";
import { FitChip } from "@/src/game/ui/feedback/FitChip";
import { PartsTray } from "@/src/game/ui/hud/PartsTray";
import { ClusterTray } from "@/src/game/ui/hud/ClusterTray";
import { ClusterCelebration } from "@/src/game/ui/celebration/ClusterCelebration";
import { UndoButton } from "@/src/game/ui/hud/UndoButton";
import { GameSettings } from "@/src/game/ui/settings/GameSettings";
import { ToggleChips } from "@/src/game/ui/hud/ToggleChips";
import { BuildMap, MapButton } from "@/src/game/ui/hud/ClusterFocusControl";
import { useScreenOrientationLock } from "@/src/hooks/use-screen-orientation-lock";
import { Button } from "@/src/game/ui/system/Button";
import { ObjectiveBar } from "@/src/game/ui/hud/ObjectiveBar";
import {
  HintButton,
  RecenterButton,
  hudControlStyles as hudControls,
  hudChrome as styles,
} from "@/src/game/ui/hud/hudChrome";
import { ThemeScope, useTheme } from "@/src/game/ui/system/theme";
import {
  combineReady,
  requiresClusterFocus,
} from "@/src/game/core/evaluation/clusters";
import { availableInMode } from "@/src/game/core/evaluation/availability";
import type { FurnitureId, ThemeId } from "@/src/game/core/type";
import { LoadingOverlay } from "@/src/game/ui/loading/LoadingOverlay";
import type { Milestone } from "@/src/game/ui/loading/loadingProgress";
import { SceneBackdrop } from "@/src/game/ui/backdrop/SceneBackdrop";
import { backdropSource } from "@/src/game/ui/backdrop/backdrops";
import { setMusicEnabled, setMusicVolume, stopMusic } from "@/src/game/audio/music";

// Dev
import { DevAutoStep } from "@/src/dev/DevAutoStep";
import { DevMenu } from "@/src/dev/DevMenu";

/** How long the Spot marker pulses before putting itself out. Long enough to find with the eye,
 *  short enough that it never becomes part of the scene's furniture. */
const SPOT_MS = 2800;

function GameScreen() {
  useScreenOrientationLock(OrientationLock.LANDSCAPE);
  const hud = useHudInsets();
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
    panShared,
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

  // The route id is only trusted once it resolves to something playable, which without the recipe lane means a BUNDLED id and nothing else. Anything unrecognised falls back to the same default bundled furniture as before.
  const requestedId = (id as FurnitureId | undefined) ?? asFurnitureId("dalfred-stool");
  const target: FurnitureId = isBundled(requestedId) ? requestedId : asFurnitureId("dalfred-stool");
  // RECIPE LANE — with cloud recipes in play, a catalog row pointing at an assembly build is playable too, so an unrecognised id is no longer the only route to the fallback: a cloud id whose row has not synced yet takes it as well.
  // const requestedRow = useCatalogRow(requestedId);
  // const target: FurnitureId =
  //   isBundled(requestedId) || requestedRow?.assemblyModel ? requestedId : asFurnitureId("dalfred-stool");
  // Autosave progress and resume it next time this furniture is opened (through the repo seam).
  useBuildPersistence(target);
  useEffect(() => {
    // Bail before touching any state when the store already holds this target, ahead of the three setters rather than after them: re-running this effect on an already-loaded furniture used to raise the loading overlay and then never lower it, because nothing downstream fires when there is no load to finish.
    if (useGameStore.getState().furniture?.meta.id === target) return;
    setModelReady(false);
    setLoadError(false);
    setLoaderVisible(true);
    loadFurnitureById(target)
      .then((f) => useGameStore.getState().loadFurniture(f))
      .catch(() => setLoadError(true));
    // RECIPE LANE — the row is read here IMPERATIVELY off useCatalogStore.getState() rather than through the useCatalogRow hook, and that is the whole point: it keeps this effect's deps free of the row's object identity, which changes on every catalog refresh/auth event and would otherwise re-run the effect after a completed load and strand the overlay. Keep the early bail above when restoring.
    // const row = useCatalogStore.getState().rows[target];
    // loadPlayableFurniture(target, row)
    //   .then((result) => {
    //     if (result.ok) useGameStore.getState().loadFurniture(result.furniture);
    //     else setLoadError(true);
    //   })
    //   .catch(() => setLoadError(true));
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
  // The music is the BUILD's, so it starts here and stops on the way out — including when the app is
  // backgrounded, which unmounts nothing but should not leave a loop playing under someone's podcast.
  const musicOn = settings.music;
  const musicVolume = settings.musicVolume;
  useEffect(() => {
    // Volume BEFORE enable, so the first bar plays at the level the player set rather than at the
    // module default and then correcting itself.
    setMusicVolume(musicVolume);
    setMusicEnabled(musicOn);
    return () => stopMusic();
  }, [musicOn, musicVolume]);

  // Dev-setting: float mode vs auto return
  const heldActionId = useGameStore((s) => s.heldActionId);
  const renderStyle = useGameStore((s) => s.renderStyle);
  const backdrop = useGameStore((s) => s.backdrop);
  // The BUILD's theme, not the app's: "Assemble in Dark Mode" darkens this screen only. Everything
  // under ThemeScope below (the HUD, the settings panel, the toasts) resolves through it.
  const theme: ThemeId = useGameStore((s) => s.assembleDark) ? "dark" : "light";
  const focus = settings.focusMode;
  const dark = theme === "dark";
  const t = useTheme();
  // "Clear" is a flat warm cream, not the theme surface: the backdrop SETTING chose a colour, so it
  // should look chosen, not like the app behind the scene. Dark theme keeps its own dark ground —
  // a cream flood in dark mode would be a torch.
  const rootStyle = useMemo(
    () => [
      styles.root,
      // "Clear" is the SAME flat beige in both themes. It is a backdrop the player picked, not a
      // surface that follows the theme — and the dark variant read as mud against the dark chrome.
      { backgroundColor: backdrop === "clear" ? "#DACAAE" : t.bg },
    ],
    [t, backdrop, theme],
  );
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

  // Recenter re-frames the camera on the build, on an empty canvas it just jumps the view for no visible reason. `modes` is the honest source — "hidden" is a part still in the tray socket_hint is only a ghost preview of where a held part will go, not a part on the canvas.
  const sceneHasParts = Object.values(sceneState.modes).some(
    (m) => m !== "hidden" && m !== "socket_hint",
  );

  // Gated on the existing accessibility flag, so a profile that asks for a quiet build gets one.
  useAssemblySfx(settings.soundEffects);
  const hintGroup = useGameStore((s) => s.hintGroup);
  const hintPulse = useGameStore((s) => s.hintPulse);
  // The Spot marker is a ONE-SHOT: it pulses for a few seconds and puts itself out. Keyed on hintPulse as well as the part, so pressing Spot twice for the same part restarts the window rather than being swallowed as "no change".
  const spotPartId = useGameStore((s) => s.hintPartId);
  useEffect(() => {
    if (!spotPartId) return;
    const t = setTimeout(() => useGameStore.getState().clearSpot(), SPOT_MS);
    return () => clearTimeout(t);
  }, [spotPartId, hintPulse]);

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

  // Canvas strafe when NOTHING is held — one-finger drag pans the camera (always on, no toggle). While a part IS held, the canvas gesture from usePartDrag owns the finger and routes: floating part → re-grab, else → these same strafe callbacks. strafing guards onFinalize: a Pan that FAILS (lost the race) still finalizes, and that must not fire a spurious onPanEnd.
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

  if (!furniture) return <ThemeScope value={theme}><View style={rootStyle}>{loadingOverlay}</View></ThemeScope>;

  return (
    <ThemeScope value={theme}>
    <SceneBackdrop
      source={backdropSource(backdrop, theme === "dark")}
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
            panShared={panShared}
            onModelReady={() => setModelReady(true)}
          />
        </View>
      </GestureDetector>
      <View
        style={[
          styles.chrome,
          {
            top: hud.top,
            // The app runs immersive (status + nav bars hidden in _layout), and Android reports ZERO insets once those bars are gone — even though the display cutout is still physically there. So the side margin cannot come from the inset alone: HUD_SIDE_MARGIN is the floor that actually clears a landscape cutout, and max() still honours a larger inset if a device reports one.
            left: hud.left,
            right: hud.right,
            bottom: hud.bottom,
          },
        ]}
        pointerEvents="box-none"
      >
        {/* Pause is gone: it was a second door to the same map the Map button opens, and a control
            named "pause" that actually navigates was the wrong promise anyway. */}
        <View style={styles.topRow} pointerEvents="box-none">
          {/* Instructions hidden → only the progress bar stays (slim pill). */}
          <ObjectiveBar
            // The sentence only. The step count rides on the progress row inside the bar — keeping it out of here is what stops the line's length changing with the count.
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
        {/* Only speaks when Spot is running and its target is somewhere the player cannot see. */}
        <SpotOrbitCue manipulator={manipulator} />
        {/* Focus mode clears the workbench: everything below is chrome the task doesn't
            need. What survives is the shortlist — joystick, the next part (PartsTray), the
            progress bar, Settings, and the Focus toggle itself, since hiding it would trap
            the player in focus mode. Undo and Recenter ALSO survive: mistake recovery and
            re-framing the build are part of the task, not chrome — clearPath pins focus
            mode on, and stripping those two left its players with no way back from an
            error. */}
        <UndoButton />
        <GameSettings />
        <View style={styles.togglesRow}>
          {focus ? null : (
            <DevAutoStep heldDriver={heldDriver} sinkDriver={sinkDriver} />
          )}
          {focus ? null : <DevMenu />}
          <ToggleChips />
        </View>
        {/* One Map button where the cluster discs were. Same visibility rule they had: hidden in
            focus mode and in strict, where the step is chosen for you. */}
        {!focus && mode !== "strict" ? <MapButton /> : null}
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
        {/* First build that actually asks for a tool. LACK is hand-tightened, so the tutorial never
            covers this and EKET is where a player meets it cold. */}
        <ToolboxCoach neededTool={neededTool} />
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
        <RecenterButton
          enabled={sceneHasParts}
          onPress={resetCamera}
          style={hudControls.recenterButton}
        />

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
    </ThemeScope>
  );
}

export default function PlayRoute() {
  return (
    <FilamentScene>
      <GameScreen />
    </FilamentScene>
  );
}