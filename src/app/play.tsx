// TODO: settle down the part marked as dev-setting (float mode vs auto return)

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { OrientationLock } from "expo-screen-orientation";
import { ImageBackground, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FilamentScene } from "react-native-filament";

import { AssemblyScene } from "@/src/game/scene/AssemblyScene";
import {
  createClusterDriver,
  createDriverRegistry,
  createOffsetDriver,
} from "@/src/game/scene/offsetDriver";
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
import { Button, ProgressBar } from "@/src/game/ui/Button";
import { ELEVATION, RADIUS, SPACE, Theme, TYPE, useTheme } from "@/src/game/ui/theme";
import {
  currentStageForClusterFocus,
  requiresClusterFocus,
} from "@/src/game/core/evaluation/clusters";
import { availableInMode } from "@/src/game/core/evaluation/availability";
import type { FurnitureId } from "@/src/game/core/type";
import { LoadingOverlay } from "@/src/game/ui/LoadingOverlay";
import type { Milestone } from "@/src/game/ui/loadingProgress";

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
  const pushDrivers = useRef(createDriverRegistry()).current;
  const slideDriver = useRef(createClusterDriver()).current;

  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  // Loading overlay state: covers the scene from target change until data + model are ready (spec: 2026-07-18-loading-screen-design.md). retryKey remounts AssemblyScene to restart a failed GLB load.
  const [modelReady, setModelReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loaderVisible, setLoaderVisible] = useState(true);
  const [retryKey, setRetryKey] = useState(0);

  const target: FurnitureId = isPlayable(id as FurnitureId)
    ? (id as FurnitureId)
    : "DALFRED";
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
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
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

  const selectedTool = useGameStore((s) => s.selectedTool);
  const rawTool = sceneState.activeTighten?.tool ?? driveAction?.tool ?? null;
  // "hand" is not equippable, so it is not NEEDED — otherwise the step would sit there
  // waiting for a tool the player has no way to pick up.
  const neededTool = settings.manualTools ? rawTool : null;
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

  const handleModelReady = useCallback(() => setModelReady(true), []);

  const { gestureFor, canvasGestureFor, ringOverlay, stagedGrabGesture } = usePartDrag({
    manipulator,
    heldDriver,
    slideDriver,
    getFocusPoint,
    onPanStart,
    onPanMove,
    onPanEnd,
  });

  // Composition identity changes ONLY when the held action, the canvas toggles, or stagedGrabGesture's own identity change (touch-free moments — usePartDrag recomputes stagedGrabGesture, gated null vs armed, only when the furniture load, the completed set, or the assembly mode changes, never on an ordinary re-render). Canvas gestures are attached ONLY when they can do something — with float and canvas-strafe both off and stagedGrabGesture null, this is byte-identical to the classic pinch + two-finger-pan tree, so a no-op canvas gesture can never win the race and block a pinch (sloppy two-finger starts, zoom mid-drag). This matters for stagedGrabGesture specifically: Gesture.Race resolves at the native ACTIVATION layer before its JS onStart ever runs, so leaving it attached "just in case" and relying on onStart to no-op would have already won the race and dead-legged strafe/pinch on every touch, staged or not — usePartDrag now derives the armed state from stagedGrabCandidates itself (the same predicate the candidate filter uses) so this attach gate can never diverge from it the way the earlier hasStagedOut presence-only gate did.
  const heldAction = sceneState.heldAction;
  const canvasStrafeOn = settings.canvasStrafe;
  const floatOn = settings.releaseBehavior === "float";
  const sceneGesture = useMemo(() => {
    if (heldAction && (floatOn || canvasStrafeOn)) {
      return Gesture.Race(pinch, pan, canvasGestureFor(heldAction));
    }
    if (!heldAction) {
      // Nothing in hand: a long-press may be reaching for a staged sub-assembly resting on the canvas. It RACES the strafe rather than running alongside it — a held-still press is a grab, 12px of movement is a strafe, and only one of those can be what the player meant. stagedGrabGesture arrives already gated null-vs-armed from usePartDrag, so it is spliced in ONLY when non-null, preserving the exact pre-existing tree (Race(pinch, pan, strafePan) / Race(pinch, pan)) the rest of the time — a long-press wins its Race purely on native activation criteria, so attaching it unconditionally and trusting its onStart to no-op would have blocked strafe and pinch on every touch where there was nothing to grab.
      if (!stagedGrabGesture) {
        return canvasStrafeOn
          ? Gesture.Race(pinch, pan, strafePan)
          : Gesture.Race(pinch, pan);
      }
      return canvasStrafeOn
        ? Gesture.Race(pinch, pan, strafePan, stagedGrabGesture)
        : Gesture.Race(pinch, pan, stagedGrabGesture);
    }
    return Gesture.Race(pinch, pan);
  }, [heldAction, floatOn, canvasStrafeOn, pinch, pan, strafePan, canvasGestureFor, stagedGrabGesture]);

  // Stable identities: LoadingOverlay's fade effect deps include these; fresh arrows each render re-ran the effect and could cancel the hold timeout mid-beat with the fading latch already set, stranding the overlay.
  const handleRetry = useCallback(() => {
    setLoadError(false);
    setModelReady(false);
    setRetryKey((k) => k + 1);
  }, []);
  const handleBack = useCallback(() => router.back(), [router]);
  const handleFadedOut = useCallback(() => setLoaderVisible(false), []);

  // The overlay must cover BOTH branches below: the furniture-null branch IS the data-loading window it exists for.
  const loadingOverlay = loaderVisible ? (
    <LoadingOverlay
      key={retryKey}
      milestone={milestone}
      error={loadError}
      onRetry={handleRetry}
      onBack={handleBack}
      onFadedOut={handleFadedOut}
    />
  ) : null;

  return (
    <>
      {!furniture ? (
        <View style={styles.root} />
      ) : (
        <ImageBackground
      // Focus Mode renders its backdrop this way (ImageBackground as the root).
      // A separate <Image style={absoluteFill}> here scaled the artwork
      // differently for the same file, so mirror the working structure exactly.
      // "clear": no source — the milk-white root (SCENE_BACKGROUND) / dark root shows through.
      source={
        backdrop === "clear"
          ? undefined
          : (BACKDROPS[backdrop] ?? BACKDROPS.studio)[
              theme === "dark" ? "dark" : "light"
            ]
      }
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
            onModelReady={handleModelReady}
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
          ]}
          pointerEvents="none"
        >
          {settings.showInstructions ? (
            <Text style={[styles.objectiveText, { fontSize: objectiveFontSize }]}>
              Stage {stage} · {objective} · {completedCount}/{totalCount}
            </Text>
          ) : null}
          {/* [★ star] [progress track] [XP label] — the badge sits ON the bar's left,
              the way the reference integrates the level star into the track. */}
          <View style={[styles.progressRow, settings.showInstructions && styles.progressGap]}>
            <View style={styles.xpStar} pointerEvents="none">
              <Text style={styles.xpStarGlyph}>★</Text>
            </View>
            {/* Fills in the ACCENT and only turns green at 100% — a half-built table is not
                done, and green is the one signal reserved for done. */}
            <ProgressBar
              value={completedCount}
              total={totalCount}
              style={styles.xpTrack}
            />
            <Text style={styles.xpLabel}>
              {completedCount * furniture.xpPerStep} XP
            </Text>
          </View>
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
          <ToggleChips />
        </View>
        {!focus && mode !== "strict" ? <ClusterFocusControl /> : null}
        <PartsTray
          items={sceneState.trayItems}
          gestureFor={gestureFor}
          thumbs={furniture.thumbs}
          header={focus ? undefined : <ClusterTray clusterDriver={clusterDriver} />}
        />
        <ToolBar neededTool={neededTool} />
        {mode === "free" && !focus ? (
          <Button
            label="?"
            small
            style={styles.hintButton}
            onPress={() => useGameStore.getState().suggestNext()}
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
          <BeatControl action={sceneState.activeBeat} pushDrivers={pushDrivers} />
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
          <Button
            label="⟲ Recenter"
            small
            style={styles.recenterButton}
            onPress={resetCamera}
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
      {ringOverlay}
      <GreenFlash trigger={completedCount} />
        </ImageBackground>
      )}
      {loadingOverlay}
    </>
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

    objectiveBar: {
      position: "absolute",
      top: 10,
      alignSelf: "center",
      justifyContent: "center",
      backgroundColor: t.surface,
      borderColor: t.border,
      borderWidth: StyleSheet.hairlineWidth * 2,
      paddingHorizontal: SPACE.lg,
      // With the objective sentence shown the bar needs two rows, so it sizes to content.
      paddingVertical: 6,
      borderRadius: RADIUS.panel,
      ...ELEVATION.card,
    },
    // Instructions hidden — just the XP row. FIXED to the cluster panel's height (its
    // paddingTop 6 + chip 32 + paddingBottom 8 = 46); both sit at top:10, so their bottom
    // edges line up at y=56. No vertical padding: the 46 is the whole height.
    objectiveBarSlim: { width: 260, height: 46, paddingVertical: 0 },
    objectiveText: { ...TYPE.body, color: t.text, fontSize: 13, lineHeight: 15 },
    progressGap: { marginTop: SPACE.sm },

    // The XP badge sits INSIDE the bar, on the progress track's left — a star that overlaps
    // the track's start, with the running total beside it. (There is no level system in the
    // data — just xpPerStep — so this shows the honest running total, not a fake N/500.)
    progressRow: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
    xpStar: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: t.accent,
      alignItems: "center",
      justifyContent: "center",
      // Pull it left so it straddles the track's start, as in the reference.
      marginRight: -2,
      ...ELEVATION.card,
    },
    xpStarGlyph: { color: t.onAccent, fontSize: 13, fontWeight: "800" },
    xpTrack: { flex: 1 },
    xpLabel: { ...TYPE.numeric, color: t.gold },

    // Same line as the points chip and the gear.
    // On the top row beside the gear (gear is 42 wide at left:14 → sits at left:64).
    hintButton: { position: "absolute", left: 64, top: 8, minWidth: 42 },
    recenterButton: { position: "absolute", left: 14, top: 102 },
    // The way back to the tray in float mode. PRIMARY: while a part is in the air, this is
    // the one thing the player might need, so it is the one thing that carries the accent.
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