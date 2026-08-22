import { useEffect, useRef, useState } from 'react';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { findNodeHandle, Image, Pressable, StyleSheet, Text, useWindowDimensions, UIManager, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { useTutorialVoice } from '@/src/game/audio/useTutorialVoice';
import {
  TUTORIAL_REWARD_TOKENS,
  TUTORIAL_STEP_REWARD_TOKENS,
  messageForToolStep,
  type ToolTutorialKind,
  type TutorialTargetId,
} from './steps';
import { useTutorialStore } from './store';
import { useTutorialTargets, type TutorialFrame } from './targetRegistry';
import { useTutorialAudio } from './useTutorialAudio';
import { Button } from '@/src/game/ui/system/Button';
import { useGameStore } from '@/src/game/core/store';
import { avatarHeadForProfile } from '@/src/components/avatarAssets';
import { ACCENT_LIGHT, ELEVATION, FONT, RADIUS, TYPE, Theme, useFixedStyles } from "@/src/game/ui/system/theme";
import { tutorialPresentationForProfile } from './presentation';
import { VisualLongPressCue } from './VisualLongPressCue';
import { VisualJoystickCue } from './VisualJoystickCue';
import { VisualSwipeCue } from './VisualSwipeCue';
import { mirror, useHandedness } from "@/src/game/ui/system/handedness";
const PADDING = 0;

interface Props {
  activeToolKind: ToolTutorialKind | null;
  assemblyComplete: boolean;
  earnedXp: number;
  onClaimReward: () => void;
  onPlaceInRoom?: () => void;
  onSimulatePinch?: () => void;
  blocked?: boolean;
  audioEnabled?: boolean;
  focusReturnPrompt?: boolean;
  undoPreviewActive?: boolean;
  onDismissUndoPreview?: () => void;
  /** Lets a repeated physical step follow the currently actionable control. */
  guideTargetOverride?: TutorialTargetId | null;
  guideMessageOverride?: string | null;
}

export function MascotGuideOverlay({
  activeToolKind,
  assemblyComplete,
  earnedXp,
  onClaimReward,
  onPlaceInRoom,
  onSimulatePinch,
  blocked = false,
  audioEnabled = false,
  focusReturnPrompt = false,
  undoPreviewActive = false,
  onDismissUndoPreview,
  guideTargetOverride = null,
  guideMessageOverride = null,
}: Props) {
  const styles = useFixedStyles(makeStyles);
  // Read HERE, above every early return below — this component has eight of them, and a hook called past any one of them changes the hook order between renders.
  const handedness = useHandedness();
  // The tutorial is the most read text in the app.
  const overlayRef = useRef<View>(null);
  const windowSize = useWindowDimensions();
  const [overlaySize, setOverlaySize] = useState<{ width: number; height: number } | null>(null);
  // THE HUD'S AUDIO CHIP, not a switch of its own. It used to be local state behind a button on the
  // bubble, which meant the tutorial's voice and the build's spoken steps were two different mutes
  // in two different places — and the one on the card moved with every step. `settings.audio` is the
  // one the chip beside the gear already flips, and the one the visual profile turns on by default.
  const visualSpeechEnabled = useGameStore((s) => s.settings.audio);
  const width = overlaySize?.width ?? windowSize.width;
  const height = overlaySize?.height ?? windowSize.height;
  const currentIndex = useTutorialStore((s) => s.currentIndex);
  const profile = useGameStore((s) => s.profile);
  const mapOpen = useGameStore((s) => s.mapOpen);
  // HEAD art, not the full body: at 78pt the whole character was a speck.
  const mascotImage = avatarHeadForProfile(profile);
  const presentation = tutorialPresentationForProfile(profile);
  const steps = useTutorialStore((s) => s.steps);
  const phase = useTutorialStore((s) => s.phase);
  const skipped = useTutorialStore((s) => s.skipped);
  const completed = useTutorialStore((s) => s.completed);
  const rewardReady = useTutorialStore((s) => s.rewardReady);
  const settingsReady = useTutorialStore((s) => s.settingsReady);
  const stepRewardReady = useTutorialStore((s) => s.stepRewardReady);
  const attentionOverlayActive = useTutorialStore(
    (s) => s.attentionOverlayActive,
  );
  const lastCompletedStepLabel = useTutorialStore((s) => s.lastCompletedStepLabel);
  const skipSettingsTutorial = useTutorialStore((s) => s.skipSettingsTutorial);
  const dismissStepReward = useTutorialStore((s) => s.dismissStepReward);
  const dismissReward = useTutorialStore((s) => s.dismissReward);
  const frames = useTutorialTargets((s) => s.frames);
  const nodes = useTutorialTargets((s) => s.nodes);
  const setFrame = useTutorialTargets((s) => s.setFrame);
  const step = steps[currentIndex];
  useTutorialAudio(
    step?.audio,
    audioEnabled &&
      !presentation.showVisualDemo &&
      !focusReturnPrompt &&
      !undoPreviewActive &&
      !blocked &&
      !mapOpen &&
      !attentionOverlayActive &&
      !skipped &&
      !completed &&
      !rewardReady,
  );

  // LUMI'S VOICE. A recorded clip where the step has one, expo-speech where it does not — see
  // game/audio/useTutorialVoice. This used to synthesise every line unconditionally; the gating
  // below is unchanged, and only what happens once a step qualifies is different.
  //
  // The grip step is silent, as before. Its card is a full-screen coach with its own art and its own
  // "Got it" button (GripCoach), and the mascot's bubble is not even up yet — so the line was read
  // aloud over a screen that showed no bubble to read it from. Passing `undefined` as the step id is
  // what keeps it that way: the hook silences both voices rather than falling back to speaking it.
  const spokenStepId =
    presentation.showVisualDemo && step && step.id !== GRIP_STEP_ID
      ? step.id
      : undefined;
  const spokenMessage = step
    ? visualMessageForStep(
        step.id,
        guideMessageOverride ?? step.shortLabel ?? step.message,
      )
    : '';
  // NOT GATED ON `blocked`. That flag means the card has been collapsed out of the way because the
  // player has picked a part up and the bubble would sit over the tray they are reaching into — the
  // guidance is hidden, not cancelled. Silencing the line there took the instruction away at the
  // exact moment the player was carrying it out, on the profile that relies on hearing it. The
  // OVERLAY still returns null for `blocked` (see below); only the voice carries on.
  useTutorialVoice(
    spokenStepId,
    spokenMessage,
    visualSpeechEnabled &&
      !focusReturnPrompt &&
      !undoPreviewActive &&
      !mapOpen &&
      !attentionOverlayActive &&
      !skipped &&
      !completed &&
      !rewardReady,
  );

  // THE GRIP STEP IS NOT NUMBERED. It teaches how to hold the device, not how to use a control, and
  // it is acknowledged by a button rather than by doing anything — so counting it made the first
  // real instruction "2/10" and set the player's expectation one higher than the tutorial delivers.
  //
  // Both halves shift together: it comes out of the denominator as well as the numerator, so the
  // long-press step reads 1 of 9 rather than 1 of 10.
  const gripIndex = steps.findIndex((s) => s.id === GRIP_STEP_ID);
  const countedSteps = gripIndex >= 0 ? steps.length - 1 : steps.length;
  const stepNumber =
    gripIndex >= 0 && currentIndex > gripIndex ? currentIndex : currentIndex + 1;

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width: nextWidth, height: nextHeight } = event.nativeEvent.layout;
    if (nextWidth <= 0 || nextHeight <= 0) return;
    setOverlaySize((prev) =>
      prev && Math.abs(prev.width - nextWidth) < 1 && Math.abs(prev.height - nextHeight) < 1
        ? prev
        : { width: nextWidth, height: nextHeight },
    );
  };

  useEffect(() => {
    if (!stepRewardReady) return;
    const timeout = setTimeout(dismissStepReward, 900);
    return () => clearTimeout(timeout);
  }, [dismissStepReward, stepRewardReady]);

  useEffect(() => {
    if (!overlaySize || skipped || completed || rewardReady) return;
    const step = steps[currentIndex];
    const targetId = undoPreviewActive
      ? 'assemblyArea'
      : focusReturnPrompt
        ? 'focus'
        : guideTargetOverride ?? step?.targetId;
    const targetNode = targetId ? nodes[targetId] : null;
    const overlayNode = findNodeHandle(overlayRef.current);
    if (!step || !targetId || !overlayNode || !targetNode) return;

    // Filament adds native containers whose layout origin is not the visual origin of the overlay. Window coordinates are global, so subtracting the overlay's window origin gives a frame that the cutout and border share.
    const measureTarget = () => {
      UIManager.measureInWindow(overlayNode, (overlayX, overlayY) => {
        UIManager.measureInWindow(targetNode, (targetX, targetY, measuredWidth, measuredHeight) => {
          if (measuredWidth > 0 && measuredHeight > 0) {
            setFrame(targetId, {
              x: targetX - overlayX,
              y: targetY - overlayY,
              width: measuredWidth,
              height: measuredHeight,
            });
          }
        });
      });
    };

    measureTarget();
    const retry = setTimeout(measureTarget, 80);
    return () => clearTimeout(retry);
  }, [completed, currentIndex, focusReturnPrompt, guideTargetOverride, nodes, overlaySize, rewardReady, setFrame, skipped, steps, undoPreviewActive]);

  // The pause button opens the same build-map modal used by a normal task.
  // Hide tutorial chrome while it is open so the shared modal remains the
  // only interactive layer and its close/resume behaviour stays unchanged.
  //
  // `blocked` DOES NOT APPLY ONCE THE TUTORIAL IS OVER. It means "the step guide is collapsed
  // because the player is mid-gesture on the tray" — a reason to hide an instruction, never a reason
  // to withhold the reward. And it does not clear itself here: the screen resets it when the step ID
  // changes, which never happens on the last step, because finishing the fourth leg ends the
  // tutorial instead of advancing it. So a player who picked up that leg — which is the only way to
  // install it — had `blocked` stuck true and got no completion card at all.
  const finished = settingsReady || rewardReady;
  if (skipped || mapOpen || attentionOverlayActive || (blocked && !finished)) return null;

  if (settingsReady) {
    return (
      <View style={styles.rewardLayer} pointerEvents="box-none" onLayout={handleLayout}>
        <View style={styles.rewardCard} pointerEvents="auto">
          <Image source={mascotImage} style={styles.rewardMascot} resizeMode="contain" />
          <View style={styles.rewardCopy}>
            <Text style={styles.rewardTitle}>Core skills complete!</Text>
            <Text style={styles.rewardMessage}>
              Your LACK table is ready for its first home.
            </Text>
            <View style={styles.rewardXpRow}>
              <Image
                source={require("@/src/assets/ui/icons/icon-xp.png")}
                style={styles.rewardXpIcon}
                resizeMode="contain"
              />
              <Text style={styles.rewardXpValue}>+{earnedXp} XP</Text>
            </View>
            <View style={styles.settingsActions}>
              <Button
                label="Place LACK in my room"
                variant="primary"
                small
                style={styles.primaryAction}
                onPress={() => {
                  skipSettingsTutorial();
                  onPlaceInRoom?.();
                }}
              />
            </View>
          </View>
        </View>
      </View>
    );
  }

  if (rewardReady && !assemblyComplete) {
    return null;
  }

  if (rewardReady && assemblyComplete) {
    return (
      <View style={styles.rewardLayer} pointerEvents="box-none" onLayout={handleLayout}>
        <View style={styles.rewardCard} pointerEvents="auto">
          <Image source={mascotImage} style={styles.rewardMascot} resizeMode="contain" />
          <View style={styles.rewardCopy}>
            <Text style={styles.rewardTitle}>Tutorial completed!</Text>
            <Text style={styles.rewardMessage}>Your LACK table is ready for its first home.</Text>
            {/* XP on the left, the CTA on the right, sharing one baseline row. */}
            <View style={styles.rewardActionRow}>
              <View style={styles.rewardXpRow}>
                <Image
                  source={require("@/src/assets/ui/icons/icon-xp.png")}
                  style={styles.rewardXpIcon}
                  resizeMode="contain"
                />
                <Text style={styles.rewardXpValue}>+{TUTORIAL_REWARD_TOKENS}</Text>
              </View>
              <Button
                label="Place LACK in my room"
                variant="primary"
                small
                onPress={() => {
                  const tutorial = useTutorialStore.getState();
                  if (!tutorial.completed || tutorial.currentIndex !== tutorial.steps.length - 1) return;
                  onClaimReward();
                  dismissReward();
                  onPlaceInRoom?.();
                }}
              />
            </View>
          </View>
        </View>
      </View>
    );
  }

  if (completed) return null;

  if (!step) return null;

  if (!overlaySize) return <View ref={overlayRef} style={styles.layer} pointerEvents="none" onLayout={handleLayout} />;

  const activeTargetId = undoPreviewActive
    ? 'assemblyArea'
    : focusReturnPrompt
      ? 'focus'
      : guideTargetOverride ?? step.targetId;
  const rawFrame = frames[activeTargetId];
  // Targets can briefly unmount while the assembly advances (notably when the
  // Allen key step hands over to the leg step). Do not manufacture a fallback message for that gap: it flashes for a frame and competes with the next cue.
  if (!rawFrame) {
    return <View ref={overlayRef} style={styles.layer} pointerEvents="none" onLayout={handleLayout} />;
  }
  const frame = expandFrame(
    undoPreviewActive
      ? {
          ...rawFrame,
          // The normal assembly target begins beside the joystick. During the
          // wide Undo preview, move only this spotlight farther into the scene
          // so its border does not collide with the joystick control.
          x: rawFrame.x + 48,
        }
      : rawFrame,
    width,
    height,
  );

  const message = undoPreviewActive
      ? 'Undo returns the most recent part without changing your earlier work.'
      : focusReturnPrompt
      ? 'Tap Focus again to return to the tutorial.'
      : guideMessageOverride
      ? guideMessageOverride
      : step.id === 'secure-with-tool'
      ? messageForToolStep(activeToolKind)
      : presentation.reducedText
        ? visualMessageForStep(step.id, step.shortLabel ?? step.message)
        : step.message;
  // UN-MIRROR IN, MIRROR OUT — and both halves are needed.
  //
  // `frame` is the MEASURED rectangle of the control being pointed at, so in left-hand mode it has already crossed the screen with that control. Mirroring only the RESULT therefore flipped a placement that was already correct, and every bubble landed on the far side of the screen from its target.
  //
  // Nor is doing nothing right: the branches below encode a SIDE ("beside the target, to its right", "hard against the left edge"), and a side preference authored for a right-handed HUD has to flip with the HUD. Reflecting the frame back into right-handed space lets that logic run exactly as written, and reflecting its answer back out puts it where a mirrored screen wants it. One reflection at each end, one set of placement rules in the middle.
  // Null unless this step is one the player READS. The scrim rects below take it: tapping the dimmed
  // area closes the card, and the lit target keeps its own taps.
  // Auto's own measured rectangle, for the second ring above. Undefined on every other step and
  // whenever Auto is not on screen — which is any build that is not __DEV__ or showcase.
  const autoFrame = step.id === 'visual-stuck-help' ? frames['auto'] : undefined;
  // The stuck-help card marks two buttons and dims nothing: greying the screen to say "help lives
  // here" reads as an interruption rather than an offer. The panes still render — see Scrim — they
  // are just invisible, because they are what a tap to continue lands on.
  const dimTarget = step.id !== 'visual-stuck-help';

  const onDismissRead =
    step.event === "controls_acknowledged"
      ? () => useTutorialStore.getState().completeEvent("controls_acknowledged")
      : undefined;

  const placementFrame =
    handedness === "left" ? { ...frame, x: width - frame.x - frame.width } : frame;
  const bubbleStyle = mirror(
    bubblePosition(
      activeTargetId,
      placementFrame,
      width,
      height,
      presentation.showVisualDemo,
      presentation.showMomentumCompanion,
    ),
    handedness,
  );

  return (
    <View ref={overlayRef} style={styles.layer} pointerEvents="box-none" onLayout={handleLayout}>
      {undoPreviewActive && onDismissUndoPreview ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close the Undo preview and continue"
          style={StyleSheet.absoluteFill}
          onPress={onDismissUndoPreview}
        />
      ) : null}
      {frame ? (
        <>
          {step.id === 'stand-table-upright' ? null : (
            <>
              {/* On a READ-ONLY step these four become the dismiss surface, and the hole between them
                  stays live — which is the point. The whole-screen Pressable that did this before
                  covered the very buttons the card was describing, so "Press Undo to go back, or
                  Recenter to adjust the view" pointed at two controls that could not be pressed.
                  The scrim already has the shape we need: everything except the target. */}
              <Scrim style={{ left: 0, top: 0, right: 0, height: frame.y }} onDismiss={onDismissRead} dim={dimTarget} styles={styles} />
              <Scrim style={{ left: 0, top: frame.y, width: frame.x, height: frame.height }} onDismiss={onDismissRead} dim={dimTarget} styles={styles} />
              <Scrim
                style={{ left: frame.x + frame.width, top: frame.y, right: 0, height: frame.height }}
                onDismiss={onDismissRead}
                dim={dimTarget}
                styles={styles}
              />
              <Scrim
                style={{ left: 0, top: frame.y + frame.height, right: 0, bottom: 0 }}
                onDismiss={onDismissRead}
                dim={dimTarget}
                styles={styles}
              />
              <View
                pointerEvents="none"
                style={[
                  styles.highlight,
                  presentation.emphasizeTarget && styles.highlightEmphasized,
                  { left: frame.x, top: frame.y, width: frame.width, height: frame.height },
                ]}
              />
            </>
          )}
          {/* Keyed on BOTH ids. Lumi's own list renamed this step to `visual-pickup-and-place` when
              pick-up and drag were merged, and the cue — the arrow over the tray — went quiet the
              moment it did, because nothing here matched any more. The composed profiles still use
              the old id, so both have to be listed. */}
          {/* The SECOND ring, on Auto. This step names two buttons and they sit at opposite ends of
              the toggles row with Focus between, so one rectangle cannot hold just the two — it
              would light Focus as well. Two rings and no dimming instead: both named controls are
              marked, the one between them is not, and nothing else on screen is greyed out for a
              card that is only telling the player where help lives. */}
          {step.id === 'visual-stuck-help' && autoFrame ? (
            <View
              pointerEvents="none"
              style={[
                styles.highlight,
                { left: autoFrame.x, top: autoFrame.y, width: autoFrame.width, height: autoFrame.height },
              ]}
            />
          ) : null}
          {/* The arrow, on every step that asks the player to take something OUT OF THE TRAY. That is
              two steps: the first part and the first bolt. Both begin with the same long-press on the
              same column, so both want the same cue — it was keyed to the first step alone, which
              taught the gesture once and then left the player to remember it a few screens later.

              NOT `install-four-legs`. That step is "Continue assembling": the teaching is over, the
              player has already long-pressed the tray twice, and the step spans the whole rest of the
              build rather than one action. An arrow pinned over the tray for all of it points at a
              gesture they have shown they know, on top of the card and the part they are choosing
              between. The two steps above are where the cue earns its place. */}
          {!undoPreviewActive &&
          presentation.showVisualDemo &&
          (step.id === 'long-press-part' ||
            step.id === 'visual-pickup-and-place' ||
            step.id === 'place-connector') ? (
            <VisualLongPressCue frame={frame} />
          ) : null}
          {!undoPreviewActive && presentation.showVisualDemo && step.id === 'view-under-table' ? (
            <VisualJoystickCue frame={frame} />
          ) : null}
          {!undoPreviewActive && presentation.showVisualDemo && step.id === 'stand-table-upright' ? (
            <VisualSwipeCue frame={frame} />
          ) : null}
        </>
      ) : null}
      <View style={[styles.bubble, bubbleStyle]} pointerEvents="box-none">
        {!presentation.showMomentumCompanion ? (
          <View style={styles.mascotPortrait}>
            {/* White at the centre falling to cream at the rim — the same pool of light the hint
                toast uses, so one character reads identically in both places. SVG because RN has no
                radial gradient. */}
            <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
              <Defs>
                <RadialGradient id="mascotglow" cx="50%" cy="45%" r="65%">
                  <Stop offset="0" stopColor="#FFFFFF" />
                  <Stop offset="1" stopColor="#EADFCB" />
                </RadialGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#mascotglow)" />
            </Svg>
            <Image
              source={mascotImage}
              style={styles.mascotPortraitImage}
              resizeMode="cover"
            />
          </View>
        ) : null}
        <View style={styles.copy} pointerEvents="box-none">
          <Text style={styles.stepText}>
            {undoPreviewActive
              ? 'UNDO PREVIEW'
              : focusReturnPrompt
              ? 'FOCUS'
              : `${phase === 'settings' || step.targetId === 'settings' ? 'SETTINGS · ' : ''}${stepNumber}/${countedSteps}`}
          </Text>
          {/* NO voice button on the card. Muting is a property of the SCREEN, not of one step, and a
              toggle that moves with the bubble means hunting for it — the HUD's own audio chip sits
              in the same place on every step and every screen. `visualSpeechEnabled` below is still
              the switch; the chip is what flips it now. */}
          <View style={styles.messageRow}>
            <Text style={[styles.message, { fontFamily: FONT }, presentation.showVisualDemo && styles.visualMessage]}>
              {message}
            </Text>
          </View>
          {presentation.showVisualDemo && currentIndex === 0 && !focusReturnPrompt && !undoPreviewActive ? (
            <Text style={styles.audioTip}>
              {visualSpeechEnabled
                ? 'Audio guidance is on. Tap the speaker to turn it off. Take your time.'
                : 'Audio guidance is off. Tap the speaker to turn it on again.'}
            </Text>
          ) : null}
          <View
            style={styles.actions}
            pointerEvents={step.id === 'pinch-to-zoom' && onSimulatePinch ? 'auto' : 'none'}
          >
            <Text style={styles.actionHint}>
              {undoPreviewActive
                ? 'Tap anywhere to continue.'
                : focusReturnPrompt
                ? 'Tap the highlighted Focus button.'
                : presentation.reducedText
                  ? step.id === 'long-press-part' || step.id === 'visual-pickup-and-place'
                    ? 'Press and hold.'
                    : step.id === 'view-under-table'
                      ? 'Move the joystick.'
                      : 'Follow the highlighted target.'
                  : 'Complete the highlighted action to continue.'}
            </Text>
            {step.id === 'pinch-to-zoom' && onSimulatePinch ? (
              <Button label="Computer: test zoom" small onPress={onSimulatePinch} />
            ) : null}
          </View>
        </View>
      </View>
      {!focusReturnPrompt && !undoPreviewActive && stepRewardReady && presentation.showMilestoneConfirmation ? (
        <View style={styles.stepRewardToast} pointerEvents="none">
          <Text style={styles.stepRewardText}>
            Milestone complete · Step {lastCompletedStepLabel} · +{TUTORIAL_STEP_REWARD_TOKENS}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The visual profile's wording for a step — now a passthrough.
 *
 * It used to hold a short form per step id, from when the visual run shared the other profiles'
 * steps and needed terser copy against them. Lumi has its own list since (VISUAL_TUTORIAL_STEPS),
 * written at the length it should be spoken and shown, so overriding it here would replace those
 * sentences with three-word stubs — including on the steps the two lists still share by id, which is
 * exactly how "Turn clockwise" would have survived a rewrite of "Turn clockwise to tighten the bolt
 * by hand."
 *
 * Kept as a function rather than deleted: it is called in two places, and it is the hook to hang a
 * per-step spoken variant on if the bubble text and the voice line ever need to differ.
 */
/**
 * One pane of the spotlight's dim. A Pressable only when the step is one to READ — otherwise it
 * stays `pointerEvents="none"` exactly as before, so a step that asks for a gesture never has a
 * swallow-everything layer over the scene.
 */
function Scrim({
  style,
  onDismiss,
  dim = true,
  styles,
}: {
  style: ViewStyle;
  onDismiss?: () => void;
  /** False draws the pane INVISIBLE but still present. The stuck-help step highlights two buttons
   *  and greys nothing — but the panes are what a tap lands on, so removing them removed the only
   *  way to dismiss the card. Transparent and tappable is the shape that step needs. */
  dim?: boolean;
  styles: { scrim: ViewStyle };
}) {
  const paint = dim ? styles.scrim : { position: 'absolute' as const };
  if (!onDismiss) return <View pointerEvents="none" style={[paint, style]} />;
  return (
    <Pressable
      style={[paint, style]}
      onPress={onDismiss}
      accessibilityRole="button"
      accessibilityLabel="Continue"
    />
  );
}

/** The mascot bubble's width — the CARD and the placement maths both, which is why it is one
 *  constant rather than two 286s that have to be remembered together.
 *
 *  372, up from 286. The visual profile's copy is written as full sentences and its type is a point
 *  larger than the other profiles', so a step like "Tap Focus to reduce the screen to the controls
 *  you need, and tap it again to show UI." ran to four and five lines in a card sized for terse ones.
 *
 *  Sized to the LONGEST step in Lumi's run rather than picked: at 372 that step is the one that just
 *  fits in three lines, and three is the ceiling worth having — past it the card starts covering the
 *  control it is pointing at. 340 left it at four; 360 is the true minimum and this keeps a little
 *  slack for a reworded step.
 *
 *  Bounded by the screen, not by taste: the placement below insets it 16 from either edge, so on the
 *  narrowest phone this app supports (~640 landscape) the card and its two margins still fit. */
const BUBBLE_W = 372;


/** The grip step's id, in one place: it is special-cased twice above — not numbered, not spoken. */
const GRIP_STEP_ID = 'hold-like-controller';

function visualMessageForStep(_stepId: string, fallback: string): string {
  return fallback;
}

function expandFrame(frame: TutorialFrame, screenW: number, screenH: number): TutorialFrame {
  const x = Math.max(8, frame.x - PADDING);
  const y = Math.max(8, frame.y - PADDING);
  const width = Math.max(1, Math.min(screenW - x - 8, frame.width + PADDING * 2));
  const height = Math.max(1, Math.min(screenH - y - 8, frame.height + PADDING * 2));
  return { x, y, width, height };
}

function bubblePosition(
  targetId: string,
  frame: TutorialFrame,
  screenW: number,
  screenH: number,
  visualMode = false,
  momentumMode = false,
) {
  const bubbleW = BUBBLE_W;
  const edge = 16;
  const left = Math.min(Math.max(edge, frame.x), Math.max(edge, screenW - bubbleW - edge));
  const targetCoversMostScreen = frame.width > screenW * 0.72 || frame.height > screenH * 0.6;

  // The final stand-upright instruction uses the same placement in every
  // profile. Keeping this outside the profile-specific branches prevents the
  // Momentum bubble from drifting above the swipe card while Visual places it
  // beside that same control.
  if (targetId === 'beatControl') {
    return {
      right: Math.max(edge, screenW - frame.x + 18),
      top: Math.max(edge, Math.min(frame.y, screenH - 220)),
    };
  }

  // Visual guidance belongs beside the real control it describes. These placements keep a fixed gap around the registered target so the bubble cannot intercept the action required to advance the tutorial.
  if (visualMode && targetId === 'partsTray') {
    return {
      right: Math.max(edge, screenW - frame.x + 18),
      top: Math.max(edge, Math.min(frame.y, screenH - 260)),
    };
  }
  if (visualMode && targetId === 'tool') {
    return {
      right: Math.max(edge, screenW - frame.x + 18),
      top: Math.max(
        edge,
        Math.min(frame.y + frame.height / 2 - 120, screenH - 280),
      ),
    };
  }
  if (visualMode && targetId === 'joystick') {
    // DIRECTLY ABOVE the stick, not beside it. Beside meant to its right, which is the middle of the
    // screen — the bubble sat over the model the player is about to rotate, so the instruction hid
    // the thing it was asking them to look at. Above the stick it is over empty canvas, and the
    // thumb that works the joystick never crosses it.
    return {
      left: Math.max(edge, Math.min(frame.x, screenW - bubbleW - edge)),
      bottom: Math.max(edge, screenH - frame.y + 18),
    };
  }
  if (targetId === 'stuckHelp') {
    // Above the row it lights, left-aligned to it. The row runs along the bottom-right, so the
    // generic rule below would clamp the card over the parts tray — the same trap the focus step
    // fell into.
    return {
      left: Math.max(edge, Math.min(frame.x, screenW - bubbleW - edge)),
      bottom: Math.max(edge, screenH - frame.y + 18),
    };
  }
  if (visualMode && targetId === 'focus') {
    // DIRECTLY ABOVE the Focus chip. Left-aligned to the chip rather than to the screen: hard left
    // put the card across the canvas with nothing under it to explain, and the generic rule below
    // put it over the parts tray. Above its own control it points at what it names, and the clamp
    // keeps it on screen when the chip sits near the right edge.
    return {
      left: Math.max(edge, Math.min(frame.x, screenW - bubbleW - edge)),
      bottom: Math.max(edge, screenH - frame.y + 18),
    };
  }
  if (visualMode && targetId === 'assemblyArea') {
    return {
      left: edge,
      top: Math.max(84, Math.min(frame.y, screenH - 190)),
    };
  }

  // Momentum's tool is supplied automatically, so its instruction belongs
  // beside the real turn control rather than in a remote corner of the HUD.
  if (momentumMode && targetId === 'tool') {
    const gap = 18;
    const roomOnRight = screenW - frame.x - frame.width - edge;
    const adjacentLeft =
      roomOnRight >= bubbleW + gap
        ? frame.x + frame.width + gap
        : frame.x - bubbleW - gap;
    return {
      left: Math.max(edge, Math.min(adjacentLeft, screenW - bubbleW - edge)),
      top: Math.max(
        edge,
        Math.min(frame.y + frame.height / 2 - 82, screenH - 190),
      ),
    };
  }

  if (targetId === 'scene') {
    return { left: 72, top: Math.min(Math.max(88, screenH * 0.32), screenH - 176) };
  }
  if (targetId === 'joystick') {
    return { left: Math.min(screenW - bubbleW - edge, frame.x + frame.width + 18), bottom: 56 };
  }
  if (targetId === 'recenter') {
    return { left: Math.min(screenW - bubbleW - edge, frame.x + frame.width + 18), bottom: 156 };
  }
  if (targetId === 'settings') {
    return {
      left: Math.min(screenW - bubbleW - edge, frame.x + frame.width + 18),
      top: Math.max(20, frame.y),
    };
  }
  if (targetId === 'assemblyArea' || targetCoversMostScreen) {
    return { left: edge, top: 92 };
  }
  if (targetId === 'partsTray') {
    return { right: Math.max(edge, screenW - frame.x + 14), top: Math.max(84, frame.y) };
  }
  if (targetId === 'tool') {
    const gap = 18;
    const roomOnRight = screenW - frame.x - frame.width - edge;
    const adjacentLeft =
      roomOnRight >= bubbleW + gap
        ? frame.x + frame.width + gap
        : frame.x - bubbleW - gap;
    return {
      left: Math.max(edge, Math.min(adjacentLeft, screenW - bubbleW - edge)),
      top: Math.max(
        edge,
        Math.min(frame.y + frame.height / 2 - 82, screenH - 190),
      ),
    };
  }

  const canPlaceBelow = frame.y + frame.height + 16 < screenH - 150;
  if (canPlaceBelow) return { top: frame.y + frame.height + 16, left };
  return { bottom: Math.max(20, screenH - frame.y + 16), left };
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    layer: { ...StyleSheet.absoluteFillObject, zIndex: 50 },
    scrim: { position: 'absolute', backgroundColor: t.scrim },
    // Green ring = "you did this here": completion colour marks the highlighted control.
    highlight: {
      position: 'absolute',
      borderRadius: 18,
      borderWidth: 3,
      borderColor: ACCENT_LIGHT,
      backgroundColor: 'rgba(255,255,255,0.08)',
    },
    highlightEmphasized: {
      borderWidth: 5,
      backgroundColor: 'rgba(118,230,219,0.22)',
    },
    bubble: {
      position: 'absolute',
      width: BUBBLE_W,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    mascotPortrait: {
      width: 88,
      height: 88,
      borderRadius: 16,
      borderWidth: 3,
      borderColor: t.surface,
      // Only the corners the gradient's square Rect can't reach — matched to its OUTER stop.
      backgroundColor: '#EADFCB',
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    // OVER 100%, same reason as the hint toast's tile: the head art has its own padding, so filling
    // the frame exactly still left the face small. The overflow is cropped by the tile.
    mascotPortraitImage: { width: '124%', height: '124%' },
    copy: {
      flex: 1,
      backgroundColor: t.surface,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: t.border,
      ...ELEVATION.card,
    },
    // paddingRight clears the voice button's corner: the counter shares that line, and "SETTINGS · 2/9"
    // is long enough to run under it.
    stepText: { color: t.success, fontSize: 11, fontWeight: '800', marginBottom: 4, paddingRight: 30 },
    // Absolute, so it never shifts with the message's line count. Inset to the card's own padding.
    voiceSlot: { position: 'absolute', top: 8, right: 10, zIndex: 2 },
    // flex + minWidth 0: without them a long line ran out of the card in visual mode, where a demo
    // cue shares the row.
    message: { flex: 1, minWidth: 0, color: t.text, fontSize: 14, lineHeight: 19, fontWeight: '700' },
    messageRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    visualMessage: {
      flex: 1,
      minWidth: 0,
      fontSize: 15,
      lineHeight: 19,
      fontWeight: '800',
    },
    audioTip: {
      marginTop: 7,
      color: t.textDim,
      fontSize: 10,
      lineHeight: 14,
      fontWeight: '700',
    },
    actions: { marginTop: 8, gap: 7, alignItems: 'flex-start' },
    settingsActions: {
      marginTop: 12,
      flexDirection: 'row',
      gap: 14,
      alignItems: 'center',
    },
    actionHint: { color: t.textDim, fontSize: 11, lineHeight: 15, fontWeight: '700' },
    skipText: { color: t.textDim, fontSize: 12, fontWeight: '700' },
    stepRewardToast: {
      position: 'absolute',
      top: 72,
      alignSelf: 'center',
      backgroundColor: t.surface,
      borderColor: t.border,
      borderWidth: StyleSheet.hairlineWidth * 2,
      borderRadius: RADIUS.control,
      paddingHorizontal: 14,
      paddingVertical: 8,
      ...ELEVATION.card,
    },
    // Gold = earned: the token toast text carries the XP colour on the plain surface.
    stepRewardText: { color: t.gold, fontSize: 13, fontWeight: '800' },
    rewardLayer: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 60,
      backgroundColor: t.scrim,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    rewardCard: {
      width: '100%',
      maxWidth: 420,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: t.bg,
      borderColor: t.border,
      borderWidth: StyleSheet.hairlineWidth * 2,
      borderRadius: RADIUS.panel,
      padding: 16,
      ...ELEVATION.card,
    },
    rewardMascot: { width: 104, height: 84, borderRadius: 16, backgroundColor: t.surface },
    rewardCopy: { flex: 1 },
    rewardTitle: { fontSize: 20, fontWeight: '800', color: t.text },
    rewardMessage: { marginTop: 5, fontSize: 14, lineHeight: 19, fontWeight: '600', color: t.textDim },
    rewardActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 12,
    },
    rewardXpRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    rewardXpValue: { ...TYPE.numeric, fontSize: 18, color: t.gold },
    primaryAction: { alignSelf: 'flex-start' },
    laterAction: {
      minHeight: 36,
      paddingHorizontal: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rewardXpIcon: { width: 24, height: 24 },
    // Positioning only — the shared Button owns the primary action's fill and label.
  });