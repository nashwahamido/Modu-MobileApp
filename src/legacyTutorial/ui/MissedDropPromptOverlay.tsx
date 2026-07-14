import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useGameStore, type MissedDropBehavior } from '../game/store';

const mascotImage = require('../assets/mascot/mascot.png');

export function MissedDropPromptOverlay() {
  const visible = useGameStore((s) => s.missedDropPromptVisible);
  const kind = useGameStore((s) => s.missedDropPromptKind);
  const chooseMissedDropBehavior = useGameStore((s) => s.chooseMissedDropBehavior);
  const dismissMissedDropPrompt = useGameStore((s) => s.dismissMissedDropPrompt);
  const [choosing, setChoosing] = useState(false);

  useEffect(() => {
    if (!visible) setChoosing(false);
  }, [visible]);

  if (!visible) return null;

  const choose = (behavior: MissedDropBehavior) => {
    chooseMissedDropBehavior(behavior);
  };
  const showChoices = kind === 'missedDrop' || choosing;

  return (
    <View style={styles.layer} pointerEvents="box-none">
      <View style={styles.scrim} pointerEvents="none" />
      <View style={styles.card} pointerEvents="auto">
        <Image source={mascotImage} style={styles.mascot} resizeMode="contain" />
        <View style={styles.copy}>
          <Text style={styles.kicker}>{showChoices ? 'Drop setting' : 'Nice placement'}</Text>
          <Text style={styles.title}>
            {showChoices ? 'Dropped in the wrong spot?' : 'If a part misses later, you can choose what happens.'}
          </Text>
          <Text style={styles.message}>
            {showChoices ? 'Should dropped parts stay here next time?' : 'Default is Stay. You can set it now or keep going.'}
          </Text>
          {showChoices ? (
            <View style={styles.actions}>
              <Pressable style={styles.primaryButton} onPress={() => choose('keepOnCanvas')}>
                <Text style={styles.primaryText}>Stay</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => choose('returnToTray')}>
                <Text style={styles.secondaryText}>Return</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.actions}>
              <Pressable style={styles.primaryButton} onPress={() => setChoosing(true)}>
                <Text style={styles.primaryText}>Set preference</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={dismissMissedDropPrompt}>
                <Text style={styles.secondaryText}>Later</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFillObject, zIndex: 80, justifyContent: 'flex-end', alignItems: 'center' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(35, 31, 32, 0.22)' },
  card: {
    width: '42%',
    minWidth: 360,
    maxWidth: 430,
    minHeight: 112,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 18,
    backgroundColor: 'rgba(251, 248, 243, 0.97)',
    padding: 12,
    marginBottom: 84,
    borderWidth: 2,
    borderColor: '#E8D48C',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
  },
  mascot: {
    width: 64,
    height: 58,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#FBF8F3',
    backgroundColor: '#FBF8F3',
  },
  copy: { flex: 1 },
  kicker: { color: '#8FA876', fontSize: 10, fontWeight: '900', marginBottom: 2 },
  title: { color: '#231F20', fontSize: 13, lineHeight: 17, fontWeight: '900' },
  message: { marginTop: 3, color: '#665f55', fontSize: 11, lineHeight: 14, fontWeight: '700' },
  actions: { marginTop: 9, flexDirection: 'row', gap: 8, alignItems: 'center' },
  primaryButton: {
    backgroundColor: '#2D2A26',
    borderRadius: 15,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  primaryText: { color: '#FBF8F3', fontSize: 11, fontWeight: '900' },
  secondaryButton: {
    backgroundColor: '#FBF8F3',
    borderRadius: 15,
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderWidth: 2,
    borderColor: '#d8cdbb',
  },
  secondaryText: { color: '#231F20', fontSize: 11, fontWeight: '900' },
});
