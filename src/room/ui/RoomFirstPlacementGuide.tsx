import { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import * as Speech from "@/src/onboarding/speech";
import { Image, StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/src/components/Pressable";

import { avatarForProfile } from "@/src/components/avatarAssets";
import type { ProfileId } from "@/src/game/core/profile";
import { useCurrentUserId } from "@/src/data";
import { useGameStore } from "@/src/game/core/store";
import { ConfettiRain } from "@/src/game/ui/celebration/Confetti";
import { Button } from "@/src/game/ui/system/Button";
import {
  ELEVATION,
  LEXEND,
  RADIUS,
  type Theme,
  useStyles,
} from "@/src/game/ui/system/theme";
import { usePlacementStore } from "../core/placement";
import { roomGuideVoicePath } from "./roomGuideVoice";
import type {
  PlacementGuideInteraction,
  PlacementGuideTarget,
} from "./PlacementRail";

/** Shown ONCE, ever, after the tutorial's LACK table. The route param that arms this guide is only
 *  sent by the tutorial on completion, so it already means "just finished the first table"; what it
 *  cannot survive is a SECOND arrival with the same param. AsyncStorage matches the room's own
 *  coaches (ROOM_EDIT_GUIDE_KEY, ROOM_WELCOME_GUIDE_KEY) rather than the profile flag the Map coach
 *  uses — this one is tied to a route passed through once on this device. */
const FIRST_PLACEMENT_GUIDE_PREFIX = "modu.first-placement-guide-seen.v1";

/**
 * PER USER, not per install.
 *
 * The first version wrote one shared key, and that is a latch on the DEVICE: the first player to
 * finish the tutorial consumed it, and every account created afterwards pressed "Place the LACK in
 * my room" and got an empty room — no placement, no guide, no error. Exactly the same mistake as the
 * Map coach's local mirror, and with the same symptom: a fresh account silently inheriting a
 * decision made by a previous one.
 *
 * The guide is per-install rather than per-account by design — it is tied to a route param passed
 * through once on this device, not to anything the profile stores — but "this install" still has to
 * mean "this install, for this player".
 */
const guideKey = (userId: string) => `${FIRST_PLACEMENT_GUIDE_PREFIX}:${userId}`;

type GuideStage =
  | "idle"
  | "style"
  | "rotate"
  | "reposition"
  | "confirm"
  | "complete";

interface Props {
  requestedItemId?: string | null;
  interaction?: PlacementGuideInteraction | null;
  onTargetChange?: (target: PlacementGuideTarget | null) => void;
  onSessionChange?: (active: boolean) => void;
}

const STAGE_COPY = {
  style: {
    label: "YOUR ROOM",
    title: "Your LACK table is already in your room.",
    body: "Choose a style you like.",
    speech: "Your LACK table is already in your room. Choose a style you like.",
  },
  reposition: {
    label: "REPOSITION",
    title: "Are you happy with the placement?",
    body: "You can drag it to any spot.",
    speech: "Are you happy with the placement? You can drag it to any spot.",
  },
  rotate: {
    label: "ROTATE",
    title: "That looks good.",
    body: "Rotate it to find an angle you like.",
    speech: "That looks good. Rotate it to find an angle you like.",
  },
  confirm: {
    label: "PLACE",
    title: "Everything’s ready.",
    body: "Place it here!",
    speech: "Everything is ready. Place it here.",
  },
} as const;

const COMPLETE_COPY: Record<ProfileId, string> = {
  visual: "LACK placed! Complete more assembly tasks to add more furniture.",
  momentum:
    "Your first piece is home! Complete more assembly tasks to make your room even better.",
  clearPath: "LACK table placed. Complete more tasks to add more furniture.",
  control:
    "Your first piece is home. Complete assembly tasks to add more furniture.",
};

export function RoomFirstPlacementGuide({
  requestedItemId,
  interaction,
  onTargetChange,
  onSessionChange,
}: Props) {
  const s = useStyles(makeStyles);
  // Whose install-latch this is — see guideKey.
  const me = useCurrentUserId();
  const profile = useGameStore((state) => state.profile);
  const audioEnabled = useGameStore((state) => state.settings.audio);
  const activeEdit = usePlacementStore((state) => state.activeEdit);
  const hydrated = usePlacementStore((state) => state.hydrated);
  const layout = usePlacementStore((state) => state.layout);
  const [stage, setStage] = useState<GuideStage>("idle");
  const guideId = useRef<string | null>(null);
  const requestConsumed = useRef(false);
  const handledInteractionSequence = useRef(0);
  const mode = profile ?? "control";

  useEffect(() => {
    if (
      !hydrated ||
      !requestedItemId ||
      activeEdit ||
      requestConsumed.current ||
      stage !== "idle"
    ) {
      return;
    }

    // Claimed BEFORE the async read: this effect re-runs on every store change, so without it two
    // passes can both get past the guard and start the placement twice.
    requestConsumed.current = true;

    let alive = true;
    void AsyncStorage.getItem(guideKey(me))
      .then((seen) => {
        if (!alive || seen) return;
        const started = usePlacementStore
          .getState()
          .startPlacing(requestedItemId, { firstPlacementGuide: true });
        if (!started) {
          requestConsumed.current = false;
          return;
        }
        // Written on START, not on finish: a player who backgrounds the app mid-script has still had
        // it, and the opposite failure is a walkthrough that returns until it is played to the end.
        AsyncStorage.setItem(guideKey(me), "1").catch((err) =>
          console.warn("[room] could not save first-placement guide state", err),
        );
        onSessionChange?.(true);
        setStage("style");
      })
      .catch((err) =>
        console.warn("[room] could not read first-placement guide state", err),
      );

    return () => {
      alive = false;
    };
  }, [activeEdit, hydrated, me, onSessionChange, requestedItemId, stage]);

  useEffect(() => {
    if (!hydrated || !activeEdit?.firstPlacementGuide || guideId.current)
      return;
    guideId.current = activeEdit.placement.instanceId;
    setStage((current) => (current === "idle" ? "style" : current));
    onSessionChange?.(true);
  }, [activeEdit, hydrated, onSessionChange]);

  useEffect(() => {
    const target =
      stage === "style" ||
      stage === "rotate" ||
      stage === "confirm" ||
      stage === "reposition"
        ? stage
        : null;
    onTargetChange?.(target);
  }, [onTargetChange, stage]);

  useEffect(
    () => () => {
      onTargetChange?.(null);
    },
    [onTargetChange],
  );

  useEffect(() => {
    if (
      !interaction ||
      interaction.sequence <= handledInteractionSequence.current
    ) {
      return;
    }
    handledInteractionSequence.current = interaction.sequence;

    if (stage === "style" && interaction.type === "style") {
      setStage("reposition");
    } else if (stage === "reposition" && interaction.type === "reposition") {
      setStage("rotate");
    } else if (stage === "rotate" && interaction.type === "rotate") {
      setStage("confirm");
    }
  }, [interaction, stage]);

  useEffect(() => {
    if (!audioEnabled || stage === "idle") return;

    const message =
      stage === "complete"
        ? `Your furniture is home. ${COMPLETE_COPY[mode]}`
        : STAGE_COPY[stage].speech;
    Speech.stop();
    // LUMI'S RECORDING WHERE THERE IS ONE, synthesis everywhere else.
    //
    // Gated on the profile, not just on the clip existing: the bucket holds one companion's takes of
    // this guide, and the guide runs for all four. Reading `Lumi-room` to a player who chose Pebble
    // would hand them the wrong voice mid-sentence — worse than the synthesised line they get now,
    // and silent about being wrong. The other three keep exactly the behaviour they have.
    //
    // `rotate` has no recording even for Lumi, so it falls through to speech here too. speakLine
    // takes both and picks, so there is no branch to keep in step.
    const clip = mode === "visual" ? roomGuideVoicePath(stage) : null;
    if (clip) {
      Speech.speakLine(clip, message, { rate: 0.82 });
    } else {
      Speech.speak(message, { rate: 0.82 });
    }
    return () => {
      Speech.stop();
    };
  }, [audioEnabled, mode, stage]);

  useEffect(() => {
    const id = guideId.current;
    if (!id || activeEdit) return;

    if (layout.some((placement) => placement.instanceId === id)) {
      setStage("complete");
      return;
    }

    guideId.current = null;
    setStage("idle");
    onTargetChange?.(null);
    onSessionChange?.(false);
  }, [activeEdit, layout, onSessionChange, onTargetChange]);

  const finish = () => {
    guideId.current = null;
    onTargetChange?.(null);
    setStage("idle");
    onSessionChange?.(false);
  };

  if (stage === "idle") return null;

  if (stage === "complete") {
    return (
      <View style={s.fullLayer} pointerEvents="box-none">
        {mode === "momentum" ? (
          <ConfettiRain delay={0} count={18} size={0.75} />
        ) : null}
        <View style={s.completeCard}>
          <Image
            source={avatarForProfile(mode)}
            style={s.completeAvatar}
            resizeMode="cover"
          />
          <View style={s.completeCopy}>
            <Text style={s.completeTitle}>
              {mode === "momentum" ? "Great job!" : "Your furniture is home!"}
            </Text>
            <Text style={s.completeBody}>{COMPLETE_COPY[mode]}</Text>
            {/* <Text style={s.moveAgain}>
              Long-press it anytime to move it again.
            </Text> */}
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

  const copy = STAGE_COPY[stage];
  return (
    <View style={s.fullLayer} pointerEvents="box-none">
      <View style={s.guideCard} pointerEvents="none">
        <Image
          source={avatarForProfile(mode)}
          style={s.avatar}
          resizeMode="cover"
        />
        <View style={s.copy}>
          <Text style={s.stepLabel}>{copy.label}</Text>
          <Text style={s.title}>{copy.title}</Text>
          <Text style={s.instruction}>{copy.body}</Text>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    fullLayer: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 24,
    },
    guideCard: {
      position: "absolute",
      left: 64,
      top: "22%",
      width: 360,
      minHeight: 108,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 14,
      borderRadius: RADIUS.panel,
      backgroundColor: t.surface,
      ...ELEVATION.card,
    },
    avatar: {
      width: 72,
      height: 72,
      borderRadius: 18,
      backgroundColor: t.surfaceRaised,
    },
    copy: {
      flex: 1,
    },
    stepLabel: {
      ...LEXEND.bold,
      fontSize: 10,
      letterSpacing: 1.2,
      color: t.accent,
    },
    title: {
      ...LEXEND.black,
      marginTop: 2,
      fontSize: 17,
      lineHeight: 22,
      color: t.text,
    },
    instruction: {
      ...LEXEND.bold,
      marginTop: 5,
      fontSize: 13,
      lineHeight: 18,
      color: t.textDim,
    },
    completeCard: {
      position: "absolute",
      left: "50%",
      top: "28%",
      width: 560,
      minHeight: 190,
      transform: [{ translateX: -280 }],
      flexDirection: "row",
      alignItems: "center",
      gap: 20,
      padding: 22,
      borderRadius: RADIUS.panel,
      backgroundColor: t.surface,
      ...ELEVATION.card,
    },
    completeAvatar: {
      width: 130,
      height: 130,
      borderRadius: 24,
      backgroundColor: t.surfaceRaised,
    },
    completeCopy: {
      flex: 1,
    },
    completeTitle: {
      ...LEXEND.black,
      fontSize: 24,
      lineHeight: 30,
      color: t.text,
    },
    completeBody: {
      ...LEXEND.bold,
      marginTop: 7,
      fontSize: 14,
      lineHeight: 20,
      color: t.textDim,
    },
    moveAgain: {
      ...LEXEND.bold,
      marginTop: 6,
      fontSize: 13,
      lineHeight: 18,
      color: t.text,
    },
    actions: {
      marginTop: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 18,
    },
    secondaryAction: {
      ...LEXEND.bold,
      fontSize: 13,
      color: t.textDim,
    },
  });