import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import * as Speech from "expo-speech";
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
  requestedItemId?: string | null;
  onSessionChange?: (active: boolean) => void;
}

const COPY: Record<ProfileId, { welcome: string; intro: string; complete: string }> = {
  visual: {
    welcome: "Your assembled LACK table is already in your home!",
    intro: "Long-press and drag it to adjust its position.",
    complete: "LACK placed! Complete more assembly tasks to add more furniture.",
  },
  momentum: {
    welcome: "Your assembled LACK table is already home!",
    intro: "Long-press and drag it anywhere you like.",
    complete: "Your first piece is home! Complete more assembly tasks to make your room even better.",
  },
  clearPath: {
    welcome: "Your assembled LACK table is already in your home.",
    intro: "Long-press and drag it to adjust its position.",
    complete: "LACK table placed. Complete more tasks to add more furniture.",
  },
  control: {
    welcome: "Your assembled LACK table is already in your home.",
    intro: "Long-press and drag it to adjust its position.",
    complete: "Your first piece is home. Complete assembly tasks to add more furniture.",
  },
};

export function RoomFirstPlacementGuide({ requestedItemId, onSessionChange }: Props) {
  const s = useStyles(makeStyles);
  const profile = useGameStore((state) => state.profile);
  const audioEnabled = useGameStore((state) => state.settings.audio);
  const activeEdit = usePlacementStore((state) => state.activeEdit);
  const hydrated = usePlacementStore((state) => state.hydrated);
  const layout = usePlacementStore((state) => state.layout);
  const [stage, setStage] = useState<GuideStage>("idle");
  const [momentumMessage, setMomentumMessage] = useState<string | null>(null);
  const guideId = useRef<string | null>(null);
  const initialCell = useRef<{ x: number; y: number } | null>(null);
  const initialRotation = useRef(0);
  const requestConsumed = useRef(false);
  const pulse = useRef(new Animated.Value(0.94)).current;
  const mode = profile ?? "control";

  useEffect(() => {
    if (!hydrated || !requestedItemId || activeEdit || requestConsumed.current || stage !== "idle") return;
    requestConsumed.current = true;
    const started = usePlacementStore.getState().startPlacing(requestedItemId, {
      firstPlacementGuide: true,
    });
    if (!started) {
      requestConsumed.current = false;
      return;
    }
    onSessionChange?.(true);
    setStage(mode === "control" ? "choice" : "move");
  }, [activeEdit, hydrated, mode, onSessionChange, requestedItemId, stage]);

  useEffect(() => {
    if (!hydrated || !activeEdit?.firstPlacementGuide || guideId.current) return;
    guideId.current = activeEdit.placement.instanceId;
    initialCell.current = { ...activeEdit.placement.cell };
    initialRotation.current = activeEdit.placement.rotSteps;
    setStage((current) =>
      current === "idle" ? (mode === "control" ? "choice" : "move") : current,
    );
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
    if (!audioEnabled || stage === "idle") return;

    const message = spokenMessageForStage(stage, mode);
    if (!message) return;

    Speech.stop();
    Speech.speak(message, { rate: 0.82 });
    return () => {
      Speech.stop();
    };
  }, [audioEnabled, mode, stage]);

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
            <Text style={s.moveAgain}>Long-press it anytime to move it again.</Text>
            <View style={s.actions}>
              <Button
                label="Build more furniture"
                variant="primary"
                small
                onPress={() => {
                  finish();
                  router.push("/catalogue");
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
            <Text style={s.stepLabel}>YOUR ROOM</Text>
            <Text style={s.title}>{COPY[mode].welcome} Would you like help adjusting its position?</Text>
            <View style={s.actions}>
              <Button
                label="Guide me"
                variant="primary"
                small
                onPress={() => {
                  setStage("move");
                }}
              />
              <Pressable
                onPress={() => {
                  setStage("explore");
                }}
                hitSlop={8}
              >
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
      <View
        style={[
          s.guideCard,
          mode === "clearPath" && s.clearCard,
          stage === "move" && s.placedCard,
        ]}
        pointerEvents="box-none"
      >
        {mode === "control" ? null : (
          <Image source={avatarForProfile(mode)} style={s.avatar} resizeMode="cover" />
        )}
        <View style={s.copy}>
          {mode === "clearPath" ? (
            <>
              {stage === "move" ? (
                <>
                  <Text style={s.stepLabel}>YOUR ROOM</Text>
                  <Text style={s.title}>{COPY[mode].welcome}</Text>
                  <Text style={s.sourceInstruction}>{COPY[mode].intro}</Text>
                </>
              ) : (
                <View style={s.checklist}>
                  <ChecklistRow label="Move the LACK table" state="done" />
                  <ChecklistRow label="Rotate if needed" state={stage === "rotate" ? "active" : "done"} />
                  <ChecklistRow label="Confirm its position" state={stage === "confirm" ? "active" : "next"} />
                </View>
              )}
            </>
          ) : (
            <>
              <Text style={s.stepLabel}>{stage === "move" ? "YOUR ROOM" : stage === "rotate" ? "ROTATE" : "PLACE"}</Text>
              <Text style={s.title}>{stage === "move" ? COPY[mode].welcome : instruction}</Text>
              {stage === "move" ? <Text style={s.sourceInstruction}>{COPY[mode].intro}</Text> : null}
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

function spokenMessageForStage(stage: GuideStage, mode: ProfileId): string | null {
  switch (stage) {
    case "choice":
      return `${COPY[mode].welcome} Would you like help adjusting its position?`;
    case "move":
      return `${COPY[mode].welcome} ${COPY[mode].intro}`;
    case "rotate":
      return mode === "visual" ? "Rotate if needed." : "Rotate it if you would like.";
    case "confirm":
      return mode === "visual"
        ? "Tap the check button to place it."
        : "Tap the check button when you are happy with the position.";
    case "explore":
      return "You can open placement guidance at any time.";
    case "complete":
      return `${COPY[mode].complete} Long-press it any time to move it again.`;
    default:
      return null;
  }
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
    placedCard: { left: 88, bottom: "34%", maxWidth: 430 },
    avatar: { width: 72, height: 72, borderRadius: 18, backgroundColor: t.surfaceRaised },
    copy: { flex: 1 },
    stepLabel: { ...LEXEND.bold, fontSize: 10, letterSpacing: 1.2, color: t.accent },
    title: { ...LEXEND.black, marginTop: 2, fontSize: 16, lineHeight: 21, color: t.text },
    visualCue: { ...LEXEND.black, marginTop: 8, fontSize: 28, color: t.accent },
    sourceInstruction: { ...LEXEND.bold, marginTop: 7, fontSize: 13, lineHeight: 18, color: t.textDim },
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
    moveAgain: { ...LEXEND.bold, marginTop: 5, fontSize: 13, lineHeight: 18, color: t.text },
  });
