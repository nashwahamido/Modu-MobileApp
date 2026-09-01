import { ReactNode } from "react";
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";

import { playSfx } from "@/src/game/audio/sfx";
import { ELEVATION, RADIUS, SIZE, SPACE, Theme, TYPE, useTheme } from "./theme";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function GrainOverlay({ radius }: { radius: number }) {
  return null;
}

export type ButtonVariant = "primary" | "secondary" | "success" | "ghost";

interface ButtonProps {
  label?: string;
  icon?: ReactNode;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  pill?: boolean;
  small?: boolean;
  badge?: number | string;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  hitSlop?: number;
  accessibilityLabel?: string;
}

function fillFor(t: Theme, variant: ButtonVariant, pressed: boolean): string {
  if (variant === "primary") return pressed ? t.accentPressed : t.accent;
  if (variant === "success") return t.success;
  if (variant === "ghost") return pressed ? t.surfaceRaised : "transparent";
  return pressed ? t.accentPressed : t.surface;
}

function textFor(t: Theme, variant: ButtonVariant, pressed: boolean): string {
  if (variant === "primary") return t.onAccent;
  if (variant === "success") return t.onSuccess;
  if (variant === "secondary" && pressed) return t.onAccent;
  return t.text;
}

function withClick(onPress?: () => void) {
  if (!onPress) return undefined;
  return () => {
    playSfx("click");
    onPress();
  };
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
  labelStyle,
  hitSlop = 8,
  accessibilityLabel,
}: ButtonProps) {
  const t = useTheme();
  const filled = variant === "primary" || variant === "success";

  return (
    <Pressable
      onPress={withClick(onPress)}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
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
        disabled && styles.disabled,
        style,
      ]}
    >
      {({ pressed }) => (
        <>
          <GrainOverlay radius={pill ? RADIUS.pill : RADIUS.control} />
          {icon}
          {label ? (
            <Text
              style={[
                small ? TYPE.labelSm : TYPE.label,
                {
                  color: disabled
                    ? t.textFaint
                    : textFor(t, variant, pressed && !disabled),
                },
                icon ? { marginLeft: SPACE.sm } : null,
                labelStyle,
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
        </>
      )}
    </Pressable>
  );
}

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
      onPress={withClick(onPress)}
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
          backgroundColor:
            pressed && !disabled && variant === "secondary"
              ? t.surfaceRaised
              : fillFor(t, variant, pressed && !disabled),
          borderColor: t.border,
          borderWidth: StyleSheet.hairlineWidth * 2,
        },
        ELEVATION.card,
        disabled && styles.disabled,
        style,
      ]}
    >
      <GrainOverlay radius={RADIUS.control} />
      {icon}
    </Pressable>
  );
}

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
      onPress={withClick(onPress)}
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
      <GrainOverlay radius={SIZE.fab / 2} />
      {icon}
    </Pressable>
  );
}

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
      <GrainOverlay radius={RADIUS.panel} />
      {children}
    </View>
  );
}

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
      onPress={withClick(onPress)}
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
            backgroundColor: t.accent,
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
  fill: { height: "100%", borderRadius: RADIUS.pill },
});