import { useEffect, useRef, useState } from 'react';
import { findNodeHandle, Image, Pressable, StyleSheet, Text, useWindowDimensions, UIManager, View, type LayoutChangeEvent } from 'react-native';
import {
  TUTORIAL_REWARD_TOKENS,
  TUTORIAL_STEP_REWARD_TOKENS,
  messageForToolStep,
  type ToolTutorialKind,
} from './steps';
import { useTutorialStore } from './store';
import { useTutorialTargets, type TutorialFrame } from './targetRegistry';
import { useTutorialAudio } from './useTutorialAudio';
import { Button } from '@/src/game/ui/Button';
import { ELEVATION, RADIUS, Theme, TYPE, useStyles } from '@/src/game/ui/theme';
const mascotImage = require("../../assets/images/mascot/mascot.png");
const PADDING = 0;

interface Props {
  activeToolKind: ToolTutorialKind | null;
  assemblyComplete: boolean;
  onClaimReward: () => void;
  onContinueToAssembly?: () => void;
  onSimulatePinch?: () => void;
  blocked?: boolean;
  audioEnabled?: boolean;
}

export function MascotGuideOverlay({
  activeToolKind,
  assemblyComplete,
  onClaimReward,
  onContinueToAssembly,
  onSimulatePinch,
  blocked = false,
  audioEnabled = false,
}: Props) {
  const styles = useStyles(makeStyles);
  const overlayRef = useRef<View>(null);
  const windowSize = useWindowDimensions();
  const [overlaySize, setOverlaySize] = useState<{ width: number; height: number } | null>(null);
  const width = overlaySize?.width ?? windowSize.width;
  const height = overlaySize?.height ?? windowSize.height;
  const currentIndex = useTutorialStore((s) => s.currentIndex);
  const steps = useTutorialStore((s) => s.steps);
  const phase = useTutorialStore((s) => s.phase);
  const skipped = useTutorialStore((s) => s.skipped);
  const completed = useTutorialStore((s) => s.completed);
  const rewardReady = useTutorialStore((s) => s.rewardReady);
  const settingsReady = useTutorialStore((s) => s.settingsReady);
  const stepRewardReady = useTutorialStore((s) => s.stepRewardReady);
  const lastCompletedStepLabel = useTutorialStore((s) => s.lastCompletedStepLabel);
  const beginSettingsTutorial = useTutorialStore((s) => s.beginSettingsTutorial);
  const skipSettingsTutorial = useTutorialStore((s) => s.skipSettingsTutorial);
  const dismissStepReward = useTutorialStore((s) => s.dismissStepReward);
  const dismissReward = useTutorialStore((s) => s.dismissReward);
  const frames = useTutorialTargets((s) => s.frames);
  const nodes = useTutorialTargets((s) => s.nodes);
  const setFrame = useTutorialTargets((s) => s.setFrame);
  const step = steps[currentIndex];
  useTutorialAudio(
    step?.audio,
    audioEnabled && !blocked && !skipped && !completed && !rewardReady,
  );

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

    // Filament adds native containers whose layout origin is not the visual
    // origin of the overlay. Window coordinates are global, so subtracting the
    // overlay's window origin gives a frame that the cutout and border share.
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

  if (skipped || blocked) return null;

  if (settingsReady) {
    return (
      <View style={styles.rewardLayer} pointerEvents="box-none" onLayout={handleLayout}>
        <View style={styles.rewardCard} pointerEvents="auto">
          <Image source={mascotImage} style={styles.rewardMascot} resizeMode="contain" />
          <View style={styles.rewardCopy}>
            <Text style={styles.rewardTitle}>Core skills complete!</Text>
            <Text style={styles.rewardMessage}>
              Want a quick tour of part return, instructions, Focus mode, and Auto-view?
            </Text>
            <View style={styles.settingsActions}>
              <Button
                label="Personalize settings"
                variant="primary"
                small
                style={styles.primaryAction}
                onPress={beginSettingsTutorial}
              />
              <Pressable onPress={skipSettingsTutorial} hitSlop={8}>
                <Text style={styles.skipText}>Maybe later</Text>
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
  const waitingForTool = step.targetId === 'tool' && !rawFrame;
  if (!rawFrame && !waitingForTool) {
    return <View ref={overlayRef} style={styles.layer} pointerEvents="none" onLayout={handleLayout} />;
  }
  const frame = rawFrame ? expandFrame(rawFrame, width, height) : null;
  const message = waitingForTool
    ? 'Keep assembling. I will show you the tool when the next fastening step is ready.'
    : step.id === 'secure-with-tool'
      ? messageForToolStep(activeToolKind)
      : step.message;
  const bubbleStyle = frame ? bubblePosition(step.targetId, frame, width, height) : { right: 156, bottom: 24 };

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
              { left: frame.x, top: frame.y, width: frame.width, height: frame.height },
            ]}
          />
        </>
      ) : null}
      <View style={[styles.bubble, bubbleStyle]} pointerEvents="box-none">
        <Image source={mascotImage} style={styles.mascot} resizeMode="contain" />
        <View style={styles.copy} pointerEvents="box-none">
          <Text style={styles.stepText}>
            {phase === 'settings' ? 'SETTINGS · ' : ''}{currentIndex + 1}/{steps.length}
          </Text>
          <Text style={styles.message}>{message}</Text>
          <View
            style={styles.actions}
            pointerEvents={step.id === 'pinch-to-zoom' && onSimulatePinch ? 'auto' : 'none'}
          >
            <Text style={styles.actionHint}>
              {waitingForTool ? 'Finish this assembly step to reveal the tool.' : 'Complete the highlighted action to continue.'}
            </Text>
            {step.id === 'pinch-to-zoom' && onSimulatePinch ? (
              <Button label="Computer: test zoom" small onPress={onSimulatePinch} />
            ) : null}
          </View>
        </View>
      </View>
      {stepRewardReady ? (
        <View style={styles.stepRewardToast} pointerEvents="none">
          <Text style={styles.stepRewardText}>
            Step {lastCompletedStepLabel} complete · +{TUTORIAL_STEP_REWARD_TOKENS}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function expandFrame(frame: TutorialFrame, screenW: number, screenH: number): TutorialFrame {
  const x = Math.max(8, frame.x - PADDING);
  const y = Math.max(8, frame.y - PADDING);
  const width = Math.max(1, Math.min(screenW - x - 8, frame.width + PADDING * 2));
  const height = Math.max(1, Math.min(screenH - y - 8, frame.height + PADDING * 2));
  return { x, y, width, height };
}

function bubblePosition(targetId: string, frame: TutorialFrame, screenW: number, screenH: number) {
  const bubbleW = 286;
  const edge = 16;
  const left = Math.min(Math.max(edge, frame.x), Math.max(edge, screenW - bubbleW - edge));
  const targetCoversMostScreen = frame.width > screenW * 0.72 || frame.height > screenH * 0.6;

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
    return { left: edge, bottom: 26 };
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
      borderColor: '#8D7BA8',
      backgroundColor: 'rgba(255,255,255,0.08)',
    },
    bubble: {
      position: 'absolute',
      width: 286,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    mascot: {
      width: 82,
      height: 66,
      borderRadius: 14,
      borderWidth: 3,
      borderColor: t.surface,
      backgroundColor: t.surface,
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
    actions: { marginTop: 8, gap: 7, alignItems: 'flex-start' },
    settingsActions: { marginTop: 12, gap: 10, alignItems: 'flex-start' },
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
    primaryAction: { marginTop: 12, alignSelf: 'flex-start' },
    rewardXpIcon: { width: 24, height: 24 },
    // Positioning only — the shared Button owns the primary action's fill and label.
  });