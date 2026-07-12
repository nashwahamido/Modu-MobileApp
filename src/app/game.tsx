import { router, type Href } from 'expo-router';
import { FilamentScene } from 'react-native-filament';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useEffect, useRef } from 'react';
import { AssemblyScene } from '../legacyTutorial/game/scene/AssemblyScene';
import { createOffsetDriver } from '../legacyTutorial/game/scene/offsetDriver';
import { useSceneState } from '../legacyTutorial/game/scene/useSceneState';
import { Joystick } from '../legacyTutorial/game/input/Joystick';
import { useOrbitCamera } from '../legacyTutorial/game/input/useOrbitCamera';
import { usePartDrag } from '../legacyTutorial/game/input/usePartDrag';
import { BeatControl } from '../legacyTutorial/game/input/BeatControl';
import { TapControl } from '../legacyTutorial/game/input/TapControl';
import { TightenControl } from '../legacyTutorial/game/input/TightenControl';
import { SCENE_BACKGROUND } from '../legacyTutorial/game/scene/lighting';
import { useGameStore } from '../legacyTutorial/game/store';
import { ACTIONS } from '../legacyTutorial/game/assembly';
import { GreenFlash } from '../legacyTutorial/game/ui/GreenFlash';
import { FitChip } from '../legacyTutorial/game/ui/FitChip';
import { PartsTray } from '../legacyTutorial/game/ui/PartsTray';
import { BaseStashControl } from '../legacyTutorial/game/ui/BaseStashControl';
import { ResetButton } from '../legacyTutorial/game/ui/ResetButton';
import { DevAutoStep } from '../legacyTutorial/game/ui/DevAutoStep';
import { MissedDropPromptOverlay } from '../legacyTutorial/game/ui/MissedDropPromptOverlay';
import { TutorialTarget } from '../legacyTutorial/tutorial/TutorialTarget';
import { MascotGuideOverlay } from '../legacyTutorial/tutorial/MascotGuideOverlay';
import { useTutorialStore } from '../legacyTutorial/tutorial/store';
import { TUTORIAL_REWARD_TOKENS, type ToolTutorialKind } from '../legacyTutorial/tutorial/steps';

function GameScreen() {
  const { manipulator, onStickStart, onStickMove, onStickEnd, onZoomDelta, onPanStart, onPanMove, onPanEnd, resetCamera } =
    useOrbitCamera();
  const lastScale = useRef(1);
  const joystickTutorialStartedAt = useRef<number | null>(null);
  const finishCheckStartedAt = useRef<number | null>(null);
  const sceneState = useSceneState();
  const heldDriver = useRef(createOffsetDriver()).current;
  const sinkDriver = useRef(createOffsetDriver()).current;

  // Primitive selectors only — object-returning selectors re-render forever.
  const stage = useGameStore((s) => s.stage());
  const objective = useGameStore((s) => s.available()[0]?.objective ?? 'All done!');
  const completedCount = useGameStore((s) => s.completed.length);
  const bonusTokens = useGameStore((s) => s.bonusTokens);
  const missedDropBehavior = useGameStore((s) => s.missedDropBehavior);
  const missedDropPromptAnswered = useGameStore((s) => s.missedDropPromptAnswered);
  const setMissedDropBehavior = useGameStore((s) => s.setMissedDropBehavior);
  const addTutorialStepReward = useGameStore((s) => s.addTutorialStepReward);
  const claimTutorialReward = useGameStore((s) => s.claimTutorialReward);
  const stepRewardsClaimed = useTutorialStore((s) => s.stepRewardsClaimed);
  const lastStepRewardsClaimed = useRef(0);
  const totalCount = ACTIONS.length;
  const activeToolKind: ToolTutorialKind | null = sceneState.activeBeat
    ? 'beat'
    : sceneState.activeTighten?.tool === 'mallet'
      ? 'tap'
      : sceneState.activeTighten
        ? 'tighten'
        : null;

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onBegin(() => {
      lastScale.current = 1;
    })
    .onUpdate((e) => {
      onZoomDelta(e.scale - lastScale.current);
      if (Math.abs(e.scale - 1) > 0.04) useTutorialStore.getState().completeEvent('pinch_zoomed');
      lastScale.current = e.scale;
    });

  // Two-finger drag pans the scene (strafe). A translation threshold keeps a
  // pinch (distance change, little centroid travel) from triggering it.
  const pan = Gesture.Pan()
    .runOnJS(true)
    .minPointers(2)
    // No averageTouches: track the primary finger so lifting the second one
    // doesn't snap the tracked point (which lurched the scene on release).
    .activeOffsetX([-22, 22])
    .activeOffsetY([-22, 22])
    .onStart((e) => onPanStart(e.x, e.y))
    // Ignore the centroid snap when a finger lifts (2→1) — that jump would
    // strafe the scene right before the gesture ends.
    .onUpdate((e) => {
      if (e.numberOfPointers >= 2) onPanMove(e.x, e.y);
    })
    .onEnd(() => onPanEnd())
    .onFinalize(() => onPanEnd());
  const { gestureFor, canvasGesture, ringOverlay } = usePartDrag({ manipulator, heldDriver });
  // Race, not Simultaneous: the gesture is EITHER a zoom, a two-finger pan, or
  // a one-finger nudge of a floating part.
  const sceneGesture = Gesture.Race(pinch, pan, canvasGesture);

  useEffect(() => {
    const delta = stepRewardsClaimed - lastStepRewardsClaimed.current;
    if (delta > 0) addTutorialStepReward(delta);
    lastStepRewardsClaimed.current = stepRewardsClaimed;
  }, [addTutorialStepReward, stepRewardsClaimed]);

  return (
    <View style={styles.root} collapsable={false}>
      <GestureDetector gesture={sceneGesture}>
        <View style={styles.sceneWrap} collapsable={false}>
          <TutorialTarget id="scene" style={styles.sceneFill}>
            <AssemblyScene
              cameraManipulator={manipulator}
              sceneState={sceneState}
              heldDriver={heldDriver}
              sinkDriver={sinkDriver}
            />
          </TutorialTarget>
        </View>
      </GestureDetector>
      <TutorialTarget id="assemblyArea" style={styles.assemblyTarget} pointerEvents="none" />
      <View style={styles.objectiveBar} pointerEvents="none">
        <Text style={styles.objectiveText}>
          Stage {stage} · {objective} · {completedCount}/{totalCount}
        </Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${(completedCount / totalCount) * 100}%` }]} />
        </View>
      </View>
      <View style={styles.pointsChip} pointerEvents="none">
        <Text style={styles.pointsText}>★ {completedCount * 10 + bonusTokens}</Text>
      </View>
      <FitChip />
      <ResetButton />
      <PartsTray items={sceneState.trayItems} gestureFor={gestureFor} header={<BaseStashControl />} />
      {sceneState.activeTighten ? (
        sceneState.activeTighten.tool === 'mallet' ? (
          <TapControl action={sceneState.activeTighten} sinkDriver={sinkDriver} />
        ) : (
          <TightenControl action={sceneState.activeTighten} sinkDriver={sinkDriver} />
        )
      ) : null}
      {sceneState.activeBeat && !sceneState.activeTighten ? <BeatControl action={sceneState.activeBeat} /> : null}
      <View style={styles.joystickZone}>
        <TutorialTarget id="joystick">
          <Joystick
            onStart={() => {
              joystickTutorialStartedAt.current = null;
              onStickStart();
            }}
            onMove={(x, y) => {
              onStickMove(x, y);
              if (Math.hypot(x, y) > 0.18) {
                joystickTutorialStartedAt.current = joystickTutorialStartedAt.current ?? Date.now();
                if (Date.now() - joystickTutorialStartedAt.current > 800) {
                  useTutorialStore.getState().completeEvent('joystick_moved');
                }
                if (sceneState.activeBeat?.id === 'finishing_checks') {
                  finishCheckStartedAt.current = finishCheckStartedAt.current ?? Date.now();
                  if (Date.now() - finishCheckStartedAt.current > 1000) {
                    useGameStore.getState().completeAction('finishing_checks');
                    useTutorialStore.getState().completeEvent('tool_used');
                  }
                }
              } else {
                joystickTutorialStartedAt.current = null;
                finishCheckStartedAt.current = null;
              }
            }}
            onEnd={() => {
              joystickTutorialStartedAt.current = null;
              finishCheckStartedAt.current = null;
              onStickEnd();
            }}
          />
        </TutorialTarget>
      </View>
      <TutorialTarget id="recenter" style={styles.recenterTarget}>
        <Pressable
          style={styles.recenterButton}
          onPress={() => {
            resetCamera();
            useTutorialStore.getState().completeEvent('camera_recentered');
          }}
          hitSlop={8}
        >
          <Text style={styles.recenterText}>⟲ Recenter</Text>
        </Pressable>
      </TutorialTarget>
      {missedDropPromptAnswered ? (
        <Pressable
          style={styles.dropBehaviorButton}
          onPress={() =>
            setMissedDropBehavior(missedDropBehavior === 'keepOnCanvas' ? 'returnToTray' : 'keepOnCanvas')
          }
          hitSlop={8}
        >
          <Text style={styles.dropBehaviorLabel}>Missed drop</Text>
          <Text style={styles.dropBehaviorText}>
            {missedDropBehavior === 'keepOnCanvas' ? 'Stay' : 'Return'}
          </Text>
        </Pressable>
      ) : null}
      {ringOverlay}
      <DevAutoStep heldDriver={heldDriver} sinkDriver={sinkDriver} />
      <GreenFlash trigger={completedCount} />
      <MascotGuideOverlay
        activeToolKind={activeToolKind}
        onClaimReward={() => claimTutorialReward(TUTORIAL_REWARD_TOKENS)}
        onContinueToAssembly={() => router.replace('/play' as Href)}
      />
      <MissedDropPromptOverlay />
    </View>
  );
}

export default function GameRoute() {
  return (
    <FilamentScene>
      <GameScreen />
    </FilamentScene>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCENE_BACKGROUND },
  sceneWrap: { ...StyleSheet.absoluteFillObject },
  sceneFill: { flex: 1 },
  assemblyTarget: {
    position: 'absolute',
    left: '22%',
    top: '24%',
    width: '50%',
    height: '52%',
  },
  objectiveBar: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.75)',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 18,
  },
  objectiveText: { fontSize: 14, color: '#2e2a24', fontWeight: '600' },
  progressTrack: {
    marginTop: 6,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(60,50,40,0.15)',
    alignSelf: 'stretch',
    overflow: 'hidden',
  },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: '#37c871' },
  pointsChip: {
    position: 'absolute',
    top: 10,
    left: 14,
    backgroundColor: 'rgba(255,255,255,0.75)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
  },
  pointsText: { fontSize: 13, fontWeight: '700', color: '#b8741a' },
  joystickZone: { position: 'absolute', left: 28, bottom: 28 },
  recenterTarget: {
    position: 'absolute',
    left: 28,
    bottom: 196,
  },
  recenterButton: {
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(60,50,40,0.15)',
  },
  recenterText: { fontSize: 12, fontWeight: '700', color: '#2e2a24' },
  dropBehaviorButton: {
    position: 'absolute',
    left: 28,
    bottom: 148,
    minWidth: 118,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(60,50,40,0.15)',
  },
  dropBehaviorLabel: { fontSize: 9, fontWeight: '800', color: '#7c746b' },
  dropBehaviorText: { marginTop: 1, fontSize: 12, fontWeight: '800', color: '#2e2a24' },
});
