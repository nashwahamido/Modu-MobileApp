import { useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { useGameStore } from '../game/store';
import type { AssemblyAction } from '../game/assembly';
import { TutorialTarget } from '@/src/game/tutorial/TutorialTarget';
import { useTutorialStore } from '@/src/game/tutorial/store';

/** How far (px) the swipe must travel in the beat's direction. */
const SWIPE_PX = 80;

/** Swipe direction per beat: up = lift/stand, down = lower/press. */
const BEAT_DIRECTION: Record<string, 'up' | 'down'> = {
  reorient_upright: 'up',
  combine_assemblies: 'down',
  finishing_checks: 'down',
};

const HINTS: Record<'up' | 'down', { arrow: string; verb: string }> = {
  up: { arrow: '↑', verb: 'Swipe up' },
  down: { arrow: '↓', verb: 'Swipe down' },
};

const BEAT_COPY: Record<string, { title: string; hint: string }> = {
  finishing_checks: {
    title: 'Check the finished cabinet',
    hint: 'Rotate with the joystick for a moment to finish.',
  },
};

/**
 * Player-facing control for reorient/combine beats: a card the player swipes
 * in the indicated direction. Beats are symbolic (parts stay at their baked
 * poses; the free camera makes a literal flip unnecessary — user decision).
 */
export function BeatControl({ action }: { action: AssemblyAction }) {
  const direction = BEAT_DIRECTION[action.id] ?? 'up';
  const fired = useRef(false);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onBegin(() => {
      fired.current = false;
    })
    .onUpdate((e) => {
      if (fired.current) return;
      const travel = direction === 'up' ? -e.translationY : e.translationY;
      if (travel >= SWIPE_PX) {
        fired.current = true;
        useGameStore.getState().completeAction(action.id);
        useTutorialStore.getState().completeEvent('tool_used');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    });

  const hint = HINTS[direction];
  const copy = BEAT_COPY[action.id] ?? {
    title: action.objective,
    hint: `${hint.verb} to continue`,
  };
  return (
    <TutorialTarget id="tool" style={[styles.wrap, action.id === 'finishing_checks' && styles.finishWrap]} pointerEvents="box-none">
      <GestureDetector gesture={pan}>
        <View style={styles.card} collapsable={false}>
          <Text style={styles.arrow}>{hint.arrow}</Text>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.hint}>{copy.hint}</Text>
        </View>
      </GestureDetector>
    </TutorialTarget>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishWrap: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 74,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#e8842c',
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 4,
    maxWidth: 360,
  },
  arrow: { fontSize: 28, color: '#e8842c', fontWeight: '700', lineHeight: 30 },
  title: { fontSize: 14, fontWeight: '800', color: '#2e2a24', textAlign: 'center' },
  hint: { fontSize: 11, color: '#6b6257', fontWeight: '700', textAlign: 'center', lineHeight: 15 },
});
