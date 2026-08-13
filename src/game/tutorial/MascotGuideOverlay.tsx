import { useEffect, useRef, useState } from 'react';
import { findNodeHandle, Image, Pressable, StyleSheet, Text, useWindowDimensions, UIManager, View, type LayoutChangeEvent } from 'react-native';
import * as Speech from 'expo-speech';
import {
  TUTORIAL_REWARD_TOKENS,
  TUTORIAL_STEP_REWARD_TOKENS,
  messageForToolStep,
  type ToolTutorialKind,
} from './steps';
import { useTutorialStore } from './store';
import { useTutorialTargets, type TutorialFrame } from './targetRegistry';
import { useTutorialAudio } from './useTutorialAudio';
import { Button } from '@/src/game/ui/system/Button';
import { useGameStore } from '@/src/game/core/store';
import { avatarForProfile } from '@/src/components/avatarAssets';
import { ACCENT_LIGHT, ELEVATION, RADIUS, Theme, TYPE, useFixedStyles, useReadingFont } from "@/src/game/ui/system/theme";
import { tutorialPresentationForProfile } from './presentation';
import { VisualLongPressCue } from './VisualLongPressCue';
import { VisualJoystickCue } from './VisualJoystickCue';
import { VoiceButton } from '@/src/game/ui/hud/VoiceButton';
const PADDING = 0;

interface Props {
  activeToolKind: ToolTutorialKind | null;
  assemblyComplete: boolean;
  earnedXp: number;
  onClaimReward: () => void;
  onContinueToAssembly?: () => void;
  onDeferAssembly?: () => void;
  onSimulatePinch?: () => void;
  blocked?: boolean;
  audioEnabled?: boolean;
}

export function MascotGuideOverlay({
  activeToolKind,
  assemblyComplete,
  earnedXp,
  onClaimReward,
  onContinueToAssembly,
  onDeferAssembly,
  onSimulatePinch,
  blocked = false,
  audioEnabled = false,
}: Props) {
  const styles = useFixedStyles(makeStyles);
  // The tutorial is the most read text in the app.
  const readingFont = useReadingFont();
  const overlayRef = useRef<View>(null);
  const windowSize = useWindowDimensions();
  const [overlaySize, setOverlaySize] = useState<{ width: number; height: number } | null>(null);
  const [visualSpeechEnabled, setVisualSpeechEnabled] = useState(true);
  const width = overlaySize?.width ?? windowSize.width;
  const height = overlaySize?.height ?? windowSize.height;
  const currentIndex = useTutorialStore((s) => s.currentIndex);
  const profile = useGameStore((s) => s.profile);
  const mapOpen = useGameStore((s) => s.mapOpen);
  const mascotImage = avatarForProfile(profile);
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
      !blocked &&
      !mapOpen &&
      !attentionOverlayActive &&
      !skipped &&
      !completed &&
      !rewardReady,
  );

  useEffect(() => {
    if (
      !presentation.showVisualDemo ||
      !visualSpeechEnabled ||
      blocked ||
      mapOpen ||
      attentionOverlayActive ||
      skipped ||
      completed ||
      rewardReady ||
      !step
    ) {
      Speech.stop();
      return;
    }
    const spokenMessage = visualMessageForStep(
      step.id,
      step.shortLabel ?? step.message,
    );
    Speech.stop();
    Speech.speak(spokenMessage, { rate: 0.82 });
    return () => {
      Speech.stop();
    };
  }, [
    attentionOverlayActive,
    blocked,
    mapOpen,
    completed,
    currentIndex,
    presentation.showVisualDemo,
    rewardReady,
    skipped,
    step,
    visualSpeechEnabled,
  ]);

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
    const targetNode = step ? nodes[step.targetId] : null;
    const overlayNode = findNodeHandle(overlayRef.current);
    if (!step || !overlayNode || !targetNode) return;

    // Filament adds native containers whose layout origin is not the visual origin of the overlay. Window coordinates are global, so subtracting the overlay's window origin gives a frame that the cutout and border share.
    const measureTarget = () => {
      UIManager.measureInWindow(overlayNode, (overlayX, overlayY) => {
        UIManager.measureInWindow(targetNode, (targetX, targetY, measuredWidth, measuredHeight) => {
          if (measuredWidth > 0 && measuredHeight > 0) {
            setFrame(step.targetId, {
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
  }, [completed, currentIndex, nodes, overlaySize, rewardReady, setFrame, skipped, steps]);

  // The pause button opens the same build-map modal used by a normal task.
  // Hide tutorial chrome while it is open so the shared modal remains the
  // only interactive layer and its close/resume behaviour stays unchanged.
  if (skipped || blocked || mapOpen || attentionOverlayActive) return null;

  if (settingsReady) {
    return (
      <View style={styles.rewardLayer} pointerEvents="box-none" onLayout={handleLayout}>
        <View style={styles.rewardCard} pointerEvents="auto">
          <Image source={mascotImage} style={styles.rewardMascot} resizeMode="contain" />
          <View style={styles.rewardCopy}>
            <Text style={styles.rewardTitle}>Core skills complete!</Text>
            <Text style={styles.rewardMessage}>
              Ready to enter your assembly task?
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
                label="Enter assembly task"
                variant="primary"
                small
                style={styles.primaryAction}
                onPress={() => {
                  skipSettingsTutorial();
                  onContinueToAssembly?.();
                }}
              />
              <Pressable
                onPress={() => {
                  skipSettingsTutorial();
                  onDeferAssembly?.();
                }}
                style={styles.laterAction}
                hitSlop={8}
              >
                <Text style={styles.skipText}>Later</Text>
              </Pressable>
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
            <Text style={styles.rewardMessage}>Now entering the assembly task.</Text>
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
                label="Enter assembly task"
                variant="primary"
                small
                onPress={() => {
                  const tutorial = useTutorialStore.getState();
                  if (!tutorial.completed || tutorial.currentIndex !== tutorial.steps.length - 1) return;
                  onClaimReward();
                  dismissReward();
                  onContinueToAssembly?.();
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

  const rawFrame = frames[step.targetId];
  // Targets can briefly unmount while the assembly advances (notably when the
  // Allen key step hands over to the leg step). Do not manufacture a fallback message for that gap: it flashes for a frame and competes with the next cue.
  if (!rawFrame) {
    return <View ref={overlayRef} style={styles.layer} pointerEvents="none" onLayout={handleLayout} />;
  }
  const frame = expandFrame(rawFrame, width, height);

  // The finishing beat already has its own swipe card. In Visual mode a second mascot bubble repeats the same instruction and obscures the furniture.
  if (presentation.showVisualDemo && step.id === 'stand-table-upright') {
    return <View ref={overlayRef} style={styles.layer} pointerEvents="none" onLayout={handleLayout} />;
  }

  const message = step.id === 'secure-with-tool'
      ? messageForToolStep(activeToolKind)
      : presentation.reducedText
        ? visualMessageForStep(step.id, step.shortLabel ?? step.message)
        : step.message;
  const bubbleStyle = bubblePosition(
    step.targetId,
    frame,
    width,
    height,
    presentation.showVisualDemo,
    presentation.showMomentumCompanion,
  );

  return (
    <View ref={overlayRef} style={styles.layer} pointerEvents="box-none" onLayout={handleLayout}>
      {frame ? (
        <>
          <View pointerEvents="none" style={[styles.scrim, { left: 0, top: 0, right: 0, height: frame.y }]} />
          <View pointerEvents="none" style={[styles.scrim, { left: 0, top: frame.y, width: frame.x, height: frame.height }]} />
          <View
            pointerEvents="none"
            style={[styles.scrim, { left: frame.x + frame.width, top: frame.y, right: 0, height: frame.height }]}
          />
          <View
            pointerEvents="none"
            style={[styles.scrim, { left: 0, top: frame.y + frame.height, right: 0, bottom: 0 }]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.highlight,
              presentation.emphasizeTarget && styles.highlightEmphasized,
              { left: frame.x, top: frame.y, width: frame.width, height: frame.height },
            ]}
          />
          {presentation.showVisualDemo && step.id === 'long-press-part' ? (
            <VisualLongPressCue frame={frame} />
          ) : null}
          {presentation.showVisualDemo && step.id === 'view-under-table' ? (
            <VisualJoystickCue frame={frame} />
          ) : null}
        </>
      ) : null}
      <View style={[styles.bubble, bubbleStyle]} pointerEvents="box-none">
        {!presentation.showMomentumCompanion ? (
          <View style={styles.mascotPortrait}>
            <Image
              source={mascotImage}
              style={styles.mascotPortraitImage}
              resizeMode="cover"
            />
          </View>
        ) : null}
        <View style={styles.copy} pointerEvents="box-none">
          <Text style={styles.stepText}>
            {phase === 'settings' || step.targetId === 'settings' ? 'SETTINGS · ' : ''}{currentIndex + 1}/{steps.length}
          </Text>
          <View style={styles.messageRow}>
            <Text style={[styles.message, { fontFamily: readingFont }, presentation.showVisualDemo && styles.visualMessage]}>
              {message}
            </Text>
            {presentation.showVisualDemo ? (
              <VoiceButton
                size="small"
                playing={visualSpeechEnabled}
                onPress={() => {
                  setVisualSpeechEnabled((enabled) => {
                    if (enabled) Speech.stop();
                    return !enabled;
                  });
                }}
              />
            ) : null}
          </View>
          {presentation.showVisualDemo && currentIndex === 0 ? (
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
              {presentation.reducedText
                  ? step.id === 'long-press-part'
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
      {stepRewardReady && presentation.showMilestoneConfirmation ? (
        <View style={styles.stepRewardToast} pointerEvents="none">
          <Text style={styles.stepRewardText}>
            Milestone complete · Step {lastCompletedStepLabel} · +{TUTORIAL_STEP_REWARD_TOKENS}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function visualMessageForStep(stepId: string, fallback: string): string {
  const messages: Record<string, string> = {
    'long-press-part': 'Hold the tabletop',
    'drag-and-snap': 'Move it to the target',
    'view-under-table': 'Rotate to the underside',
    'place-connector': 'Match the bolt to the hole',
    'tighten-connector': 'Turn clockwise',
    'install-four-legs': 'Match each leg to a bolt',
    'stand-table-upright': 'Turn the table upright',
  };
  return messages[stepId] ?? fallback;
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
  const bubbleW = 286;
  const edge = 16;
  const left = Math.min(Math.max(edge, frame.x), Math.max(edge, screenW - bubbleW - edge));
  const targetCoversMostScreen = frame.width > screenW * 0.72 || frame.height > screenH * 0.6;

  // Visual guidance belongs beside the real control it describes. These placements keep a fixed gap around the registered target so the bubble cannot intercept the action required to advance the tutorial.
  if (visualMode && targetId === 'partsTray') {
    return {
      right: Math.max(edge, screenW - frame.x + 18),
      top: Math.max(edge, Math.min(frame.y, screenH - 260)),
    };
  }
  if (visualMode && targetId === 'toolbar') {
    return {
      left: Math.min(
        Math.max(edge, frame.x + frame.width / 2 - bubbleW / 2),
        screenW - bubbleW - edge,
      ),
      bottom: Math.max(edge, screenH - frame.y + 18),
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
    return {
      left: Math.min(screenW - bubbleW - edge, frame.x + frame.width + 18),
      bottom: Math.max(edge, screenH - frame.y - frame.height),
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
      width: 286,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    mascotPortrait: {
      width: 82,
      height: 66,
      borderRadius: 14,
      borderWidth: 3,
      borderColor: t.surface,
      backgroundColor: t.surface,
      overflow: 'hidden',
    },
    mascotPortraitImage: {
      position: 'absolute',
      width: 150,
      height: 150,
      left: -37,
      top: -17,
    },
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
    stepText: { color: t.success, fontSize: 11, fontWeight: '800', marginBottom: 4 },
    message: { color: t.text, fontSize: 14, lineHeight: 19, fontWeight: '700' },
    messageRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    visualMessage: {
      flex: 1,
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