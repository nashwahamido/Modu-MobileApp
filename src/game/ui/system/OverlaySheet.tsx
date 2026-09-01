import {
  PropsWithChildren,
  useEffect,
  useRef } from "react";
import { Animated,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Pressable } from "@/src/components/Pressable";

import { CloseIcon } from "@/src/components/Icons";
import { SLIDE_UP } from "./slideUp";
import { ELEVATION, RADIUS, SPACE, Theme, TYPE, useFixedStyles, useTheme } from "./theme";
import { GrainOverlay } from "@/src/game/ui/system/Button";

type SheetSize = "panel" | "dialog";
type SheetAnchor = "center" | "bottom";

export interface OverlaySheetProps {
  onClose?: () => void;
  title?: string;
  subtitle?: string;
  size?: SheetSize;
  anchor?: SheetAnchor;
  dismissOnBackdrop?: boolean;
}

export function OverlaySheet({
  onClose,
  title,
  subtitle,
  size = "panel",
  anchor = "center",
  dismissOnBackdrop = true,
  children,
}: PropsWithChildren<OverlaySheetProps>) {
  const styles = useFixedStyles(makeStyles);
  const t = useTheme();
  const { height } = useWindowDimensions();

  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: anchor === "bottom" ? SLIDE_UP.enterMs : SLIDE_UP.exitMs,
      easing: SLIDE_UP.enterEasing,
      useNativeDriver: true,
    }).start();
  }, [anim, anchor]);
  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [anchor === "bottom" ? height : SLIDE_UP.centerTravel, 0],
  });

  return (
    <View style={[styles.scrim, anchor === "bottom" ? styles.scrimBottom : null]}>
      {dismissOnBackdrop && onClose ? (
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss" />
      ) : null}
      <Animated.View
        style={[
          styles.card,
          size === "dialog" ? styles.dialog : styles.panel,
          anchor === "bottom" ? styles.panelBottom : null,
          { opacity: anim, transform: [{ translateY }] },
        ]}
      >
        <GrainOverlay radius={RADIUS.panel} />
        {title ? (
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            {onClose ? (
              <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close">
                <CloseIcon size={28} color={t.text} />
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {children}
      </Animated.View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    scrim: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 20,
      backgroundColor: t.scrim,
      alignItems: "center",
      justifyContent: "center",
      padding: SPACE.lg,
    },
    scrimBottom: { justifyContent: "flex-end" },
    card: { backgroundColor: t.surface, borderRadius: RADIUS.panel, padding: SPACE.xl, ...ELEVATION.card },
    panel: { width: "88%", height: "88%" },
    panelBottom: { width: "100%", height: "92%" },
    dialog: { width: 320, alignItems: "center" },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: SPACE.md },
    headerText: { flexShrink: 1 },
    title: { ...TYPE.title, color: t.text },
    subtitle: { ...TYPE.labelSm, color: t.textDim, marginTop: 2 },
  });