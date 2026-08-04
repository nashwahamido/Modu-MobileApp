// The room's own lighting controls: the ceiling light's switch, and the hour that sets the sun behind it.
// Both live on the room HUD rather than in Settings because they are things you do TO THE ROOM while looking at it — a control whose whole point is the change you see has no business two screens away. See docs/superpowers/specs/2026-08-04-room-ceiling-light-design.md section 6.
// NOTHING here relates to settings.lightingPreset, which rigs the ASSEMBLY scene; "light" in this file means the room's ceiling fitting and nothing else.
// Props only, no store: RoomExperience owns the switch's override state and positions this column, exactly as it does for the settings button.
import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { BulbIcon, MoonIcon, SunIcon } from '../../components/Icons';
import { TIME_OF_DAY, TIME_OF_DAY_IDS, sunPreset, type TimeOfDayId } from '../core/timeOfDay';
import { ELEVATION, useStyles } from '@/src/game/ui/theme';
import type { Theme } from '@/src/game/ui/theme';

// Pinned to the mockup rather than the theme, so it holds across light/dark — the same table RoomExperience and RoomBottomBar keep.
const LEXEND = {
  semibold: 'Lexend_600SemiBold',
} as const;

// Matched to the settings button above it, so the column reads as one run of controls down the left edge rather than as two unrelated widgets.
const BUTTON = 42;

// The hour slider's geometry. TRACK is the distance the KNOB'S CENTRE travels, so the strip is TRACK + KNOB wide overall and a stop sits on each end rather than inset from it.
const KNOB = 20;
const TRACK = 168;
// Four gaps between five stops, derived from the id list rather than written out: a sixth preset re-spaces the track instead of overflowing it.
const STEP = TRACK / (TIME_OF_DAY_IDS.length - 1);
const LAST = TIME_OF_DAY_IDS.length - 1;

// The stop nearest a touch, clamped at both ends — dragging past either end parks on that end's preset instead of running off the track. x is measured from the FIRST STOP'S CENTRE, which is why every caller subtracts the knob's radius first.
function hourAt(x: number): TimeOfDayId {
  return TIME_OF_DAY_IDS[Math.max(0, Math.min(LAST, Math.round(x / STEP)))];
}

export function RoomLightControls({
  hour,
  onHourChange,
  lightOn,
  onToggleLight,
  style,
}: {
  hour: TimeOfDayId;
  onHourChange: (hour: TimeOfDayId) => void;
  lightOn: boolean;
  onToggleLight: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const s = useStyles(makeStyles);
  // The slider is collapsed by default: a permanent scrubber is a lot of chrome over a diorama the player wants to look at, and the hour is a rare choice. The BULB is never collapsed, because flipping a light is the thing you actually do and one tap is the whole budget for it.
  const [hoursOpen, setHoursOpen] = useState(false);
  const dark = sunPreset(hour).backdrop === 'night';
  const index = TIME_OF_DAY_IDS.indexOf(hour);

  // What the slider last asked for. Re-synced to the prop on every render so an hour changed from anywhere else still lands here, and read inside the gesture so a drag does not re-emit the stop it is already sitting on — the gesture is memoized and would otherwise close over the hour the drag STARTED at.
  const emitted = useRef(hour);
  emitted.current = hour;
  const emit = (x: number) => {
    const next = hourAt(x);
    if (next === emitted.current) return;
    emitted.current = next;
    onHourChange(next);
  };

  // MEMOIZED, and it must stay that way: handing GestureDetector a fresh instance on each render reattaches the native handler mid-drag, which eats the grab and stutters the scrub — the same lesson play.tsx records for the scene gestures.
  // One Pan handles tap and drag both, because a tap is just a pan that never moved: onBegin jumps to whatever stop was touched, onUpdate scrubs from there, and there is no Race to tune between two competing recognisers.
  const scrub = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onBegin((e) => emit(e.x - KNOB / 2))
        .onUpdate((e) => emit(e.x - KNOB / 2)),
    // `emit` is rebuilt every render and deliberately left out of the deps: it closes over only `emitted` (a ref, so always read live) and `onHourChange` (listed, and stable — it is the store action), which makes the copy a memoized gesture holds behaviourally identical to a fresh one. IF YOU GIVE `emit` A DEPENDENCY ON ANYTHING REACTIVE, this stops being true and the drag will scrub against stale state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onHourChange],
  );

  return (
    <View style={[s.column, style]}>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel="Ceiling light"
        accessibilityState={{ checked: lightOn }}
        hitSlop={8}
        style={[s.button, lightOn && s.buttonOn]}
        onPress={onToggleLight}
      >
        <BulbIcon size={22} on={lightOn} color={lightOn ? '#8a6b1f' : '#807277'} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Time of day: ${TIME_OF_DAY[hour].label}`}
        accessibilityState={{ expanded: hoursOpen }}
        hitSlop={8}
        style={s.button}
        onPress={() => setHoursOpen((open) => !open)}
      >
        {dark ? <MoonIcon size={22} /> : <SunIcon size={22} />}
      </Pressable>

      {hoursOpen ? (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={s.panel}>
          {/* The readout names the stop the knob is on. Labels come from TIME_OF_DAY, the same source the old Settings stepper read, so a sixth preset appears here with no edit to this file. */}
          <Text style={s.panelLabel}>{TIME_OF_DAY[hour].label}</Text>
          <GestureDetector gesture={scrub}>
            {/* The touch area spans the KNOB's full travel, not the track's line, so the ends are as grabbable as the middle — a track-width hit box leaves the first and last stops half off it. */}
            <View
              style={s.trackHit}
              accessibilityRole="adjustable"
              accessibilityLabel="Time of day"
              accessibilityValue={{ text: TIME_OF_DAY[hour].label, min: 0, max: LAST, now: index }}
              accessibilityActions={ACCESSIBILITY_ACTIONS}
              onAccessibilityAction={(e) => {
                const next = TIME_OF_DAY_IDS[
                  Math.max(0, Math.min(LAST, index + (e.nativeEvent.actionName === 'increment' ? 1 : -1)))
                ];
                if (next !== hour) onHourChange(next);
              }}
            >
              <View style={s.track} />
              <View style={[s.trackFill, { width: index * STEP }]} />
              {TIME_OF_DAY_IDS.map((id, i) => (
                <View key={id} style={[s.tick, { left: KNOB / 2 + i * STEP - 2 }]} />
              ))}
              <View style={[s.knob, { left: index * STEP }]} />
            </View>
          </GestureDetector>
        </Animated.View>
      ) : null}
    </View>
  );
}

// Hoisted so the array identity is stable: a fresh literal every render makes RN re-register the actions on the native view.
const ACCESSIBILITY_ACTIONS = [{ name: 'increment' }, { name: 'decrement' }] as const;

const makeStyles = (t: Theme) => StyleSheet.create({
  column: {
    alignItems: 'flex-start',
    gap: 8,
  },
  button: {
    width: BUTTON,
    height: BUTTON,
    borderRadius: BUTTON / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.surface,
    ...ELEVATION.card,
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
  // Lit reads as warm, not as "selected": the button is a lamp, so its on-state should look like one.
  buttonOn: {
    backgroundColor: '#f6e6b8',
  },
  panel: {
    marginTop: 2,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: t.surface,
    ...ELEVATION.card,
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
  panelLabel: {
    fontFamily: LEXEND.semibold,
    fontSize: 12,
    lineHeight: 16,
    color: '#231F20',
    textAlign: 'center',
  },
  // Every child below is absolute, so this box's HEIGHT is what centres them: track, ticks and knob each carry the top that puts their own centre on 15.
  trackHit: {
    width: TRACK + KNOB,
    height: 30,
  },
  track: {
    position: 'absolute',
    left: KNOB / 2,
    right: KNOB / 2,
    top: 13,
    height: 4,
    borderRadius: 2,
    backgroundColor: t.surfaceRaised,
  },
  // The travelled part, warm rather than themed: the slider runs from morning to night, so the fill reads as hours elapsed.
  trackFill: {
    position: 'absolute',
    left: KNOB / 2,
    top: 13,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d9c48a',
  },
  tick: {
    position: 'absolute',
    top: 13,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#b8afa8',
  },
  knob: {
    position: 'absolute',
    top: 5,
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: '#fbfaf3',
    borderWidth: 1,
    borderColor: '#d7d1ce',
    ...ELEVATION.card,
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
});
