import { useEffect, useRef, useState } from 'react';
import { findNodeHandle, Image, Pressable, StyleSheet, Text, useWindowDimensions, UIManager, View, type LayoutChangeEvent } from 'react-native';
import {
  TUTORIAL_REWARD_TOKENS,
  TUTORIAL_STEP_REWARD_TOKENS,
  TUTORIAL_STEPS,
  messageForToolStep,
  type ToolTutorialKind,
} from './steps';
import { useTutorialStore } from './store';
import { useTutorialTargets, type TutorialFrame } from './targetRegistry';
import { useGameStore } from '../game/store';

const mascotImage = require('../assets/mascot/mascot.png');
const PADDING = 0;

interface Props {
  activeToolKind: ToolTutorialKind | null;
  onClaimReward: () => void;
  onContinueToAssembly?: () => void;
}

export function MascotGuideOverlay({ activeToolKind, onClaimReward, onContinueToAssembly }: Props) {
  const overlayRef = useRef<View>(null);
  const windowSize = useWindowDimensions();
  const [overlaySize, setOverlaySize] = useState<{ width: number; height: number } | null>(null);
  const width = overlaySize?.width ?? windowSize.width;
  const height = overlaySize?.height ?? windowSize.height;
  const currentIndex = useTutorialStore((s) => s.currentIndex);
  const skipped = useTutorialStore((s) => s.skipped);
  const completed = useTutorialStore((s) => s.completed);
  const rewardReady = useTutorialStore((s) => s.rewardReady);
  const stepRewardReady = useTutorialStore((s) => s.stepRewardReady);
  const lastCompletedStepLabel = useTutorialStore((s) => s.lastCompletedStepLabel);
  const skip = useTutorialStore((s) => s.skip);
  const completeCurrentStep = useTutorialStore((s) => s.completeCurrentStep);
  const dismissStepReward = useTutorialStore((s) => s.dismissStepReward);
  const dismissReward = useTutorialStore((s) => s.dismissReward);
  const frames = useTutorialTargets((s) => s.frames);
  const nodes = useTutorialTargets((s) => s.nodes);
  const setFrame = useTutorialTargets((s) => s.setFrame);
  const missedDropPromptVisible = useGameStore((s) => s.missedDropPromptVisible);

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
    const step = TUTORIAL_STEPS[currentIndex];
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
  }, [completed, currentIndex, nodes, overlaySize, rewardReady, setFrame, skipped]);

  if (skipped || missedDropPromptVisible) return null;

  if (rewardReady) {
    return (
      <View style={styles.rewardLayer} pointerEvents="box-none" onLayout={handleLayout}>
        <View style={styles.rewardCard} pointerEvents="auto">
          <Image source={mascotImage} style={styles.rewardMascot} resizeMode="contain" />
          <View style={styles.rewardCopy}>
            <Text style={styles.rewardTitle}>Tutorial completed!</Text>
            <Text style={styles.rewardMessage}>Now entering the assembly task. You also earned +{TUTORIAL_REWARD_TOKENS} tokens.</Text>
            <Pressable
              style={styles.primaryButton}
              onPress={() => {
                onClaimReward();
                dismissReward();
                onContinueToAssembly?.();
              }}
            >
              <Text style={styles.primaryButtonText}>Enter assembly task</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  if (completed) return null;

  const step = TUTORIAL_STEPS[currentIndex];
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
            {currentIndex + 1}/{TUTORIAL_STEPS.length}
          </Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions} pointerEvents="auto">
            {!waitingForTool ? (
              <Pressable onPress={completeCurrentStep} hitSlop={8}>
                <Text style={styles.continueText}>Continue</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={skip} hitSlop={8}>
              <Text style={styles.skipText}>Skip</Text>
            </Pressable>
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

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFillObject, zIndex: 50 },
  scrim: { position: 'absolute', backgroundColor: 'rgba(17, 18, 20, 0.54)' },
  highlight: {
    position: 'absolute',
    borderRadius: 18,
    borderWidth: 3,
    borderColor: '#7cff9b',
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
    borderColor: '#fff',
    backgroundColor: '#fff',
  },
  copy: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(60,50,40,0.12)',
  },
  stepText: { color: '#37a65a', fontSize: 11, fontWeight: '800', marginBottom: 4 },
  message: { color: '#2e2a24', fontSize: 14, lineHeight: 19, fontWeight: '700' },
  actions: { marginTop: 8, flexDirection: 'row', gap: 14, alignItems: 'center' },
  continueText: { color: '#2e9f51', fontSize: 12, fontWeight: '800' },
  skipText: { color: '#7c746b', fontSize: 12, fontWeight: '700' },
  stepRewardToast: {
    position: 'absolute',
    top: 72,
    alignSelf: 'center',
    backgroundColor: 'rgba(55, 200, 113, 0.96)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  stepRewardText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  rewardLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 60,
    backgroundColor: 'rgba(17, 18, 20, 0.48)',
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
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 18,
    padding: 16,
  },
  rewardMascot: { width: 104, height: 84, borderRadius: 16, backgroundColor: '#fff' },
  rewardCopy: { flex: 1 },
  rewardTitle: { fontSize: 20, fontWeight: '800', color: '#2e2a24' },
  rewardMessage: { marginTop: 5, fontSize: 14, lineHeight: 19, fontWeight: '600', color: '#5f574f' },
  primaryButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: '#37c871',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  primaryButtonText: { color: '#fff', fontSize: 13, fontWeight: '800' },
});
