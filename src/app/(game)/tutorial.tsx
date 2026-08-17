import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { router } from "expo-router";
import { OrientationLock } from "expo-screen-orientation";
import { Animated, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useHudInsets } from '@/src/hooks/use-safe-insets';

import { FilamentScene } from "react-native-filament";

import { AssemblyScene } from "@/src/game/scene/AssemblyScene";
import { useAssemblyDrivers } from "@/src/game/scene/useAssemblyDrivers";
import { useSceneState } from "@/src/game/scene/useSceneState";

import { Joystick } from "@/src/game/input/camera/Joystick";
import { useOrbitCamera } from "@/src/game/input/camera/useOrbitCamera";
import { usePartDrag } from "@/src/game/input/drag/usePartDrag";
import { BeatControl } from "@/src/game/input/slide/BeatControl";
import { TapControl } from "@/src/game/input/pad/TapControl";
import { TightenControl } from "@/src/game/input/dial/TightenControl";
import { RotateControl } from "@/src/game/input/dial/RotateControl";
import { SlideControl } from "@/src/game/input/slide/SlideControl";
import { PressControl } from "@/src/game/input/pad/PressControl";
import { ObjectiveBar } from "@/src/game/ui/hud/ObjectiveBar";
import {
  HintButton,
  RecenterButton,
  hudControlStyles as hudControls,
  tutorialChrome as styles,
} from "@/src/game/ui/hud/hudChrome";
import { Button } from "@/src/game/ui/system/Button";
import { useStepObjective } from "@/src/game/core/presentation/useStepObjective";
import { useAssemblySfx } from "@/src/game/audio/useAssemblySfx";

import { useGameStore } from "@/src/game/core/store";
import { useCurrentUserId, useRepos } from "@/src/data";
import { asFurnitureId } from "@/src/game/core/ids";
import {
  pressParkInfo,
  screwParkOffset,
  slideParkInfo,
} from "@/src/game/core/evaluation/engagement";
import {
  loadFurnitureById,
} from "@/src/game/content/furnitures/furnitures";

import { GreenFlash } from "@/src/game/ui/feedback/GreenFlash";
import { HintToast } from "@/src/game/ui/feedback/HintToast";
import { CenterDropRing } from "@/src/game/ui/feedback/CenterDropRing";
import { FitChip } from "@/src/game/ui/feedback/FitChip";
import { PartsTray } from "@/src/game/ui/hud/PartsTray";
import { ClusterTray } from "@/src/game/ui/hud/ClusterTray";
import { UndoButton } from "@/src/game/ui/hud/UndoButton";
import { GameSettings } from "@/src/game/ui/settings/GameSettings";
import type { SettingsFocusTarget } from "@/src/game/ui/settings/SettingsControls";
import {
  BuildMap,
  MapButton,
} from "@/src/game/ui/hud/ClusterFocusControl";
import {
  SpotButton,
  FocusToggleButton,
} from "@/src/game/ui/hud/ToggleChips";
import { SceneBackdrop } from "@/src/game/ui/backdrop/SceneBackdrop";
import { ThemeScope } from "@/src/game/ui/system/theme";
import type { ThemeId } from "@/src/game/core/type";
import { backdropSource } from "@/src/game/ui/backdrop/backdrops";
import { setMusicEnabled, setMusicVolume, stopMusic } from "@/src/game/audio/music";
import { useScreenOrientationLock } from "@/src/hooks/use-screen-orientation-lock";
import {
  requiresClusterFocus,
} from "@/src/game/core/evaluation/clusters";
import { availableInMode } from "@/src/game/core/evaluation/availability";
import { TutorialTarget } from "@/src/game/tutorial/TutorialTarget";
import { MascotGuideOverlay } from "@/src/game/tutorial/MascotGuideOverlay";
import { GripCoach } from "@/src/game/tutorial/GripCoach";
import {
  SkipTutorialButton,
  SkipTutorialConfirm,
} from "@/src/game/tutorial/SkipTutorial";
import { MomentumCompanion } from "@/src/game/tutorial/MomentumCompanion";
import { MomentumAttentionOverlay } from "@/src/game/tutorial/MomentumAttentionOverlay";
import { useTutorialStore } from "@/src/game/tutorial/store";
import { useTutorialHaptics } from "@/src/game/tutorial/useTutorialHaptics";
import {
  TUTORIAL_STEP_REWARD_TOKENS,
  type ToolTutorialKind,
  type TutorialTargetId,
} from "@/src/game/tutorial/steps";

const TUTORIAL_FURNITURE_ID = asFurnitureId("lack-table");
const TUTORIAL_SPOT_MS = 2800;

function TutorialScreen() {
  useScreenOrientationLock(OrientationLock.LANDSCAPE);
  useTutorialHaptics();
  const hud = useHudInsets();
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
    isViewingUnderside,
  } = useOrbitCamera({ stableFraming: true, stickShared });
  const lastScale = useRef(1);
  const joystickTutorialStartedAt = useRef<number | null>(null);
  const [guideCollapsed, setGuideCollapsed] = useState(false);
  const [undoPreviewActive, setUndoPreviewActive] = useState(false);
  const undoPreviewProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!undoPreviewActive) {
      undoPreviewProgress.stopAnimation();
      undoPreviewProgress.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(undoPreviewProgress, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.delay(420),
        Animated.timing(undoPreviewProgress, {
          toValue: 0,
          duration: 450,
          useNativeDriver: true,
        }),
        Animated.delay(220),
      ]),
    );
    animation.start();
    return () => {
      animation.stop();
      undoPreviewProgress.setValue(0);
    };
  }, [undoPreviewActive, undoPreviewProgress]);

  const undoPreviewSceneStyle = {
    opacity: undoPreviewProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0.35],
    }),
    transform: [
      {
        translateX: undoPreviewProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 72],
        }),
      },
      {
        scale: undoPreviewProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 0.92],
        }),
      },
    ],
  };

  const handleTutorialUndo = useCallback(() => {
    const tutorial = useTutorialStore.getState();
    if (tutorial.steps[tutorial.currentIndex]?.id !== "hud-undo") {
      useGameStore.getState().undoLastAction();
      return;
    }
    setUndoPreviewActive(true);
  }, []);

  const dismissUndoPreview = useCallback(() => {
    // Keep the preview visible while the tutorial store applies its normal
    // advance delay. Hiding it first briefly reveals the old Undo guide again.
    useTutorialStore.getState().completeEvent("step_undone");
  }, []);

  // Stabilised with useCallback so <Joystick>'s internal gesture memo actually holds.
  // The tutorial needs to wrap the raw camera callbacks to drive step tracking; passing fresh inline arrows would hand Joystick new props every render, defeating its memo and reattaching the native pan handler mid-drag — the very stutter the memo prevents on the play screen. getState() and the ref read are non-reactive, so the underlying camera callback is the only real dependency.
  const handleStickStart = useCallback(() => {
    joystickTutorialStartedAt.current = Date.now();
    onStickStart();
  }, [onStickStart]);

  const handleStickMove = useCallback(
    (x: number, y: number) => {
      onStickMove(x, y);
      const startedAt = joystickTutorialStartedAt.current;
      if (
        startedAt &&
        Date.now() - startedAt > 250 &&
        Math.hypot(x, y) > 0.15
      ) {
        useTutorialStore.getState().completeEvent("joystick_moved");
        if (isViewingUnderside()) {
          useTutorialStore
            .getState()
            .completeEvent("underside_view_reached");
        }
      }
    },
    [isViewingUnderside, onStickMove],
  );

  const handleStickEnd = useCallback(() => {
    joystickTutorialStartedAt.current = null;
    onStickEnd();
  }, [onStickEnd]);
  const oneFingerPanStartedAt = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let active = true;
    const state = useGameStore.getState();
    useTutorialStore.getState().configureTutorial({
      profile: state.profile,
      mode: state.mode,
      manualTools: state.settings.manualTools,
      softHints: state.settings.softHints,
    });
    loadFurnitureById(TUTORIAL_FURNITURE_ID)
      .then((f) => {
        if (active) useGameStore.getState().loadFurniture(f);
      })
      .catch((err) => console.warn("[tutorial] furniture load failed", err));
    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () =>
      useGameStore.subscribe((state, previous) => {
        const tutorial = useTutorialStore.getState();
        const settingsTutorialActive =
          tutorial.steps[tutorial.currentIndex]?.targetId === "settings";
        if (!previous.heldActionId && state.heldActionId) {
          const currentStepId =
            tutorial.steps[tutorial.currentIndex]?.id;
          if (
            currentStepId === "install-four-legs" ||
            currentStepId === "place-connector"
          ) {
            setGuideCollapsed(true);
          }
          tutorial.completeEvent("part_picked_up");
        }
        if (state.completed.length < previous.completed.length) {
          tutorial.completeEvent("step_undone");
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
            if (action?.type === "reorient") {
              tutorial.completeEvent("assembly_reoriented");
            }
          }
        }
        // hintPulse increments on every Spot press, including repeated presses for the same part.
        if (state.hintPulse > previous.hintPulse) {
          tutorial.completeEvent("spot_used");
        }
        if (
          !settingsTutorialActive &&
          state.settings.focusMode !== previous.settings.focusMode
        ) {
          tutorial.completeEvent("focus_mode_toggled");
        }
        if (!settingsTutorialActive && state.backdrop !== previous.backdrop) {
          tutorial.completeEvent("backdrop_changed");
        }
        if (
          !settingsTutorialActive &&
          (state.settings.textLevel !== previous.settings.textLevel ||
            state.settings.showInstructions !==
              previous.settings.showInstructions)
        ) {
          tutorial.completeEvent("instruction_preferences_changed");
        }
      }),
    [],
  );

  const furniture = useGameStore((s) => s.furniture);
  // Subscribe to `completed` by REFERENCE and derive in a useMemo, rather than rebuilding `new Set(s.completed)` and walking the graph inside the selector on every store write. Matters most during a drag, where setDragFit fires per frame — same fix as play.tsx.
  const completed = useGameStore((s) => s.completed);
  const completedSet = useMemo(() => new Set(completed), [completed]);
  const tutorialStepEvent = useTutorialStore(
    (s) => s.steps[s.currentIndex]?.event,
  );
  const tutorialStepId = useTutorialStore(
    (s) => s.steps[s.currentIndex]?.id,
  );
  const tutorialStep = useTutorialStore(
    (s) => s.steps[s.currentIndex],
  );
  const settingsTutorialTarget: SettingsFocusTarget | null =
    tutorialStep?.id === "background-settings"
      ? "backdrop"
      : tutorialStep?.id === "guided-instructions-settings"
      ? "instructions"
      : null;
  const tutorialAdvancing = useTutorialStore(
    (s) => s.pendingAdvanceStepId !== null,
  );
  const activeCluster = useGameStore((s) => s.activeCluster);
  const mode = useGameStore((s) => s.mode);
  const settings = useGameStore((s) => s.settings);
  // The tutorial is an assembly task too, and it is the first one a player sees — starting silent
  // here and playing in the build would read as a bug rather than as a setting.
  const musicOn = settings.music;
  const musicVolume = settings.musicVolume;
  useEffect(() => {
    // Volume BEFORE enable, so the first bar plays at the level the player set rather than at the
    // module default and then correcting itself.
    setMusicVolume(musicVolume);
    setMusicEnabled(musicOn);
    return () => stopMusic();
  }, [musicOn, musicVolume]);
  const focusPreviewActive =
    tutorialStepId === "hud-spot" && settings.focusMode;
  const showingUndoPreview =
    undoPreviewActive && tutorialStepId === "hud-undo";
  useEffect(() => {
    if (undoPreviewActive && tutorialStepId !== "hud-undo") {
      setUndoPreviewActive(false);
    }
  }, [tutorialStepId, undoPreviewActive]);
  useAssemblySfx(settings.soundEffects);
  const hintPulse = useGameStore((s) => s.hintPulse);
  const spotPartId = useGameStore((s) => s.hintPartId);
  useEffect(() => {
    if (!spotPartId) return;
    const timer = setTimeout(
      () => useGameStore.getState().clearSpot(),
      TUTORIAL_SPOT_MS,
    );
    return () => clearTimeout(timer);
  }, [spotPartId, hintPulse]);
  const profile = useGameStore((s) => s.profile);
  const heldActionId = useGameStore((s) => s.heldActionId);
  const renderStyle = useGameStore((s) => s.renderStyle);
  const backdrop = useGameStore((s) => s.backdrop);
  // The BUILD's theme, not the app's: "Assemble in Dark Mode" darkens this screen only. Everything
  // under ThemeScope below (the HUD, the settings panel, the toasts) resolves through it.
  const theme: ThemeId = useGameStore((s) => s.assembleDark) ? "dark" : "light";
  const focus = settings.focusMode;
  // Recenter means nothing until there IS a build on the canvas — same rule as play.tsx.
  const sceneHasParts = Object.values(sceneState.modes).some(
    (m) => m !== "hidden" && m !== "socket_hint",
  );
  const dark = theme === "dark";
  const firstAvailable = useMemo(
    () =>
      furniture
        ? availableInMode(furniture, completedSet, mode, activeCluster)[0]?.actionId
        : undefined,
    [furniture, completedSet, mode, activeCluster],
  );
  const completedCount = useGameStore((s) => s.completed.length);
  const [skipAsked, setSkipAsked] = useState(false);
  const gripStepActive = useTutorialStore(
    (s) => s.steps[s.currentIndex]?.id === "hold-like-controller",
  );
  /**
   * Past the grip step — meaning the player has pressed "Got it".
   *
   * Not `currentIndex > at` alone. completeCurrentStep does NOT advance the index straight away: it
   * sets pendingAdvanceStepId and moves the index on a timer, after the step's reward animation. So
   * for that whole window the index still points AT the grip step even though its event has fired.
   * pendingAdvanceStepId is the immediate signal, and the index covers everything after it.
   *
   * `completed` here is a single boolean for the whole tutorial, not a list of finished ids.
   * A grip step that is absent (index -1) counts as past, so a profile without it still shows the
   * exit.
   */
  const gripAcknowledged = useTutorialStore((s) => {
    const at = s.steps.findIndex((step) => step.id === "hold-like-controller");
    if (at < 0) return true;
    return s.currentIndex > at || s.pendingAdvanceStepId === "hold-like-controller";
  });
  const guideCompleted = useTutorialStore((s) => s.completed);
  const guideStepCount = useTutorialStore((s) => s.steps.length);
  const orientationActionId = useGameStore((s) => s.orientationActionId);
  const totalCount = furniture?.actions.length ?? 0;
  const installedLegCount = useMemo(
    () =>
      furniture?.actions.filter(
        (action) =>
          completedSet.has(action.actionId) &&
          action.type === "placePart" &&
          action.partId?.startsWith("leg_"),
      ).length ?? 0,
    [completedSet, furniture],
  );
  const repeatedAssemblyLabel = useMemo(() => {
    if (tutorialStepId !== "install-four-legs") return null;
    const nextAction = furniture?.actions.find(
      (action) => action.actionId === firstAvailable,
    );
    const ordinal = Math.min(installedLegCount + 1, 4);

    if (
      nextAction?.type === "placeFastener" ||
      nextAction?.type === "insertFastener"
    ) {
      return `Insert bolt ${ordinal} of 4`;
    }
    if (nextAction?.type === "tightenFastener") {
      return `Tighten bolt ${ordinal} of 4`;
    }
    if (
      nextAction?.type === "placePart" &&
      nextAction.partId?.startsWith("leg_")
    ) {
      return `Install leg ${ordinal} of 4`;
    }
    return `Install all four legs · ${installedLegCount}/4`;
  }, [firstAvailable, furniture, installedLegCount, tutorialStepId]);
  const repeatedAssemblyGuide = useMemo<{
    targetId: TutorialTargetId;
    message: string;
  } | null>(() => {
    if (tutorialStepId !== "install-four-legs") return null;
    const nextAction = furniture?.actions.find(
      (action) => action.actionId === firstAvailable,
    );
    const ordinal = Math.min(installedLegCount + 1, 4);

    if (
      nextAction?.type === "placeFastener" ||
      nextAction?.type === "insertFastener"
    ) {
      return {
        targetId: "partsTray",
        message: `Long-press bolt ${ordinal}, then place it into the highlighted hole.`,
      };
    }
    if (nextAction?.type === "tightenFastener") {
      return {
        targetId: "tool",
        message: `Turn clockwise to tighten bolt ${ordinal} by hand.`,
      };
    }
    if (
      nextAction?.type === "placePart" &&
      nextAction.partId?.startsWith("leg_")
    ) {
      return {
        targetId: "partsTray",
        message: `Long-press leg ${ordinal}, then install it onto the bolt.`,
      };
    }
    return null;
  }, [firstAvailable, furniture, installedLegCount, tutorialStepId]);
  const collapsedLegGuide =
    guideCollapsed && tutorialStepId === "install-four-legs";
  const collapsedActionGuide =
    guideCollapsed &&
    (tutorialStepId === "install-four-legs" ||
      tutorialStepId === "place-connector");
  const tutorialTrayItems = useMemo(() => {
    if (
      tutorialAdvancing &&
      (tutorialStepId === "install-four-legs" ||
        tutorialStepId === "view-under-table" ||
        tutorialStepId === "place-connector" ||
        tutorialStepId === "tighten-connector")
    ) {
      return [];
    }
    if (tutorialStepId === "install-four-legs") {
      // Keep the repeated assembly cycle on the authored legal order even if
      // Focus mode is on. A started cluster makes later parts (such as a Leg)
      // draggable in free mode, but the tutorial must still expose Bolt →
      // tighten → Leg in sequence. Tighten has no tray card, so the tray is
      // intentionally empty during that action.
      const nextItem = sceneState.allTrayItems.find(
        (item) => item.action?.actionId === firstAvailable,
      );
      return nextItem ? [nextItem] : [];
    }
    if (tutorialStepId === "view-under-table") return [];
    if (tutorialStepId === "place-connector") {
      // The settings tutorial may leave Focus mode enabled. In that mode the
      // visible tray is reduced to one actionable group, which is not
      // guaranteed to be the bolt when this guide step starts. Select the
      // required fastener from the complete tray so the tutorial cannot ask
      // for a bolt while rendering an empty tray.
      return sceneState.allTrayItems.filter(
        (item) =>
          item.action?.type === "placeFastener" ||
          item.action?.type === "insertFastener",
      );
    }
    if (tutorialStepId === "tighten-connector") return [];
    return sceneState.trayItems;
  }, [
    sceneState.allTrayItems,
    sceneState.trayItems,
    firstAvailable,
    tutorialAdvancing,
    tutorialStepId,
  ]);

  useEffect(() => {
    setGuideCollapsed(false);
  }, [tutorialStepId]);

  // LACK-specific milestones are derived from completed actions so they remain correct even if the player installs parts in a different legal order.
  useEffect(() => {
    if (furniture?.meta.id !== TUTORIAL_FURNITURE_ID) return;
    const completedActions = furniture.actions.filter((action) =>
      completedSet.has(action.actionId),
    );
    const completeEvent = useTutorialStore.getState().completeEvent;

    if (
      tutorialStepEvent === "all_legs_installed" &&
      completedActions.filter(
        (action) =>
          action.type === "placePart" && action.partId?.startsWith("leg_"),
      ).length >= 4
    ) {
      completeEvent("all_legs_installed");
    } else if (
      tutorialStepEvent === "connector_placed" &&
      completedActions.some(
        (action) =>
          action.type === "placeFastener" ||
          action.type === "insertFastener",
      )
    ) {
      completeEvent("connector_placed");
    } else if (
      tutorialStepEvent === "connector_tightened" &&
      completedActions.some((action) => action.type === "tightenFastener")
    ) {
      completeEvent("connector_tightened");
    }
  }, [completedSet, furniture, tutorialStepEvent]);

  // Record the LACK table as a completed build once it's assembled — so the player owns it (it's a placeable built_item) and it counts toward assembly_count, like any build. Fires once.
  const repos = useRepos();
  const me = useCurrentUserId();
  const lackRecorded = useRef(false);
  // The store may still hold a FINISHED build from a previous play session on the first frames (before loadFurnitureById lands), so "built" only counts when the loaded furniture is LACK.
  const lackBuilt =
    furniture?.meta.id === TUTORIAL_FURNITURE_ID &&
    totalCount > 0 &&
    completedCount >= totalCount;
  // A failed write re-arms via this counter: bumping it re-fires the effect, which a ref reset alone never does. Capped so a permanent backend failure cannot loop forever.
  const [recordAttempt, setRecordAttempt] = useState(0);
  useEffect(() => {
    if (lackBuilt && !lackRecorded.current) {
      lackRecorded.current = true;
      repos.builds.complete(me, TUTORIAL_FURNITURE_ID).catch((err) => {
        console.warn("[tutorial] could not record the completed LACK build", err);
        lackRecorded.current = false;
        setRecordAttempt((n) => (n < 3 ? n + 1 : n));
      });
    }
  }, [lackBuilt, me, repos, recordAttempt]);
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
      ? // Same branch as play.tsx: press → pressParkInfo, everything else (slide, screw) → slideParkInfo.
        (driveKind === "press" ? pressParkInfo : slideParkInfo)(
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

  // The LACK tutorial is hand-driven and deliberately has no toolbox. Any
  // interaction control required by the current action appears automatically,
  // matching the real LACK task instead of exposing an empty manual-tool HUD.
  const toolReady = true;
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
          oneFingerPanStartedAt.current = { x: e.x, y: e.y };
          onPanStart(e.x, e.y);
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

  // Composition identity changes ONLY when the held action changes (touch-free moments), never on ordinary re-renders. The one-finger canvas gesture is always live: held → usePartDrag's canvas gesture (re-grab or strafe fallback), empty scene → strafePan.
  const heldAction = sceneState.heldAction;
  const sceneGesture = useMemo(() => {
    if (heldAction) {
      return Gesture.Race(pinch, pan, canvasGestureFor(heldAction));
    }
    return Gesture.Race(pinch, pan, strafePan);
  }, [heldAction, pinch, pan, strafePan, canvasGestureFor]);

  // Also holds while the store still shows a PREVIOUS session's furniture: rendering that here would flash the wrong build (and its finished ObjectiveBar) until the tutorial recipe lands.
  if (!furniture || furniture.meta.id !== TUTORIAL_FURNITURE_ID)
    return <ThemeScope value={theme}><View style={styles.root} /></ThemeScope>;

  return (
    <ThemeScope value={theme}>
    <SceneBackdrop
      source={backdropSource(backdrop, theme === "dark")}
      style={[
        styles.root,
        theme === "dark" && styles.rootDark,
        // "Clear" is a flat warm cream in the light theme — the same rule as play.tsx, so the
        // tutorial and the build show the same ground for the same setting. Dark keeps its own.
        // Same rule as play.tsx: clear is the same beige in both themes.
        backdrop === "clear" && { backgroundColor: "#DACAAE" },
      ]}
    >
      <GestureDetector gesture={sceneGesture}>
        <Animated.View style={[styles.sceneWrap, undoPreviewSceneStyle]}>
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
              stickShared={stickShared}
              stickActive={stickActive}
            panShared={panShared}
            />
          </TutorialTarget>
        </Animated.View>
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
            top: hud.top,
            // The app runs immersive (status + nav bars hidden in _layout), and Android reports ZERO insets once those bars are gone — even though the display cutout is still physically there. So the side margin cannot come from the inset alone: HUD_SIDE_MARGIN is the floor that actually clears a landscape cutout, and max() still honours a larger inset if a device reports one.
            left: hud.left,
            right: hud.right,
            bottom: hud.bottom,
          },
        ]}
        pointerEvents="box-none"
      >
        {/* Instructions hidden → only the progress bar stays (slim pill). Shared with play.tsx, so the tutorial HUD can never drift from the real one. */}
        <View
          style={
            profile === "momentum" ? styles.topRow : styles.objectiveWrap
          }
          pointerEvents="box-none"
        >
          <MomentumCompanion />
          {/* Pause is gone here for the same reason as in play.tsx: it opened the map, which the Map
              button now does, and the tutorial must teach the HUD the build actually has. */}
          <ObjectiveBar
            line={
              profile === "control"
                ? null
                : settings.showInstructions
                ? collapsedLegGuide
                  ? repeatedAssemblyLabel
                  : guideCompleted
                  ? `Finish the LACK table · ${displayedCompletedCount}/${displayedTotalCount}`
                  : tutorialStep?.shortLabel ?? objective
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
        <UndoButton onPress={handleTutorialUndo} />
        <TutorialTarget
          id="undo"
          style={styles.undoTarget}
          pointerEvents="none"
        />
        <GameSettings
          tutorialTarget={settingsTutorialTarget}
          confirmDisabled={tutorialAdvancing}
          onTutorialTargetActivated={() => {
            if (tutorialStep?.targetId === "settings") {
              useTutorialStore
                .getState()
                .completeEvent(tutorialStep.event);
            }
          }}
        />
        <TutorialTarget
          id="settings"
          style={styles.settingsTarget}
          pointerEvents="none"
        />
        {/* Ungated: play.tsx renders ToggleChips for every profile, so the tutorial showing them to only two was teaching a HUD the build does not have. */}
        <View style={styles.togglesRow}>
          <TutorialTarget id="focus" pointerEvents="auto">
            <FocusToggleButton />
          </TutorialTarget>
          <TutorialTarget id="spot" pointerEvents="auto">
            <SpotButton />
          </TutorialTarget>
        </View>
        {/* One Map button where the cluster discs were — the same control, in the same slot, that the
            build screen shows. */}
        {mode !== "strict" ? <MapButton /> : null}
        <PartsTray
          items={tutorialTrayItems}
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
        {mode === "free" && !focus ? (
          <TutorialTarget id="hint" style={hudControls.hintButton}>
            <HintButton
              onPress={() => {
                if (collapsedActionGuide) {
                  setGuideCollapsed(false);
                  return;
                }
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
          <>
            <TutorialTarget
              id="beatControl"
              style={styles.beatControlTarget}
              pointerEvents="none"
            />
            <BeatControl
              action={sceneState.activeBeat}
              onSwipeStart={
                sceneState.activeBeat.actionId === "finishing_checks"
                  ? resetCamera
                  : undefined
              }
            />
          </>
        ) : null}
        <TutorialTarget id="joystick" style={styles.joystickZone}>
          <Joystick
            onStart={handleStickStart}
            onMove={handleStickMove}
            onEnd={handleStickEnd}
            dark={dark}
          />
        </TutorialTarget>
        <TutorialTarget id="recenter" style={hudControls.recenterButton}>
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
        {heldActionId && settings.releaseBehavior === "float" ? (
          // Same control as play.tsx: the settings walkthrough invites switching to Float, so the way back to the tray must exist here too or a dropped part soft-locks the tutorial.
          <Button
            label="↩ Put back"
            small
            variant="primary"
            style={styles.putBackButton}
            onPress={() => useGameStore.getState().cancelHeld()}
          />
        ) : null}
      </View>
      {/* Same project/pause card as a task, but tutorial has no selectable
          sub-assembly stages: it presents the LACK furniture as one project. */}
      {profile === "momentum" ? <BuildMap overviewOnly /> : null}
      {ringOverlay}
      <GreenFlash trigger={completedCount} />
      {/* Above everything, and only on its own step: how to HOLD the device comes before any control
          on it, and every control after this assumes the grip it teaches. */}
      {gripStepActive ? (
        <GripCoach
          onAcknowledge={() =>
            useTutorialStore.getState().completeEvent("grip_acknowledged")
          }
        />
      ) : null}
      {/* Only AFTER the grip step is acknowledged. That step owns the screen while it is up, and
          offering a way out of the tutorial before the player has seen a single thing it teaches
          invites them out of it for no reason. */}
      {gripAcknowledged ? (
        <SkipTutorialButton onPress={() => setSkipAsked(true)} />
      ) : null}
      {skipAsked ? (
        <SkipTutorialConfirm
          onCancel={() => setSkipAsked(false)}
          onConfirm={() => {
            setSkipAsked(false);
            // The same exit the guide already uses for "I'll finish this later": the room, with the
            // welcome banner. The build is not discarded — it stays in the catalogue.
            router.replace({
              pathname: "/room",
              params: { welcome: "tutorial" },
            });
          }}
        />
      ) : null}
      <MascotGuideOverlay
        activeToolKind={activeToolKind}
        assemblyComplete={totalCount > 0 && completedCount >= totalCount}
        audioEnabled={settings.audio}
        blocked={collapsedActionGuide}
        focusReturnPrompt={focusPreviewActive}
        undoPreviewActive={showingUndoPreview}
        onDismissUndoPreview={dismissUndoPreview}
        guideTargetOverride={repeatedAssemblyGuide?.targetId}
        guideMessageOverride={repeatedAssemblyGuide?.message}
        earnedXp={completedCount * furniture.xpPerStep}
        onClaimReward={() => {}}
        onSimulatePinch={() => {
          if (!manipulator) return;
          onZoomDelta(0.18);
          useTutorialStore.getState().completeEvent("pinch_zoomed");
        }}
        onPlaceInRoom={() => {
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
          // The room guide owns the first placement. It presents a real draggable
          // furniture card and only creates the placement ghost after that drag.
          router.replace({ pathname: "/room", params: { firstPlacement: "lack-table" } });
        }}
      />
      <MomentumAttentionOverlay />
    </SceneBackdrop>
    </ThemeScope>
  );
}

export default function TutorialRoute() {
  return (
    <FilamentScene>
      <TutorialScreen />
    </FilamentScene>
  );
}