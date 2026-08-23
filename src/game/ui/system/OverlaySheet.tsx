// The shared overlay primitive: a full-screen scrim with a centered card that slides up + fades in on mount. One source of truth for how modal overlays are framed — scrim, card radius, elevation, and the optional title/subtitle/close header — so every overlay reads as one system instead of each surface re-styling its own scrim and card. Render your content as children.
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

// "panel" = a large near-full card (lists, grids). "dialog" = a small centered card (confirmations).
type SheetSize = "panel" | "dialog";
// "center" = a small fade-up in place. "bottom" = a bottom sheet that slides all the way up from off-screen, matching the OS modal transition the (presentation) routes use.
type SheetAnchor = "center" | "bottom";

export interface OverlaySheetProps {
  // Tap-the-scrim / close-button handler. Omit to make the sheet non-dismissable.
  onClose?: () => void;
  // Optional header. When `title` is set, a title/subtitle row (with a close button, if onClose) is drawn above the children.
  title?: string;
  subtitle?: string;
  size?: SheetSize;
  anchor?: SheetAnchor;
  // Whether tapping the scrim dismisses. Default true; ignored without onClose.
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

  // Slide + fade on mount. The sheet is conditionally rendered by its caller, so mounting == opening. "bottom" travels a full screen height (starts fully off-screen below); "center" is a small nudge. The timing lives in ./slideUp, shared with the shop and inventory popups, so one definition of this feel serves all three.
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
    // Bottom-anchored: the panel rests against the bottom edge and slides up into it.
    scrimBottom: { justifyContent: "flex-end" },
    card: { backgroundColor: t.surface, borderRadius: RADIUS.panel, padding: SPACE.xl, ...ELEVATION.card },
    panel: { width: "88%", height: "88%" },
    // A wider, taller card for the bottom-sheet form so it reads like the Shop modal.
    panelBottom: { width: "100%", height: "92%" },
    dialog: { width: 320, alignItems: "center" },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: SPACE.md },
    headerText: { flexShrink: 1 },
    title: { ...TYPE.title, color: t.text },
    subtitle: { ...TYPE.labelSm, color: t.textDim, marginTop: 2 },
  });