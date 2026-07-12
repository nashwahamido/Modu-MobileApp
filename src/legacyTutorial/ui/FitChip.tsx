import { StyleSheet, Text, View } from 'react-native';
import { useGameStore } from '../game/store';
import type { FitState } from '../game/fit';

const LOOK: Record<FitState, { color: string; label: string } | null> = {
  idle: null,
  held: { color: '#4a90d9', label: 'Find the spot' },
  nearCorrect: { color: '#37c871', label: 'Drop it!' },
  nearRotation: { color: '#e8842c', label: 'Almost — drop to settle' },
  wrongTarget: { color: '#d95757', label: 'Belongs elsewhere' },
};

/** Color+text fit feedback near the objective bar (in-scene glow comes in M4). */
export function FitChip() {
  const fitState = useGameStore((s) => s.fitState);
  const look = LOOK[fitState];
  if (!look) return null;
  return (
    <View style={[styles.chip, { backgroundColor: look.color }]} pointerEvents="none">
      <Text style={styles.text}>{look.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    position: 'absolute',
    top: 52,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
  },
  text: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
