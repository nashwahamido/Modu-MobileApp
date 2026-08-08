import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { Animated, Image, Pressable, StyleSheet, Text, View } from "react-native";

import { avatarForProfile } from "@/src/components/avatarAssets";
import type { ProfileId } from "@/src/game/core/profile";
import { useGameStore } from "@/src/game/core/store";
import { ConfettiRain } from "@/src/game/ui/celebration/Confetti";
import { Button } from "@/src/game/ui/system/Button";
import { ELEVATION, LEXEND, RADIUS, type Theme, useStyles } from "@/src/game/ui/system/theme";
import { usePlacementStore } from "../core/placement";

type GuideStage = "idle" | "choice" | "move" | "rotate" | "confirm" | "explore" | "complete";

interface Props {
  onSessionChange?: (active: boolean) => void;
}

const COPY: Record<ProfileId, { intro: string; complete: string }> = {
  visual: {
    intro: "Drag to move",
    complete: "LACK placed! Build more furniture to decorate your room.",
  },
  momentum: {
    intro: "Let’s give your LACK table a home!",
    complete: "Your first piece is home! Build more furniture to make your room even better.",
  },
  clearPath: {
    intro: "Move the LACK table",
    complete: "LACK table placed. Complete more tasks to add more furniture.",
  },
  control: {
    intro: "Drag the LACK table to move it.",
    complete: "Your first piece is home. Complete assembly tasks to add more furniture.",
  },
};

export function RoomFirstPlacementGuide({ onSessionChange }: Props) {
  const s = useStyles(makeStyles);
  const profile = useGameStore((state) => state.profile);
  const activeEdit = usePlacementStore((state) => state.activeEdit);
  const hydrated = usePlacementStore((state) => state.hydrated);
  const layout = usePlacementStore((state) => state.layout);
  const [stage, setStage] = useState<GuideStage>("idle");
  const [momentumMessage, setMomentumMessage] = useState<string | null>(null);
  const guideId = useRef<string | null>(null);
  const initialCell = useRef<{ x: number; y: number } | null>(null);
  const initialRotation = useRef(0);
  const pulse = useRef(new Animated.Value(0.94)).current;
  const mode = profile ?? "control";

  useEffect(() => {
    if (!hydrated || !activeEdit?.firstPlacementGuide || guideId.current) return;
    guideId.current = activeEdit.placement.instanceId;
    initialCell.current = { ...activeEdit.placement.cell };
    initialRotation.current = activeEdit.placement.rotSteps;
    setStage(mode === "control" ? "choice" : "move");
    onSessionChange?.(true);
  }, [activeEdit, hydrated, mode, onSessionChange]);

  useEffect(() => {
    if (mode !== "visual" || !["move", "rotate", "confirm"].includes(stage)) {
      pulse.stopAnimation();
      pulse.setValue(0.94);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.94, duration: 650, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [mode, pulse, stage]);

  useEffect(() => {
    if (!activeEdit || activeEdit.placement.instanceId !== guideId.current) return;
    const start = initialCell.current;
    const moved =
      !!start &&
      (activeEdit.placement.cell.x !== start.x || activeEdit.placement.cell.y !== start.y);
    if (stage === "move" && moved) {
      if (mode === "momentum") {
        setMomentumMessage("Great start!");
        setStage("rotate");
        return;
      }
      setStage("rotate");
    }
    if (stage === "rotate" && activeEdit.placement.rotSteps !== initialRotation.current) {
      if (mode === "momentum") {
        setMomentumMessage("Nice adjustment!");
        setStage("confirm");
        return;
      }
      setStage("confirm");
    }
  }, [activeEdit, mode, stage]);

  useEffect(() => {
    if (!momentumMessage) return;
    const timeout = setTimeout(() => setMomentumMessage(null), 900);
    return () => clearTimeout(timeout);
  }, [momentumMessage]);

  useEffect(() => {
    const id = guideId.current;
    if (!id || activeEdit) return;
    if (layout.some((placement) => placement.instanceId === id)) {
      setStage("complete");
      return;
    }
    guideId.current = null;
    setStage("idle");
    onSessionChange?.(false);
  }, [activeEdit, layout, onSessionChange]);

  const finish = () => {
    guideId.current = null;
    setStage("idle");
    onSessionChange?.(false);
  };

  if (stage === "idle") return null;

  if (stage === "complete") {
    return (
      <View style={s.fullLayer} pointerEvents="box-none">
        {mode === "momentum" ? <ConfettiRain delay={0} count={18} size={0.75} /> : null}
        <View style={s.completeCard}>
          <Image source={avatarForProfile(mode)} style={s.completeAvatar} resizeMode="cover" />
          <View style={s.completeCopy}>
            <Text style={s.completeTitle}>{mode === "momentum" ? "Great job!" : "Your furniture is home!"}</Text>
            <Text style={s.completeBody}>{COPY[mode].complete}</Text>
            <View style={s.actions}>
              <Button
                label="Start an assembly task"
                variant="primary"
                small
                onPress={() => {
                  finish();
                  router.replace({ pathname: "/play", params: { id: "dalfred-stool" } });
                }}
              />
              <Pressable onPress={finish} hitSlop={8}>
                <Text style={s.secondaryAction}>Explore my room</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    );
  }

  if (stage === "choice") {
    return (
      <View style={s.fullLayer} pointerEvents="box-none">
        <View style={s.guideCard}>
          <Image source={avatarForProfile(mode)} style={s.avatar} resizeMode="cover" />
          <View style={s.copy}>
            <Text style={s.title}>Would you like help placing your LACK table?</Text>
            <View style={s.actions}>
              <Button label="Guide me" variant="primary" small onPress={() => setStage("move")} />
              <Pressable onPress={() => setStage("explore")} hitSlop={8}>
                <Text style={s.secondaryAction}>I’ll place it myself</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    );
  }

  if (stage === "explore") {
    return (
      <View style={s.fullLayer} pointerEvents="box-none">
        <Pressable style={s.supportButton} onPress={() => setStage("move")}>
          <Image source={avatarForProfile(mode)} style={s.supportAvatar} resizeMode="cover" />
          <View>
            <Text style={s.supportTitle}>Support</Text>
            <Text style={s.supportBody}>Open placement guidance anytime.</Text>
          </View>
        </Pressable>
      </View>
    );
  }

  const instruction =
    stage === "move"
      ? COPY[mode].intro
      : stage === "rotate"
        ? mode === "visual"
          ? "Rotate if needed"
          : "Rotate it if you’d like."
        : mode === "visual"
          ? "Tap ✓ to place"
          : "Tap the check button when you’re happy with the position.";

  return (
    <View style={s.fullLayer} pointerEvents="box-none">
      {momentumMessage ? (
        <View style={s.momentumToast}>
          <Text style={s.momentumText}>{momentumMessage}</Text>
        </View>
      ) : null}
      <View style={[s.guideCard, mode === "clearPath" && s.clearCard]} pointerEvents="box-none">
        {mode === "control" ? null : (
          <Image source={avatarForProfile(mode)} style={s.avatar} resizeMode="cover" />
        )}
        <View style={s.copy}>
          {mode === "clearPath" ? (
            <View style={s.checklist}>
              <ChecklistRow label="Move the LACK table" state={stage === "move" ? "active" : "done"} />
              <ChecklistRow label="Rotate if needed" state={stage === "rotate" ? "active" : stage === "confirm" ? "done" : "next"} />
              <ChecklistRow label="Confirm its position" state={stage === "confirm" ? "active" : "next"} />
            </View>
          ) : (
            <>
              <Text style={s.stepLabel}>{stage === "move" ? "MOVE" : stage === "rotate" ? "ROTATE" : "PLACE"}</Text>
              <Text style={s.title}>{instruction}</Text>
              {mode === "visual" ? (
                <Animated.Text style={[s.visualCue, { transform: [{ scale: pulse }] }]}>
                  {stage === "move" ? "☝  ↔" : stage === "rotate" ? "↶  ↷" : "✓"}
                </Animated.Text>
              ) : null}
            </>
          )}
          {stage === "rotate" ? (
            <Pressable style={s.skipButton} onPress={() => setStage("confirm")} hitSlop={8}>
              <Text style={s.skipText}>Skip rotation</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function ChecklistRow({ label, state }: { label: string; state: "done" | "active" | "next" }) {
  const s = useStyles(makeStyles);
  return (
    <View style={[s.checkRow, state !== "active" && s.checkRowFaded]}>
      <Text style={s.checkIcon}>{state === "done" ? "✓" : state === "active" ? "●" : "○"}</Text>
      <Text style={[s.checkLabel, state === "active" && s.checkLabelActive]}>{label}</Text>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    fullLayer: { ...StyleSheet.absoluteFillObject, zIndex: 24 },
    guideCard: {
      position: "absolute",
      left: 76,
      bottom: 24,
      maxWidth: 390,
      minHeight: 108,
      padding: 14,
      borderRadius: RADIUS.panel,
      backgroundColor: t.surface,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      ...ELEVATION.card,
    },
    clearCard: { width: 360 },
    avatar: { width: 72, height: 72, borderRadius: 18, backgroundColor: t.surfaceRaised },
    copy: { flex: 1 },
    stepLabel: { ...LEXEND.bold, fontSize: 10, letterSpacing: 1.2, color: t.accent },
    title: { ...LEXEND.black, marginTop: 2, fontSize: 16, lineHeight: 21, color: t.text },
    visualCue: { ...LEXEND.black, marginTop: 8, fontSize: 28, color: t.accent },
    actions: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 16 },
    secondaryAction: { ...LEXEND.bold, fontSize: 13, color: t.textDim },
    skipButton: { alignSelf: "flex-start", marginTop: 8 },
    skipText: { ...LEXEND.bold, fontSize: 12, color: t.accent },
    checklist: { gap: 7 },
    checkRow: { minHeight: 30, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 9, borderRadius: 10, backgroundColor: t.surfaceRaised },
    checkRowFaded: { opacity: 0.42, backgroundColor: "transparent" },
    checkIcon: { ...LEXEND.bold, width: 16, color: t.accent },
    checkLabel: { ...LEXEND.bold, fontSize: 13, color: t.textDim },
    checkLabelActive: { ...LEXEND.black, color: t.text },
    momentumToast: { position: "absolute", top: 92, alignSelf: "center", paddingHorizontal: 18, paddingVertical: 10, borderRadius: RADIUS.pill, backgroundColor: t.surface, ...ELEVATION.card },
    momentumText: { ...LEXEND.black, fontSize: 15, color: t.accent },
    supportButton: { position: "absolute", top: 70, left: 20, paddingRight: 15, height: 52, flexDirection: "row", alignItems: "center", gap: 9, borderRadius: RADIUS.pill, backgroundColor: t.surface, ...ELEVATION.card },
    supportAvatar: { width: 52, height: 52, borderRadius: 26 },
    supportTitle: { ...LEXEND.black, fontSize: 14, color: t.text },
    supportBody: { ...LEXEND.bold, fontSize: 10, color: t.textDim },
    completeCard: { position: "absolute", alignSelf: "center", top: "28%", width: 560, padding: 20, borderRadius: RADIUS.panel, backgroundColor: t.surface, flexDirection: "row", alignItems: "center", gap: 18, ...ELEVATION.raised },
    completeAvatar: { width: 112, height: 112, borderRadius: 22, backgroundColor: t.surfaceRaised },
    completeCopy: { flex: 1 },
    completeTitle: { ...LEXEND.black, fontSize: 22, color: t.text },
    completeBody: { ...LEXEND.bold, marginTop: 5, fontSize: 14, lineHeight: 20, color: t.textDim },
  });
