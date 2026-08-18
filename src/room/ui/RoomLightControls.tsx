// The room's own lighting controls: the ceiling light's switch, and the hour that sets the sun behind it. Both live on the room HUD rather than in Settings because they are things you do TO THE ROOM while looking at it — a control whose whole point is the change you see has no business two screens away. See docs/superpowers/specs/2026-08-04-room-ceiling-light-design.md section 6. NOTHING here relates to settings.lightingPreset, which rigs the ASSEMBLY scene; "light" in this file means the room's ceiling fitting and nothing else. Props only, no store: RoomExperience owns the switch's override state and positions this column, exactly as it does for the settings button.
import { useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { TIME_OF_DAY, TIME_OF_DAY_IDS, sunPreset, type TimeOfDayId } from '../core/timeOfDay';
import { CARD_CHROME, ELEVATION, useFixedStyles, LEXEND } from '@/src/game/ui/system/theme';
import type { Theme } from '@/src/game/ui/system/theme';

// Matched to the settings button above it, so the column reads as one run of controls down the left edge rather than as two unrelated widgets.
const BUTTON = 42;
// The catalogue cards' edge, the same one the bottom bar and the HUD bars carry
const BUTTON_STROKE = CARD_CHROME.borderColor;
const BUTTON_STROKE_WIDTH = CARD_CHROME.borderWidth;

// The hour buttons' artwork, one PNG per preset. Each file has its own canvas and its own margins, so
// every one is CROPPED to its drawing rather than contained: morning.png in particular is a small
// picture in the corner of a 2026x2000 canvas, which `contain` would render as a speck.
//
// The blocks are measured off each file's alpha channel at a THRESHOLD (alpha > 140), not at its full
// bounds: these drawings carry a wide soft glow, and cropping to that leaves a ring of near-invisible
// halo that reads as a gap between the artwork and the button's stroke.
const HOUR_ART_SOURCE: Record<TimeOfDayId, ArtSource> = {
  morning: {
    src: require('@/src/assets/ui/icons/morning.png'),
    canvas: { w: 2026, h: 2000 },
    block: { x: 41, y: 1052, w: 172, h: 168 },
  },
  midday: {
    src: require('@/src/assets/ui/icons/midday.png'),
    canvas: { w: 189, h: 188 },
    block: { x: 8, y: 20, w: 172, h: 168 },
  },
  afternoon: {
    src: require('@/src/assets/ui/icons/afternoon.png'),
    canvas: { w: 189, h: 188 },
    block: { x: 8, y: 20, w: 172, h: 168 },
  },
  sunset: {
    src: require('@/src/assets/ui/icons/sunset.png'),
    canvas: { w: 228, h: 211 },
    block: { x: 27, y: 7, w: 172, h: 168 },
  },
  night: {
    src: require('@/src/assets/ui/icons/night.png'),
    canvas: { w: 172, h: 168 },
    block: { x: 0, y: 0, w: 172, h: 168 },
  },
};

// A touch over 1, so a drawing bleeds to the stroke instead of stopping a hair short of it; the button clips the remainder.
const HOUR_ART_OVERSCAN = 1.06;
const HOUR_ART_WIDTH = (BUTTON - BUTTON_STROKE_WIDTH * 2) * HOUR_ART_OVERSCAN;

type ArtSource = {
  src: number;
  canvas: { w: number; h: number };
  block: { x: number; y: number; w: number; h: number };
};

// The window's size, and the oversized image's offset inside it. Solved once per drawing.
function solveArt({ src, canvas, block }: ArtSource) {
  const scale = HOUR_ART_WIDTH / block.w;
  return {
    src,
    window: { width: HOUR_ART_WIDTH, height: block.h * scale },
    image: {
      left: -block.x * scale,
      top: -block.y * scale,
      width: canvas.w * scale,
      height: canvas.h * scale,
    },
  };
}

// The ceiling light's switch, drawn the same way the hours are: the picture IS the button's face, and
// it carries the state — which is why the button no longer tints itself when lit.
const LIGHT_ART = {
  on: solveArt({
    src: require('@/src/assets/ui/icons/light-on.png'),
    canvas: { w: 212, h: 208 },
    block: { x: 16, y: 20, w: 176, h: 172 },
  }),
  off: solveArt({
    src: require('@/src/assets/ui/icons/light-off.png'),
    canvas: { w: 227, h: 223 },
    block: { x: 23, y: 27, w: 176, h: 172 },
  }),
};

// Solved once per preset: the window's size, and the oversized image's offset inside it.
const HOUR_ART = Object.fromEntries(
  (Object.keys(HOUR_ART_SOURCE) as TimeOfDayId[]).map((id) => [id, solveArt(HOUR_ART_SOURCE[id])]),
) as Record<TimeOfDayId, ReturnType<typeof solveArt>>;
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
  const s = useFixedStyles(makeStyles);
  // The slider is collapsed by default: a permanent scrubber is a lot of chrome over a diorama the player wants to look at, and the hour is a rare choice. The BULB is never collapsed, because flipping a light is the thing you actually do and one tap is the whole budget for it.
  const [hoursOpen, setHoursOpen] = useState(false);
  // Through sunPreset, not TIME_OF_DAY[hour], so an id this component does not recognise falls back to a real preset instead of throwing on `.label` — the guarantee that module advertises and its tests pin.
  const preset = sunPreset(hour);
  // The ONE place the backdrop legitimately drives lighting UI, against the rule section 4 of the spec sets out: this glyph depicts THE SKY, so the photo outside the window is genuinely the right source for it — unlike the light's own behaviour, which must never be inferred from the wallpaper.
  // Falls back like sunPreset does, so an id this component does not recognise still renders a face
  const art = HOUR_ART[hour] ?? HOUR_ART.morning;
  const light = lightOn ? LIGHT_ART.on : LIGHT_ART.off;
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

  // MEMOIZED, and it must stay that way: handing GestureDetector a fresh instance on each render reattaches the native handler mid-drag, which eats the grab and stutters the scrub — the same lesson play.tsx records for the scene gestures. One Pan handles tap and drag both, because a tap is just a pan that never moved: onBegin jumps to whatever stop was touched, onUpdate scrubs from there, and there is no Race to tune between two competing recognisers.
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
        style={[s.button, s.buttonArtwork]}
        onPress={onToggleLight}
      >
        <View style={[s.hourArtWindow, light.window]}>
          <Image source={light.src} style={[s.hourArtImage, light.image]} resizeMode="stretch" />
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Time of day: ${preset.label}`}
        accessibilityState={{ expanded: hoursOpen }}
        hitSlop={8}
        style={[s.button, s.buttonArtwork]}
        onPress={() => setHoursOpen((open) => !open)}
      >
        <View style={[s.hourArtWindow, art.window]}>
          <Image source={art.src} style={[s.hourArtImage, art.image]} resizeMode="stretch" />
        </View>
      </Pressable>

      {hoursOpen ? (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={s.panel}>
          {/* The readout names the stop the knob is on. Labels come from TIME_OF_DAY, the same source the old Settings stepper read, so a sixth preset appears here with no edit to this file. */}
          <Text style={s.panelLabel}>{preset.label}</Text>
          <GestureDetector gesture={scrub}>
            {/* The touch area spans the KNOB's full travel, not the track's line, so the ends are as grabbable as the middle — a track-width hit box leaves the first and last stops half off it. */}
            <View
              style={s.trackHit}
              accessibilityRole="adjustable"
              accessibilityLabel="Time of day"
              accessibilityValue={{ text: preset.label, min: 0, max: LAST, now: index }}
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
    gap: 16,
  },
  button: {
    width: BUTTON,
    height: BUTTON,
    borderRadius: BUTTON / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.surface,
    borderWidth: BUTTON_STROKE_WIDTH,
    borderColor: BUTTON_STROKE,
    // Clips the morning artwork, which is drawn wider than the disc on purpose
    overflow: 'hidden',
    ...ELEVATION.card,
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
  // An artwork button is its OWN face: no cream disc under it and no lift, because the drawing already
  // fills the circle and a plate behind it would only show as a rim. The stroke stays — it is what
  // makes the picture read as a button.
  buttonArtwork: {
    backgroundColor: 'transparent',
    ...CARD_CHROME,
    borderRadius: BUTTON / 2,
  },
  // The window onto the artwork; the image inside it is larger and offset so only the drawing shows.
  // Both take their numbers from HOUR_ART, which solves them per preset.
  hourArtWindow: {
    overflow: 'hidden',
  },
  hourArtImage: {
    position: 'absolute',
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
    ...LEXEND.semibold,
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
