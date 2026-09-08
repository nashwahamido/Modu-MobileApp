import {
  useMemo,
  useRef,
  useState } from 'react';
import { Image,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Pressable } from "@/src/components/Pressable";
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { withTiming } from 'react-native-reanimated';
import type { EntryAnimationsValues, ExitAnimationsValues } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { TIME_OF_DAY_IDS, sunPreset, type TimeOfDayId } from '../core/timeOfDay';
import { CARD_CHROME, ELEVATION, useScaledStyles, LEXEND } from '@/src/game/ui/system/theme';
import { useLeftColumnScale } from './roomScale';
import type { Theme } from '@/src/game/ui/system/theme';

const BUTTON = 48;
const BAR_FILL = '#FBFAF3';
const PANEL_HEIGHT = 40;
export const LIGHT_COLUMN_GAP = 16;
export const ROOM_CHIP_RADIUS = 18;
export const ROOM_CHIP_SIZE = BUTTON;
const BUTTON_STROKE = CARD_CHROME.borderColor;
const BUTTON_STROKE_WIDTH = CARD_CHROME.borderWidth;

const HOUR_ART_SOURCE: Record<TimeOfDayId, ArtSource> = {
  morning: {
    src: require('@/src/assets/ui/icons/morning.png'),
    canvas: {
      w: 161,
      h: 154,
    },
    block: {
      x: 9,
      y: 0,
      w: 139,
      h: 136,
    },
  },
  midday: {
    src: require('@/src/assets/ui/icons/midday.png'),
    canvas: {
      w: 161,
      h: 156,
    },
    block: {
      x: 8,
      y: 20,
      w: 140,
      h: 136,
    },
  },
  afternoon: {
    src: require('@/src/assets/ui/icons/afternoon.png'),
    canvas: {
      w: 161,
      h: 156,
    },
    block: {
      x: 8,
      y: 20,
      w: 140,
      h: 136,
    },
  },
  sunset: {
    src: require('@/src/assets/ui/icons/sunset.png'),
    canvas: {
      w: 156,
      h: 152,
    },
    block: {
      x: 8,
      y: 0,
      w: 140,
      h: 138,
    },
  },
  night: {
    src: require('@/src/assets/ui/icons/night.png'),
    canvas: {
      w: 140,
      h: 136,
    },
    block: {
      x: 0,
      y: 0,
      w: 140,
      h: 136,
    },
  },
};

const HOUR_COLOUR: Record<TimeOfDayId, string> = {
  morning: '#E7DCB2',
  midday: '#D8BF5D',
  afternoon: '#D1A551',
  sunset: '#C47C4B',
  night: '#373F58',
};

const HOUR_ART_OVERSCAN = 1;
const LIGHT_CHIP_ART = 0.95;
const HOUR_CHIP_ART = 0.88;
const HOUR_ART_WIDTH = (BUTTON - BUTTON_STROKE_WIDTH * 2) * HOUR_ART_OVERSCAN;

type ArtSource = {
  src: number;
  canvas: { w: number; h: number };
  block: { x: number; y: number; w: number; h: number };
};

function solveHourArt({ src, canvas, block }: ArtSource) {
  const scale = HOUR_ART_WIDTH / block.w;
  return {
    src,
    window: {
      width: HOUR_ART_WIDTH,
      height: block.h * scale,
    },
    image: {
      left: -block.x * scale,
      top: -block.y * scale,
      width: canvas.w * scale,
      height: canvas.h * scale,
    },
  };
}

function solveArt({ src, canvas, block }: ArtSource) {
  const scale = HOUR_ART_WIDTH / block.w;
  return {
    src,
    window: {
      width: HOUR_ART_WIDTH,
      height: block.h * scale,
    },
    image: {
      left: -block.x * scale,
      top: -block.y * scale,
      width: canvas.w * scale,
      height: canvas.h * scale,
    },
  };
}

const LIGHT_ART = {
  on: solveArt({
    src: require('@/src/assets/ui/icons/light-on.png'),
    canvas: {
      w: 212,
      h: 208,
    },
    block: {
      x: 16,
      y: 20,
      w: 176,
      h: 172,
    },
  }),
  off: solveArt({
    src: require('@/src/assets/ui/icons/light-off.png'),
    canvas: {
      w: 227,
      h: 223,
    },
    block: {
      x: 23,
      y: 27,
      w: 176,
      h: 172,
    },
  }),
};

const HOUR_ART = Object.fromEntries(
  (Object.keys(HOUR_ART_SOURCE) as TimeOfDayId[]).map((id) => [id, solveHourArt(HOUR_ART_SOURCE[id])]),
) as Record<TimeOfDayId, ReturnType<typeof solveHourArt>>;
const KNOB = 20;
const TRACK = 140;
const STEP = TRACK / (TIME_OF_DAY_IDS.length - 1);
const LAST = TIME_OF_DAY_IDS.length - 1;
const TRACK_TOP = 10;
const KNOB_TOP = 2;

function hourAt(x: number, k: number): TimeOfDayId {
  return TIME_OF_DAY_IDS[Math.max(0, Math.min(LAST, Math.round(x / (STEP * k))))];
}

function scaleBox<T extends Record<string, number>>(box: T, k: number): T {
  if (k === 1) return box;
  const out: Record<string, number> = {};
  for (const [prop, value] of Object.entries(box)) out[prop] = value * k;
  return out as T;
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
  const k = useLeftColumnScale();
  const s = useScaledStyles(makeStyles, k);
  const [hoursOpen, setHoursOpen] = useState(false);
  const preset = sunPreset(hour);
  const art = HOUR_ART[hour] ?? HOUR_ART.morning;
  const light = lightOn ? LIGHT_ART.on : LIGHT_ART.off;
  const hourColour = HOUR_COLOUR[hour] ?? HOUR_COLOUR.morning;
  const index = TIME_OF_DAY_IDS.indexOf(hour);

  const emitted = useRef(hour);
  emitted.current = hour;
  const kRef = useRef(k);
  kRef.current = k;
  const emit = (x: number) => {
    const next = hourAt(x, kRef.current);
    if (next === emitted.current) return;
    emitted.current = next;
    onHourChange(next);
  };

  const scrub = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onBegin((e) => emit(e.x - KNOB / 2))
        .onUpdate((e) => emit(e.x - KNOB / 2)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onHourChange],
  );

  return (
    <View style={[s.column, style]} pointerEvents="box-none">
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel="Ceiling light"
        accessibilityState={{ checked: lightOn }}
        hitSlop={8}
        style={[s.button, s.buttonChip]}
        onPress={onToggleLight}
      >
        <View style={[s.hourArtWindow, scaleBox(light.window, k * LIGHT_CHIP_ART)]}>
          <Image
            source={light.src}
            style={[s.hourArtImage, scaleBox(light.image, k * LIGHT_CHIP_ART)]}
            resizeMode="stretch"
          />
        </View>
      </Pressable>

      <View style={s.hourRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Time of day: ${preset.label}`}
          accessibilityState={{ expanded: hoursOpen }}
          hitSlop={8}
          style={[s.button, s.buttonChip, s.hourButton]}
          onPress={() => setHoursOpen((open) => !open)}
        >
          <View style={[s.hourArtBleed, scaleBox(art.window, k * HOUR_CHIP_ART)]}>
            <Image
              source={art.src}
              style={[s.hourArtImage, scaleBox(art.image, k * HOUR_CHIP_ART)]}
              resizeMode="stretch"
            />
          </View>
        </Pressable>

        {hoursOpen ? (
        <Animated.View
          entering={slideIn(HIDDEN_WIDTH * k)}
          exiting={slideOut(HIDDEN_WIDTH * k)}
          style={s.panel}
        >
          <Text style={s.panelLabel}>{preset.label}</Text>
          <GestureDetector gesture={scrub}>
            <View
              style={s.trackHit}
              accessibilityRole="adjustable"
              accessibilityLabel="Time of day"
              accessibilityValue={{
                text: preset.label,
                min: 0,
                max: LAST,
                now: index,
              }}
              accessibilityActions={ACCESSIBILITY_ACTIONS}
              onAccessibilityAction={(e) => {
                const next = TIME_OF_DAY_IDS[
                  Math.max(0, Math.min(LAST, index + (e.nativeEvent.actionName === 'increment' ? 1 : -1)))
                ];
                if (next !== hour) onHourChange(next);
              }}
            >
              <View
                style={[
                  s.track,
                  {
                    top: TRACK_TOP * k,
                    left: (KNOB / 2) * k,
                    right: (KNOB / 2) * k,
                  },
                ]}
              />
              <View
                style={[
                  s.trackFill,
                  {
                    top: TRACK_TOP * k,
                    left: (KNOB / 2) * k,
                    width: index * STEP * k,
                    backgroundColor: hourColour,
                  },
                ]}
              />
              {TIME_OF_DAY_IDS.map((id, i) => (
                <View
                  key={id}
                  style={[
                    s.tick,
                    {
                      top: TRACK_TOP * k,
                      left: (KNOB / 2 + i * STEP - 2) * k,
                    },
                  ]}
                />
              ))}
              <View
                style={[
                  s.knob,
                  {
                    top: KNOB_TOP * k,
                    left: index * STEP * k,
                    borderColor: hourColour,
                  },
                ]}
              />
            </View>
          </GestureDetector>
        </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

const SLIDE_MS = 240;
const HIDDEN_WIDTH = BUTTON / 2;

const slideIn = (hidden: number) => (values: EntryAnimationsValues) => {
  'worklet';
  return {
    initialValues: {
      width: hidden,
      opacity: 0,
    },
    animations: {
      width: withTiming(values.targetWidth, { duration: SLIDE_MS }),
      opacity: withTiming(1, { duration: SLIDE_MS / 2 }),
    },
  };
};

const slideOut = (hidden: number) => (values: ExitAnimationsValues) => {
  'worklet';
  return {
    initialValues: {
      width: values.currentWidth,
      opacity: 1,
    },
    animations: {
      width: withTiming(hidden, { duration: SLIDE_MS * 0.7 }),
      opacity: withTiming(0, { duration: SLIDE_MS * 0.7 }),
    },
  };
};

const ACCESSIBILITY_ACTIONS = [{ name: 'increment' }, { name: 'decrement' }] as const;

const makeStyles = (t: Theme) => StyleSheet.create({
  column: {
    alignItems: 'flex-start',
    gap: LIGHT_COLUMN_GAP,
  },
  hourRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hourButton: {
    zIndex: 2,
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
    overflow: 'hidden',
    ...ELEVATION.card,
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
  buttonChip: {
    borderRadius: ROOM_CHIP_RADIUS,
    backgroundColor: BAR_FILL,
    ...CARD_CHROME,
    borderWidth: 0,
  },
  buttonArtwork: {
    ...CARD_CHROME,
    borderRadius: BUTTON / 2,
  },
  hourArtWindow: {
    overflow: 'hidden',
  },
  hourArtImage: {
    position: 'absolute',
  },
  hourArtBleed: {},
  panel: {
    height: PANEL_HEIGHT,
    marginLeft: -BUTTON / 2,
    justifyContent: 'center',
    borderTopRightRadius: PANEL_HEIGHT / 2,
    borderBottomRightRadius: PANEL_HEIGHT / 2,
    overflow: 'hidden',
    paddingLeft: BUTTON / 2 + 10,
    paddingRight: 14,
    backgroundColor: BAR_FILL,
    ...ELEVATION.card,
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
  panelLabel: {
    marginTop: 3,
    ...LEXEND.semibold,
    fontSize: 10,
    lineHeight: 12,
    color: '#231F20',
    textAlign: 'center',
  },
  trackHit: {
    width: TRACK + KNOB,
    height: 24,
  },
  track: {
    position: 'absolute',
    height: 4,
    borderRadius: 2,
    backgroundColor: t.surfaceRaised,
  },
  trackFill: {
    position: 'absolute',
    height: 4,
    borderRadius: 2,
  },
  tick: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#b8afa8',
  },
  knob: {
    position: 'absolute',
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: BAR_FILL,
    borderWidth: 2,
    ...ELEVATION.card,
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
});
