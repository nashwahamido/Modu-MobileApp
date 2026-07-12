// The button and surface primitives.
//
// The look, in one line: a DARK TRANSLUCENT FILL, a HAIRLINE BORDER, and a SOFT WIDE
// SHADOW. That trio is what makes every control in the reference read as a physical chip
// lifted off the workbench rather than a flat rectangle. Drop any one of the three and it
// stops working — most obviously the border, without which the surfaces dissolve into the
// background on a phone in daylight.
//
// Press feedback is a FILL change, never a scale or an opacity fade: opacity makes a
// control look disabled for the length of the press, and on a touch device the finger is
// covering the thing anyway. The fill lifts to `surfaceRaised` — the same value the
// mockup uses for an active segment, so "pressed" and "active" are visibly the same idea.

import { ReactNode } from "react";
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";

import { ELEVATION, RADIUS, SIZE, SPACE, Theme, TYPE, useTheme } from "./theme";

/** primary  — the ONE action that moves the build forward. At most one on screen.
 *  secondary — everything else that can be pressed.
 *  success   — a completed / confirming state. Not an invitation to press.
 *  ghost     — a control that must not compete: chrome over the 3D scene. */
export type ButtonVariant = "primary" | "secondary" | "success" | "ghost";

interface ButtonProps {
  label?: string;
  /** A glyph or an <Image>. Sits before the label. */
  icon?: ReactNode;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Pill instead of the standard 14pt radius — for chips and toggles. */
  pill?: boolean;
  small?: boolean;
  /** A count, rendered in the accent (the Hint button's "2" in the reference). */
  badge?: number | string;
  style?: StyleProp<ViewStyle>;
  hitSlop?: number;
}

function fillFor(t: Theme, variant: ButtonVariant, pressed: boolean): string {
  if (variant === "primary") return pressed ? t.accentPressed : t.accent;
  if (variant === "success") return t.success;
  if (variant === "ghost") return pressed ? t.surfaceRaised : "transparent";
  return pressed ? t.surfaceRaised : t.surface;
}

function textFor(t: Theme, variant: ButtonVariant): string {
  if (variant === "primary") return t.onAccent;
  if (variant === "success") return t.onSuccess;
  return t.text;
}

export function Button({
  label,
  icon,
  onPress,
  variant = "secondary",
  disabled,
  pill,
  small,
  badge,
  style,
  hitSlop = 8,
}: ButtonProps) {
  const t = useTheme();
  const filled = variant === "primary" || variant === "success";

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: small ? SIZE.controlHeightSm : SIZE.controlHeight,
          paddingHorizontal: small ? SPACE.md : SPACE.lg,
          borderRadius: pill ? RADIUS.pill : RADIUS.control,
          backgroundColor: fillFor(t, variant, pressed && !disabled),
          borderColor: filled ? "transparent" : t.border,
          borderWidth: variant === "ghost" ? 0 : StyleSheet.hairlineWidth * 2,
        },
        variant !== "ghost" && ELEVATION.card,
        // The ONE place opacity is used: a genuinely unavailable control. It reads as
        // "not yet", which is exactly what a disabled Redo is.
        disabled && styles.disabled,
        style,
      ]}
    >
      {icon}
      {label ? (
        <Text
          style={[
            small ? TYPE.labelSm : TYPE.label,
            { color: disabled ? t.textFaint : textFor(t, variant) },
            icon ? { marginLeft: SPACE.sm } : null,
          ]}
        >
          {label}
        </Text>
      ) : null}
      {badge != null ? (
        <View style={[styles.badge, { backgroundColor: t.accent }]}>
          <Text style={[TYPE.labelSm, { color: t.onAccent }]}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** A square control carrying only a glyph — the gear, the back arrow, undo/redo. Square
 *  rather than round: the reference reserves the CIRCLE for the primary action, so shape
 *  alone tells you which control is the important one. */
export function IconButton({
  icon,
  onPress,
  disabled,
  variant = "secondary",
  small,
  style,
  accessibilityLabel,
}: {
  icon: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  variant?: ButtonVariant;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel: string;
}) {
  const t = useTheme();
  const size = small ? SIZE.controlHeightSm : SIZE.controlHeight;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.base,
        {
          width: size,
          height: size,
          paddingHorizontal: 0,
          borderRadius: RADIUS.control,
          backgroundColor: fillFor(t, variant, pressed && !disabled),
          borderColor: t.border,
          borderWidth: StyleSheet.hairlineWidth * 2,
        },
        ELEVATION.card,
        disabled && styles.disabled,
        style,
      ]}
    >
      {icon}
    </Pressable>
  );
}

/** The primary action. A CIRCLE, filled with the accent, and the only control on screen
 *  allowed the heavy shadow — so it is findable by shape and weight, not just colour. */
export function Fab({
  icon,
  onPress,
  accessibilityLabel,
  style,
}: {
  icon: ReactNode;
  onPress?: () => void;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.base,
        {
          width: SIZE.fab,
          height: SIZE.fab,
          paddingHorizontal: 0,
          borderRadius: SIZE.fab / 2,
          backgroundColor: pressed ? t.accentPressed : t.accent,
        },
        ELEVATION.raised,
        style,
      ]}
    >
      {icon}
    </Pressable>
  );
}

/** A panel. Also the "grouped control" from the reference (Reset view / Undo / Redo) when
 *  you put Rows inside it — a stack of controls sharing one card, divided by hairlines,
 *  which is quieter than three floating buttons. */
export function Panel({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.surface,
          borderColor: t.border,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderRadius: RADIUS.panel,
          overflow: "hidden",
        },
        ELEVATION.card,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** A row inside a Panel — the grouped-control pattern. */
export function PanelRow({
  label,
  icon,
  onPress,
  disabled,
  divider = true,
}: {
  label: string;
  icon?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  divider?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.row,
        divider && {
          borderBottomWidth: StyleSheet.hairlineWidth * 2,
          borderBottomColor: t.border,
        },
        pressed && !disabled && { backgroundColor: t.surfaceRaised },
        disabled && styles.disabled,
      ]}
    >
      {icon}
      <Text
        style={[
          TYPE.label,
          { color: disabled ? t.textFaint : t.text },
          icon ? { marginLeft: SPACE.md } : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** The segmented control (Parts | Steps). An inset groove with the active segment lifted
 *  into the accent — the same "raised = active" language as a pressed button. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  style,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.segTrack,
        { backgroundColor: t.surfaceInset, borderRadius: RADIUS.control },
        style,
      ]}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              styles.segItem,
              {
                borderRadius: RADIUS.control - 3,
                backgroundColor: active
                  ? t.accent
                  : pressed
                    ? t.surfaceRaised
                    : "transparent",
              },
            ]}
          >
            <Text
              style={[
                TYPE.labelSm,
                { color: active ? t.onAccent : t.textDim },
              ]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Progress. Inset track, accent fill — NOT green: green means "done" in this palette, and
 *  a half-full bar is not done. The bar turns `success` only at 100%. */
export function ProgressBar({
  value,
  total,
  style,
}: {
  value: number;
  total: number;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const pct = total > 0 ? Math.min(1, value / total) : 0;
  const done = pct >= 1;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: value }}
      style={[styles.track, { backgroundColor: t.surfaceInset }, style]}
    >
      <View
        style={[
          styles.fill,
          {
            width: `${pct * 100}%`,
            backgroundColor: done ? t.success : t.accent,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.4 },
  badge: {
    marginLeft: SPACE.sm,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    minHeight: SIZE.controlHeight,
  },
  segTrack: { flexDirection: "row", padding: 3 },
  segItem: {
    flex: 1,
    minHeight: SIZE.controlHeightSm - 6,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACE.md,
  },
  track: { height: 8, borderRadius: RADIUS.pill, overflow: "hidden" },
  fill: { height: 8, borderRadius: RADIUS.pill },
});
