import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { router } from "expo-router";
import { OrientationLock } from "expo-screen-orientation";
import { Animated, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useHudInsets } from '@/src/hooks/use-safe-insets';

import { FilamentScene } from "react-native-filament";

import { AssemblyScene } from "@/src/game/scene/AssemblyScene";
import { useSceneSlot } from "@/src/game/scene/sceneSlot";
import { useAssemblyDrivers } from "@/src/game/scene/useAssemblyDrivers";
import { actionableFirst, useSceneState } from "@/src/game/scene/useSceneState";

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
  SpokenStepsButton,
  useHudControlStyles,
  useTutorialChrome,
} from "@/src/game/ui/hud/hudChrome";
import { Button } from "@/src/game/ui/system/Button";
import { useStepObjective } from "@/src/game/core/presentation/useStepObjective";
import { useAssemblySfx } from "@/src/game/audio/useAssemblySfx";

import { useGameStore } from "@/src/game/core/store";
import { usePrefsStore } from "@/src/game/core/prefsStore";
import { useCurrentUserId, useRepos } from "@/src/data";
import { useProfileStore } from "@/src/data/player/profileStore";
import { useShopStore } from "@/src/data/shop/store";
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
import { CenterDropRing } from "@/src/game/ui/feedback/CenterDropRing";
import { FitChip } from "@/src/game/ui/feedback/FitChip";
import { PartsTray } from "@/src/game/ui/hud/PartsTray";
import { ClusterTray } from "@/src/game/ui/hud/ClusterTray";
import { UndoButton } from "@/src/game/ui/hud/UndoButton";
import { GameSettings } from "@/src/game/ui/settings/GameSettings";
import type { SettingsFocusTarget } from "@/src/game/ui/settings/SettingsControls";
import {
  BuildMap,
} from "@/src/game/ui/hud/ClusterFocusControl";
import {
  SpotButton,
  FocusToggleButton,
} from "@/src/game/ui/hud/ToggleChips";
import { SceneBackdrop } from "@/src/game/ui/backdrop/SceneBackdrop";
import { isTabletScreen, ThemeScope } from "@/src/game/ui/system/theme";
import type { ThemeId } from "@/src/game/core/type";
import { backdropSource } from "@/src/game/ui/backdrop/backdrops";
import { useScreenOrientationLock } from "@/src/hooks/use-screen-orientation-lock";
import {
  requiresClusterFocus,
} from "@/src/game/core/evaluation/clusters";
import { availableInMode, nextAction } from "@/src/game/core/evaluation/availability";
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
import { useTutorialEvents } from "@/src/game/tutorial/useTutorialEvents";
import { useTutorialHaptics } from "@/src/game/tutorial/useTutorialHaptics";
import { useBuildPersistence } from "@/src/hooks/useBuildPersistence";
import { DevAutoStep } from "@/src/dev/DevAutoStep";
import {
  TUTORIAL_STEP_REWARD_TOKENS,
  type ToolTutorialKind,
} from "@/src/game/tutorial/steps";

/**
 * Is the run sitting on the card that TEACHES Undo and Recenter?
 *
 * Read at press time rather than subscribed to, so it costs nothing on the frames in between and
 * cannot go stale between a render and a tap.
 *
 * Matched on the TARGET, not the step id: all four runs name this step `visual-undo-recenter` today,
 * but the target is what the spotlight actually rings, so a rename cannot quietly re-arm the buttons.
 */
function isUndoRecenterStep(): boolean {
  const t = useTutorialStore.getState();
  return t.steps[t.currentIndex]?.targetId === "undoRecenter";
}

const TUTORIAL_FURNITURE_ID = asFurnitureId("lack-table");
const TUTORIAL_SPOT_MS = 2800;

/** The parts-tray column's own top inset and its list padding (PartsTray's `column` and `list`).
 *  Copied rather than imported because they are private to that sheet — if either moves, this must
 *  move with it, or the spotlight drifts off the card it frames. */
const PARTS_TRAY_TOP = 70;
const PARTS_TRAY_LIST_PAD = 4;

function TutorialScreen() {
  useScreenOrientationLock(OrientationLock.LANDSCAPE);
  useTutorialHaptics();
  // The tutorial builds the SAME LACK table the catalogue lists, so its progress has to be written —
  // without this, a player who skipped halfway found the catalogue offering "Start" and their four
  // legs gone. Save only, never resume: see the note on the hook.
  useBuildPersistence(TUTORIAL_FURNITURE_ID, { resume: false, settleOnFinish: false });
  // Chrome AND spotlight targets together: the targets are measured rectangles standing in for controls, so they have to cross the screen with the controls they frame or the highlight lands on nothing.
  const styles = useTutorialChrome();
  const hudControls = useHudControlStyles();
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
    getLookAt,
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
  // Stable, so the events subscription below never re-subscribes. A store subscription that is torn
  // down and rebuilt mid-gesture is a store subscription that misses the transition it was written
  // to catch.
  const collapseGuideForPickup = useCallback(() => setGuideCollapsed(true), []);
  const [undoPreviewActive, setUndoPreviewActive] = useState(false);
  const undoPreviewProgress = useRef(new Animated.Value(0)).current;

  // THE GHOST BELONGS TO THE UNDO PREVIEW, AND TO NOTHING ELSE.
  //
  // `undoPreviewActive` is `hud-undo`'s whole-card takeover in MascotGuideOverlay — its own header
  // and copy, the spotlight on the assembly area, a full-screen Pressable to close it. This scene
  // animation is one part of that takeover and runs for as long as it is up.
  //
  // It also ran on `visual-undo-recenter`, the read-only card every profile actually reaches.
  // Removed 2026-08-29: it slid and faded the WHOLE build, which is not what Undo does — undo takes
  // back the last part — and players read the movement as their press having undone the table. The
  // card rings both buttons and says what they do; nothing has to move for that to land.
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
      // Forever: the preview's card waits on the player, and the whole screen IS the preview.
      { iterations: -1 },
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
    // A step the player is only READING closes on this press — the undo/recenter card names this
    // button, so using it is an acknowledgement.
    if (tutorial.steps[tutorial.currentIndex]?.event === "controls_acknowledged") {
      tutorial.completeEvent("controls_acknowledged");
    }
    // …AND ON THAT ONE STEP THE PRESS DOES NOTHING ELSE.
    //
    // The card is explaining what Undo does; it is not asking for an undo. Doing one here removes
    // the part the next step asks the player to build on — on Felix's and Sparky's runs this lands
    // right after the tabletop goes down, so the press the card seems to invite is the press that
    // deletes their work.
    //
    // The button still LOOKS exactly as it always does: no `disabled`, no dimming. Only this step,
    // only in the tutorial — the same card in every run reaches it, and play.tsx never comes through
    // this handler at all.
    if (isUndoRecenterStep()) return;
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
      tablet: isTabletScreen(),
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

  // The build's own transitions, turned into tutorial events by one subscription — see
  // game/tutorial/useTutorialEvents. It used to live here, inline, which is a large part of why this
  // screen had to be a fork of the assembly screen rather than a layer over it.
  useTutorialEvents(collapseGuideForPickup);

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
  // THE WAY BACK OUT OF FOCUS MODE. The focus step closes when Focus goes ON, which leaves the
  // player inside a stripped HUD; this puts up "Tap Focus again to return to the tutorial" and rings
  // the chip on the step that follows, so nobody is stranded there.
  //
  // ONE ID, shared by Felix's run and Sparky's: both toggle focus on at the step before and both
  // need the way out. It used to be `hud-spot`, which no run has any more. Lumi's
  // `visual-stuck-help` is deliberately NOT this id — she also toggles focus on and simply stays
  // there, which her remaining steps all survive, and that is the whole reason the two runs use
  // different ids for the same card.
  //
  // Pebble reaches it and correctly does nothing: it starts INSIDE focus mode, so its focus step
  // turns focus OFF and `settings.focusMode` is false by the time the next step opens.
  const focusPreviewActive =
    tutorialStepId === "hud-stuck-help" && settings.focusMode;
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
  const renderStyle = usePrefsStore((s) => s.renderStyle);
  const backdrop = usePrefsStore((s) => s.backdrop);
  // The BUILD's theme, not the app's: "Assemble in Dark Mode" darkens this screen only. Everything
  // under ThemeScope below (the HUD, the settings panel, the toasts) resolves through it.
  const theme: ThemeId = usePrefsStore((s) => s.assembleDark) ? "dark" : "light";
  const focus = settings.focusMode;
  // Recenter means nothing until there IS a build on the canvas — same rule as play.tsx.
  const sceneHasParts = Object.values(sceneState.modes).some(
    (m) => m !== "hidden" && m !== "socket_hint",
  );
  const dark = theme === "dark";
  const offered = useMemo(
    () =>
      furniture
        ? availableInMode(furniture, completedSet, mode, activeCluster)
        : [],
    [furniture, completedSet, mode, activeCluster],
  );
  const offeredIds = useMemo(
    () => new Set(offered.map((a) => a.actionId)),
    [offered],
  );
  // nextAction, not [0]. LACK composes its four legs BEFORE its bolts, so from the first tighten onwards `[0]` is a leg no matter what the player is doing — push the second bolt into its hole and the objective bar still read "Install leg 1 of 4" over a screw waiting to be turned, with its own tighten control on screen. See the note on nextAction.
  const nextActionId = useMemo(
    () => (furniture ? nextAction(furniture, offered, completedSet)?.actionId : undefined),
    [furniture, offered, completedSet],
  );
  const completedCount = useGameStore((s) => s.completed.length);
  const [skipAsked, setSkipAsked] = useState(false);
  /** The first parts-tray card's measured height, so the spotlight can frame exactly it. */
  const [firstCardHeight, setFirstCardHeight] = useState(0);
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
  // "Step 4" for the bar — THE SAME NUMBER THE MASCOT CARD SHOWS, computed the same way
  // (MascotGuideOverlay), because two places counting the same run differently is worse than either
  // choice on its own. The grip step is not numbered: it teaches how to hold the device rather than
  // how to use a control, so the first real instruction is Step 1 and not Step 2. It has a
  // shortLabel of its own ("Get comfortable"), which the bar reaches before this.
  const tutorialStepNumber = useTutorialStore((s) => {
    const gripAt = s.steps.findIndex((step) => step.id === "hold-like-controller");
    return gripAt >= 0 && s.currentIndex > gripAt
      ? s.currentIndex
      : s.currentIndex + 1;
  });
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
      (action) => action.actionId === nextActionId,
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
  }, [nextActionId, furniture, installedLegCount, tutorialStepId]);
  // THE PER-ACTION CARD IS GONE. It used to rewrite the last step's message to name whatever came
  // next — "Tighten bolt 2 of 4", "Long-press leg 3" — and retarget the spotlight to the tool on a
  // tighten beat.
  //
  // It was withdrawn one profile at a time and momentum was the last holdout, so there is nobody
  // left to serve. What it did wrong is the same everywhere: LACK alternates bolt, tighten, leg, so
  // a card following the next action swung back to tighten guidance the moment a bolt came up and
  // read as though the tutorial had gone BACKWARDS a step. The tool retarget also pulled the ring
  // off the tray. And every run's last step now says "Continue assembling." and is held to it: one
  // card, one arrow at the tray, until the table is done.
  //
  // `guideTargetOverride` / `guideMessageOverride` remain as optional props on MascotGuideOverlay,
  // defaulting to null. Nothing passes them now; they are the seam if a future run wants this back.
  const collapsedLegGuide =
    guideCollapsed && tutorialStepId === "install-four-legs";
  // THE CARD STANDS ASIDE ONCE A PART IS IN THE AIR. Every step named here puts its bubble beside
  // the parts tray, which is exactly where the player's hand goes and what it covers on the way —
  // including the centre drop ring the pick-up-and-place step is asking them to aim at. The voice
  // keeps talking through it (see MascotGuideOverlay), so the instruction is hidden, not withdrawn.
  //
  // `visual-pickup-and-place` is Lumi's merged pick-up-and-drag step; useTutorialEvents already
  // reported the pickup for it, and only this list was missing it.
  //
  // `long-press-part` is here for Pebble, whose run merged the same two steps a different way: the
  // card keeps the pick-up wording and the step closes on the snap, so the bubble has to stand aside
  // for the drag or it would be left instructing a pick-up that has already happened. It is listed
  // unconditionally rather than per profile because the composed runs that still have a separate
  // `drag-and-snap` step advance off this one at the pickup, which resets `guideCollapsed` (see the
  // effect on tutorialStepId) before the flag could ever be read.
  const collapsedActionGuide =
    guideCollapsed &&
    (tutorialStepId === "install-four-legs" ||
      tutorialStepId === "place-connector" ||
      tutorialStepId === "visual-pickup-and-place" ||
      tutorialStepId === "long-press-part");
  const tutorialTrayItems = useMemo(() => {
    // THE TRAY IS CONSTANT. It is where the player's parts live, not a per-step hint, so it does not
    // empty, shrink to one card, or vanish because the current step is about something else.
    //
    // There used to be a filter here that walked the player through a single action at a time —
    // right for a script that names each one. It emptied the tray outright on `view-under-table` and
    // `tighten-connector`, and reduced it to the next card alone on `install-four-legs`, which is
    // also empty whenever that next action is a tighten. All three read as the parts column
    // disappearing mid-step, and it was reported as a bug on every run that reached them.
    //
    // Every profile now runs a hand-written list, and not one of them names a single action at a
    // time: their joystick steps are one rotation, their undo and stuck-help cards are things to
    // READ, and their last steps say "Continue assembling." So the filter had no profile left to
    // serve and is gone rather than left behind a condition nobody satisfies.
    //
    // THE ONE EXCEPTION is the bolt step, and it is a reordering rather than a disappearance. The
    // step's arrow is drawn at the TOP of the tray, because the tray is measured as one column and
    // the cue has no card of its own to aim at — so with the full tray showing it pointed at
    // whatever happened to be first, which is the Leg. Narrowing to fasteners puts the bolt at the
    // top, which is the thing the step is asking for. Reading from `allTrayItems` rather than the
    // visible set also means focus mode cannot leave the tutorial asking for a bolt it is not
    // rendering.
    if (tutorialStepId === "place-connector") {
      return sceneState.allTrayItems.filter(
        (item) =>
          item.action?.type === "placeFastener" ||
          item.action?.type === "insertFastener",
      );
    }
    // AND THE SAME PROBLEM ON EVERY OTHER STEP, which the exception above only fixed for the bolt.
    //
    // The spotlight is one rectangle over the FIRST CARD (see partsTrayTarget) because a step that says "long-press a part" means one card, not the column. Which card is first comes from the tray, and in free mode the tray is in AUTHORED order — LACK composes its legs before its bolts, so the Leg card leads the column from the tabletop onwards. Finish a leg and the only legal move is the next bolt, but the ring is still sitting on the Leg: the tutorial reads as asking for a leg the model will not accept, and free mode's grab-anything makes that card liftable, so the player gets to carry it around and fail to place it.
    //
    // Actionable-first, the same sort guide and strict already get from useSceneState — the tutorial is a guided run whatever mode the profile pins, and this is what makes "the first card" and "the card the step is about" the same card. Stable, so nothing else reshuffles: the tray still holds every group, in its authored order within each half.
    return actionableFirst(sceneState.trayItems, offeredIds);
  }, [sceneState.allTrayItems, sceneState.trayItems, offeredIds, tutorialStepId]);

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
      // REWARD FIRST, THEN RECORD — the same order and the same reason as useBuildPersistence:
      // complete() deletes the in-progress save, so running them together means a failed reward
      // loses both the coins and the progress that would let the player earn them again.
      //
      // The reward was missing entirely. This screen passes `settleOnFinish: false`, which tells the
      // persistence hook to leave a finished build alone — no reward, no completion record — and then
      // recorded the completion here by hand while never granting anything. So the tutorial's LACK
      // table counted toward assembly_count and appeared in the room, and paid nothing: the same
      // table built from the catalogue paid its 178 XP, which is why only the tutorial looked broken.
      //
      // reward_build is idempotent on (user, furniture), so a player who does the tutorial and then
      // rebuilds LACK from the catalogue is paid once, not twice — the ledger's unique index decides
      // that, not this call.
      repos.builds
        .reward(me, TUTORIAL_FURNITURE_ID)
        .then((granted) => {
          // The grant put this in user_buy server-side; this is the client catching up, exactly as
          // the play screen does.
          if (granted.rewardItemId) useShopStore.getState().markOwned(granted.rewardItemId);
          return repos.builds.complete(me, TUTORIAL_FURNITURE_ID);
        })
        .then(() => {
          // RE-READ, rather than writing the totals the RPC handed back.
          //
          // It does return the new coin and XP totals, so a direct write is tempting. But the room's
          // pill renders `xpIntoLevel` / `xpForNextLevel` — the position WITHIN the current level —
          // and those are derived against the levels reference table when a profile is read. This
          // store cannot recompute them, so writing raw totals would move the number the profile page
          // shows and leave the pill under the star exactly as it was.
          //
          // No race here: this is sequenced after the grant rather than running beside it, so unlike
          // the room's own focus refetch it cannot read the profile before the reward lands.
          void useProfileStore.getState().load(repos, me);
        })
        .catch((err) => {
          console.warn("[tutorial] could not reward/record the completed LACK build", err);
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
    nextActionId,
    needsFocusChoice,
    mode,
    textLevel: settings.textLevel,
    // THE ASSEMBLY VOICE STAYS QUIET WHILE THE TUTORIAL IS TEACHING — and it stops teaching before it
    // ends. `settings.audio` alone meant the recorded LACK instruction played on top of Lumi's
    // tutorial line, two performances of two different scripts at once, on the profile built around
    // being read to.
    //
    // The handover is `collapsedLegGuide`, not `guideCompleted`. The last step is "Continue
    // assembling", which spans the whole rest of the build: waiting for the tutorial to COMPLETE
    // means the assembly hints only arrive once the table is finished and there is nothing left to
    // hint at. collapsedLegGuide is that step plus the player having picked something up — so the
    // handover happens AFTER Lumi's step-9 line has played rather than on top of it, which is the
    // one moment the two would otherwise collide.
    //
    // ONLY the audio is gated here. The bar's line is fixed separately, below.
    audioOn: settings.audio && (guideCompleted || collapsedLegGuide),
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
    getLookAt,
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
              // NO profile gate here. Control used to be hard-wired to null, which made "Show instructions" a dead switch for that profile: a player who moved to Guided and turned the setting ON still got nothing, with no way to tell why. The gate was redundant anyway — Control ships showInstructions:false in PROFILE_DEFAULTS, so the default silence it was enforcing already comes from the setting it was overriding.
              settings.showInstructions
                ? collapsedLegGuide
                  ? repeatedAssemblyLabel
                  : guideCompleted
                  ? `Finish the LACK table · ${displayedCompletedCount}/${displayedTotalCount}`
                  : // THE STEP NUMBER, not the step's sentence.
                    //
                    // This used to be `shortLabel ?? objective`, which worked for the profiles whose
                    // steps carry a shortLabel and failed for Lumi's, which deliberately carry none
                    // so the mascot card shows the authored sentence instead of a three-word stub
                    // (see VISUAL_TUTORIAL_STEPS). With no shortLabel the chain fell through to
                    // `objective` — the live LACK instruction, tracking whatever action happens to
                    // be available next — so the bar ran its own assembly sequence underneath a
                    // tutorial teaching something else entirely.
                    //
                    // The step's own message is not the answer either: it is already on the card an
                    // inch away, and printing it twice makes the player read the same sentence in
                    // two places to be sure they are not two instructions. The NUMBER says where
                    // they are in the run, which is the one thing the card's sentence does not.
                    //
                    // `objective` stays as the last rung, for a screen with no tutorial step left.
                    tutorialStep
                      ? tutorialStep.shortLabel ?? `Step ${tutorialStepNumber}`
                      : objective
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
        {/* NO HINT TOAST ANYWHERE IN THE TUTORIAL. It used to be withheld on the one step that
            teaches Spot; the problem is not that step, it is the whole screen. Every press of Spot
            sets a "Try: …" line that lands in the same band as the mascot's card and says the same
            thing a beat later, so the player reads the instruction twice and the second copy covers
            the first — and the tutorial ALREADY has a guidance layer, which is the card. A second
            bubble competing with it is the definition of noise here, whichever step is up.

            Spot itself is untouched — the ghost still travels into its socket, the tray still
            flashes, and `spot_used` still advances the step. Only the words are withheld, and only
            here: the toast is exactly right in a real build, which is why this is a condition on
            the tutorial's own render rather than a change to what Spot does. */}
        <SuppressHintText />
        <UndoButton onPress={handleTutorialUndo} />
        <TutorialTarget
          id="undo"
          style={styles.undoTarget}
          pointerEvents="none"
        />
        {/* The pair under one rectangle, for the step that teaches them together. Measured always,
            like every other target — only the step that names it lights it. */}
        <TutorialTarget
          id="undoRecenter"
          style={styles.undoRecenterTarget}
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
          // The BROWSE step's close. Gated on the event rather than the step id, and separate from
          // the callback above because that one only fires when the player changed the setting the
          // tutorial pointed at — this step points at none and asks for no change.
          onClosed={() => {
            if (tutorialStep?.event === "settings_browsed") {
              useTutorialStore.getState().completeEvent("settings_browsed");
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
          {/* Auto, in the same row and the same order as play.tsx — it was missing here, which made
              the "or Auto for support" step name a button that was not on the screen. It renders
              itself away outside __DEV__ and showcase builds, so this changes nothing in production.

              Its own measured target, so the stuck-help step can ring Auto and Spot without ringing
              the Focus chip between them. */}
          <TutorialTarget id="auto" pointerEvents="box-none">
            <DevAutoStep heldDriver={heldDriver} sinkDriver={sinkDriver} />
          </TutorialTarget>
          <TutorialTarget id="focus" pointerEvents="auto">
            <FocusToggleButton />
          </TutorialTarget>
          <TutorialTarget id="spot" pointerEvents="auto">
            <SpotButton />
          </TutorialTarget>
        </View>
        {/* NO MAP during the tutorial. The map is for choosing which stage of a build to work on, and
            the tutorial IS the stage — there is nothing on it to choose. Worse, opening it stops the
            script: the mascot hides while the map is up (see MascotGuideOverlay's mapOpen guard), so
            a player who taps it mid-step loses the instruction they were following.

            The BuildMap itself is still mounted below for momentum's overview; only the way in is
            withheld. */}
        <PartsTray
          items={tutorialTrayItems}
          gestureFor={gestureFor}
          thumbs={furniture.thumbs}
          onFirstCardHeight={setFirstCardHeight}
          header={
            <ClusterTray
              clusterDriver={clusterDriver}
              clusterGestureFor={clusterGestureFor}
            />
          }
        />
        {/* THE FIRST CARD, not the whole column. `partsTrayTarget` spans the tray top to bottom
            because some steps talk about the tray as a place ("your parts live here"); the steps that
            say "long-press a part card" mean ONE card, and lighting the full column pointed at four
            things while naming one.
            The height is measured by the tray and the top comes from the same constants the column
            uses, so the rectangle sits on the real card rather than on an estimate of it — a card is
            67pt or 81pt depending on whether its label wraps, which no written-down number survives.
            ASSUMES NO HEADER ABOVE THE LIST, which holds because the tutorial always builds LACK and
            LACK has no clusters, so the ClusterTray passed as `header` renders null. Teach the
            tutorial a clustered model and the header's height has to be measured and added here. */}
        <TutorialTarget
          id="partsTray"
          style={[
            styles.partsTrayTarget,
            firstCardHeight
              ? { top: PARTS_TRAY_TOP + PARTS_TRAY_LIST_PAD, height: firstCardHeight, bottom: undefined }
              : null,
          ]}
          pointerEvents="none"
        />
        {/* No TutorialTarget: no step points at it, and wrapping it would register a spotlight
            rectangle the script never uses. Renders itself away outside the visual profile.

            Slot follows the same rule as play.tsx — beside the gear unless the hint is there. The
            hint's own spotlight measures hudControls.hintButton, so the two must agree about who
            holds 58 or a step would highlight the wrong button. */}
        {focus ? null : (
          <SpokenStepsButton
            style={mode === "free" ? hudControls.spokenStepsButton : hudControls.hintButton}
          />
        )}
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
            {/* No onSwipeStart. It used to recentre the camera for `finishing_checks`, which was
                removed with the ceremonial beat — the tutorial's furniture has no beat left, and
                this control only stands for the push-open drawer tests on EKET now. */}
            <BeatControl action={sceneState.activeBeat} />
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
              const t = useTutorialStore.getState();
              // Same rule as Undo beside it — see handleTutorialUndo. The two buttons are named in
              // one sentence, so a card where one works and the other does not would teach the wrong
              // thing about both.
              if (isUndoRecenterStep()) {
                t.completeEvent("controls_acknowledged");
                return;
              }
              resetCamera();
              t.completeEvent("camera_recentered");
              // …and closes a step the player is only READING. The undo/recenter card names both
              // buttons; pressing either is at least as good an acknowledgement as tapping the
              // dimmed area, and demanding a tap elsewhere after the player has already done the
              // thing reads as the tutorial not noticing.
              if (t.steps[t.currentIndex]?.event === "controls_acknowledged") {
                t.completeEvent("controls_acknowledged");
              }
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
      {/* LIGHT, always — see the note in play.tsx. */}
      {profile === "momentum" ? (
        <ThemeScope value="light">
          <BuildMap overviewOnly />
        </ThemeScope>
      ) : null}
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

/**
 * Clears Spot's TOAST TEXT while the tutorial is on screen, and nothing else.
 *
 * It exists because not rendering HintToast is only half the job. `hint` is a field on the game
 * store, not a prop, so a line set during the tutorial simply sits there — and the next screen that
 * DOES mount a toast (play.tsx) would pop it on arrival. The player would finish the tutorial, start
 * a real build, and be greeted by a stale "Try: …" about a LACK table they already assembled.
 *
 * NOT `clearHint`, which is the obvious call and the wrong one: it also drops `hintPartId` and
 * `hintGroup`, which are Spot's ghost and its tray flash. Those are the half of Spot the tutorial
 * WANTS — the demonstration is the point, the caption is the duplicate. So this writes the one
 * field, and the markers end on their own timer exactly as they do in a build.
 *
 * A component rather than an effect in TutorialScreen so it can subscribe to `hint` alone; putting
 * the subscription on the screen would re-render the whole HUD every time Spot is pressed.
 */
function SuppressHintText() {
  const hint = useGameStore((s) => s.hint);
  useEffect(() => {
    if (hint) useGameStore.setState({ hint: null });
  }, [hint]);
  return null;
}

export default function TutorialRoute() {
  // Held for one commit while the room hands the engine slot over — see sceneSlot.
  const granted = useSceneSlot("tutorial");
  if (!granted) return null;
  return (
    <FilamentScene>
      <TutorialScreen />
    </FilamentScene>
  );
}