// "Level N" — the new star, once, the first time the player reaches the room after earning it.
//
// WHY IT LIVES IN THE ROOM RATHER THAN AT THE MOMENT OF EARNING. The level is won on the build
// screen, where the player is already being congratulated by BuildComplete — a second celebration
// stacked on that one competes with it and lands while they are still reading the first. The room is
// where they arrive next, it is calm, and the level star they just earned is already sitting in the
// corner of it. The card points at the thing the room was going to show them anyway.
//
// ONCE, and that is the whole difficulty. The trigger is not "a level-up happened just now" — nobody
// is listening at that moment — it is "the level is higher than the last one we congratulated". That
// answer survives a reload, a crash and a cold start, and it cannot double-fire if the room remounts.
import { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { useCurrentUserId } from "@/src/data";
import { useCelebrationScale } from "@/src/game/ui/celebration/celebrationScale";
import { titleCase } from "@/src/data/player/levels";
import { playSfx } from "@/src/game/audio/sfx";
import { levelIcon, STAR_ICON } from "@/src/components/iconAssets";
import {
  SPACE,
  ThemeScope,
  TYPE,
  type Theme,
  useScaledStyles,
} from "@/src/game/ui/system/theme";

/**
 * The highest level already celebrated, PER USER.
 *
 * Per user and not per install, deliberately: a shared key is a latch on the DEVICE, so the first
 * player to reach level 3 would silence it for every account created afterwards on that phone. That
 * exact mistake has been made twice in this app already — the Map coach's local mirror and the
 * room's first-placement guide — and both looked like a broken trigger rather than a broken memory.
 */
const seenKey = (userId: string) => `modu.level-celebrated.v1:${userId}`;

const MASCOT = require("@/src/assets/ui/modu-mascot.png");

/**
 * MODU'S ACT, in milliseconds. Storyboard beats 1-3 and 7, compressed hard.
 *
 * The board runs 6-8 seconds; this runs 2.6, because it plays on WALKING INTO A ROOM rather than as
 * a screen the player chose to watch, and everything after it still has to happen. The beats that
 * survive are the ones that read at speed — the fall, two bounces of decreasing height, the settle.
 *
 * Beats 5 (raise the plank) and 8 (blink) are not here and cannot be: the wrench, the plank and the
 * face are fused into one flat PNG, so nothing can move or change independently of the body. They
 * need the art split into layers — see the note where MASCOT is required.
 */
const ACT = {
  /** The fall. Accelerating in, so it lands rather than arrives. */
  drop: 280,
  /** First bounce: up and back down, the big one. */
  bounce1: 190,
  /** Second bounce: shorter and quicker, which is what makes it read as settling. */
  bounce2: 130,
  /** Modu launches and the star takes over. */
  handoff: 1_120,
} as const;

/** When the title badge wipes in — after the star has stopped moving, so it is a second beat. */
const BADGE_AT = ACT.handoff + 430;

/** How long the card sits before putting itself away. It is a reward, not a question. */
const VISIBLE_MS = ACT.handoff + 2_300;

/**
 * Sparks thrown outward on the burst.
 *
 * TWO RINGS at different distances and sizes, offset by half a step so they never line up into
 * spokes. An even ring of identical dots reads as a loading spinner frozen mid-frame; a spread of
 * sizes travelling different distances reads as something bursting.
 */
const SPARKS_INNER = 8;
const SPARKS_OUTER = 6;

/** Spokes of light behind the star. Twelve reads as a starburst; many more becomes a disc again. */
const RAYS = 6;

/** The header art's own top-band cream, sampled from cream-header.png — the same constant the
 *  catalogue keeps for the same reason: it sits UNDER the artwork and must never be seen. */
const HEADER_CREAM = "#F3ECE0";

/** The badge plate. 200x45 is 4.444, against the header art's own 985x222 = 4.437 — near enough that
 *  the artwork is not stretched. Smaller than it was: the plate is a caption for the star, and at 266
 *  wide it competed with it. */
const BADGE_W = 200;
const BADGE_H = 45;

/** The square the whole card is composed inside. */
const STAGE_SIZE = 330;

/** Modu, at the art's own 420x324 proportions. He carries the first two seconds alone, so he is
 *  sized to be the subject rather than a mark on the screen. */
const MASCOT_W = 300;
const MASCOT_H = 232;

/** Confetti falling with him on the way in. Enough to read as a shower without becoming weather. */
const CONFETTI = 8;
/** How far above the stage he starts. Off the top of the card, not off the screen — the fall is
 *  420ms and a full screen height in that time reads as a dropped object rather than a character. */
const MASCOT_FALL = 420;

const CARD_CREAM = "#FBF8F3";
const CARD_INK = "#231F20";

type Phase = "idle" | "showing";

export function LevelUpCelebration({
  level,
  title,
  /** Suppressed while the room is busy with something the player is steering. */
  blocked,
}: {
  level: number | null;
  title: string | null;
  blocked?: boolean;
}) {
  // SCALED on a tablet, fixed on a phone. One star and one badge on an otherwise empty screen — the
  // shape theme.ts calls safe to grow.
  //
  // EVERY hand-computed distance below is multiplied by this SAME k. The sheet scales itself, but
  // the burst distances, the fall height and the confetti spread are arithmetic in the render, and
  // theme.ts is explicit about the trap: a scaled star with unscaled sparks is not a bigger version
  // of the layout, it is a broken one — the sparks would land inside a star that had grown past them.
  const k = useCelebrationScale();
  const styles = useScaledStyles(makeStyles, k);
  const me = useCurrentUserId();
  // So the launch clears the top of the screen on any device rather than a guessed distance.
  const { height: screenH } = useWindowDimensions();
  const [phase, setPhase] = useState<Phase>("idle");
  const [shownLevel, setShownLevel] = useState<number | null>(null);
  /** The pill's own width, so the wipe can start exactly one pill-width to the left. */
  const [badgeW, setBadgeW] = useState(0);
  // WHICH LEVEL has already been checked, rather than a plain "checked" flag. A flag claimed for the
  // whole mount stops a second store change starting a second read mid-flight — which is what it is
  // for — but it also meant a level arriving LATER on the same mount was never looked at. The room
  // does not remount while the player is in it, and the profile refetches on focus, so that case is
  // real: come back from a build, the level lands, and nothing was listening.
  const decidedFor = useRef<number | null>(null);

  const scrim = useRef(new Animated.Value(0)).current;
  /** The star's pop: 0 = nothing, 1 = full size. */
  const star = useRef(new Animated.Value(0)).current;
  /** Rays, shockwave and sparks all read off this ONE value, so the blast cannot come apart. */
  const burst = useRef(new Animated.Value(0)).current;
  /** The title badge wiping in from the left. */
  const reveal = useRef(new Animated.Value(0)).current;
  /** Modu's fall: 0 = above the screen, 1 = on the floor. */
  const fall = useRef(new Animated.Value(0)).current;
  /** Height above the floor during the bounces, in points. Driven separately from `fall` so a bounce
   *  never has to fight the fall's own curve. */
  const hop = useRef(new Animated.Value(0)).current;
  /** Squash: 0 = round, 1 = flattened. Peaks on each contact. */
  const squash = useRef(new Animated.Value(0)).current;
  /** Modu handing the stage over: 0 = standing, 1 = launched clear of the top. */
  const exit = useRef(new Animated.Value(0)).current;
  /** The crouch before the launch. Anticipation: he gathers before he goes. */
  const crouch = useRef(new Animated.Value(0)).current;
  /** Confetti raining down with his entrance. */
  const confetti = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (level === null || blocked || decidedFor.current === level) return;
    decidedFor.current = level;

    let alive = true;
    void AsyncStorage.getItem(seenKey(me))
      .then((raw) => {
        if (!alive) return;
        const stored = raw === null ? NaN : Number(raw);

        // NO RECORD MEANS LEVEL 1, not "whatever they are now".
        //
        // This used to bank the CURRENT level silently on the first read, so that a brand new account
        // sitting at level 1 was not congratulated for existing. It cost the first real level-up.
        // The first read is not reliably the player's first moment in the room: this component is
        // BLOCKED while the room's welcome guide is up — and that guide is showing on exactly the
        // visit a new player makes — so the first unblocked read often lands after they have already
        // earned level 2, which then got recorded as "already celebrated" and never shown.
        //
        // Anchoring to 1 keeps the thing that mattered (level 1 is not an achievement) and drops the
        // thing that did not: every level from 2 up now shows once, whenever it is first seen.
        const celebrated = Number.isNaN(stored) ? 1 : stored;
        if (level <= celebrated) return;

        // Written as it OPENS, not when it closes: a player who backgrounds the app mid-animation has
        // still had their moment, and the opposite failure — a card that returns every launch until
        // it is watched to the end — is the one that actually annoys.
        void AsyncStorage.setItem(seenKey(me), String(level)).catch((err) =>
          console.warn("[level up] could not save celebrated level", err),
        );
        setShownLevel(level);
        setPhase("showing");
      })
      .catch((err) => {
        // Released rather than left claimed: a failed read should mean "ask again", not "never again".
        decidedFor.current = null;
        console.warn("[level up] could not read celebrated level", err);
      });

    return () => {
      alive = false;
    };
  }, [level, blocked, me]);

  useEffect(() => {
    if (phase !== "showing") return;
    playSfx("levelUp");

    Animated.timing(scrim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    // The shower comes down WITH him — it is his entrance, not a separate event. Slow and long, so
    // it is still drifting while he bounces.
    Animated.timing(confetti, {
      toValue: 1,
      duration: 1_500,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();

    // ── MODU'S ACT ────────────────────────────────────────────────────────────────────────────
    // Fall, land, bounce twice, settle. Each bounce is shorter AND quicker than the one before it,
    // which is the whole trick: equal bounces read as a loop, decaying ones read as physics.
    const contact = (up: number, ms: number) =>
      Animated.sequence([
        Animated.timing(hop, {
          toValue: up,
          duration: ms,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(hop, {
          toValue: 0,
          duration: ms,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]);

    // The impact itself: flatten fast, spring back. 90ms, because a slow squash reads as melting.
    const impact = Animated.sequence([
      Animated.timing(squash, {
        toValue: 1,
        duration: 90,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(squash, {
        toValue: 0,
        damping: 7,
        stiffness: 260,
        mass: 0.5,
        useNativeDriver: true,
      }),
    ]);

    Animated.sequence([
      // 1 — DROP IN. Ease IN, so it accelerates into the floor; easing out looks like being lowered.
      Animated.timing(fall, {
        toValue: 1,
        duration: ACT.drop,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      // 2 — FIRST BOUNCE, with the landing squash running alongside it.
      Animated.parallel([impact, contact(-54, ACT.bounce1)]),
      // 3 — SECOND BOUNCE, lower and faster.
      Animated.parallel([
        Animated.sequence([
          Animated.timing(squash, {
            toValue: 0.6,
            duration: 70,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.spring(squash, {
            toValue: 0,
            damping: 8,
            stiffness: 280,
            mass: 0.5,
            useNativeDriver: true,
          }),
        ]),
        contact(-24, ACT.bounce2),
      ]),
      // 7 — SETTLE. One last small squash, and he is still.
      Animated.timing(squash, {
        toValue: 0.22,
        duration: 90,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(squash, {
        toValue: 0,
        damping: 10,
        stiffness: 200,
        mass: 0.6,
        useNativeDriver: true,
      }),
    ]).start();

    // ── THE HANDOFF ───────────────────────────────────────────────────────────────────────────
    const act2 = setTimeout(() => {
      // HE LEAVES UPWARD, and he gathers first. The crouch is anticipation — the oldest trick there
      // is, and the reason a launch reads as a launch rather than a sprite being deleted upward. He
      // goes the way he came, which keeps the middle of the screen free for the star.
      Animated.sequence([
        Animated.timing(crouch, {
          toValue: 1,
          duration: 110,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(exit, {
          toValue: 1,
          duration: 240,
          // EASE OUT, not in. `in` back-loads the travel: 63% through the launch — the moment the
          // star appears — he had covered only 24% of the distance and was still hanging in the top
          // of the frame. `out` puts the speed where a jump actually has it, fastest leaving the
          // floor and slowing as it rises, so he is 95% gone by the same instant.
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();

      // The star arrives as he clears, not with him — 190ms in, so the two never share the middle.
      setTimeout(() => {
        Animated.parallel([
          // THE STAR, 0 to full size, FAST. A stiff spring with little damping: it arrives before the
          // eye has settled and overshoots once.
          Animated.spring(star, {
            toValue: 1,
            damping: 9,
            stiffness: 320,
            mass: 0.55,
            useNativeDriver: true,
          }),
          // The confetti burst and the glow ring, on the star's own frame.
          Animated.timing(burst, {
            toValue: 1,
            duration: 1_150,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start();
      }, 150);
    }, ACT.handoff);

    const badge = setTimeout(() => {
      Animated.timing(reveal, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }, BADGE_AT);

    const timer = setTimeout(() => setPhase("idle"), VISIBLE_MS);
    return () => {
      clearTimeout(act2);
      clearTimeout(badge);
      clearTimeout(timer);
    };
  }, [phase, scrim, star, burst, reveal, fall, hop, squash, exit, crouch, confetti, screenH]);

  if (phase !== "showing" || shownLevel === null) return null;

  const art = levelIcon(shownLevel);

  return (
    // LIGHT, like every other card that floats over a scene — "Assemble in Dark Mode" is about the
    // build surface, not about the panels shown on top of it.
    <ThemeScope value="light">
      <Animated.View style={[styles.layer, { opacity: scrim }]} pointerEvents="box-none">
        {/* The dim. Pressable so a tap anywhere puts the card away — a reward should never trap
            anyone behind it, and the auto-dismiss is a floor, not the only way out. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={() => setPhase("idle")}
        >
          <View style={styles.scrim} />
        </Pressable>

        <View style={styles.centre} pointerEvents="none">
          <View style={styles.stage}>
            {/* CONFETTI, raining down with his entrance — storyboard beat 4, moved to the front so
                his arrival is the celebration rather than a character walking on before one starts.
                Each piece falls its own distance at its own tilt and spins on the way; identical
                pieces on identical paths read as rain, not confetti. Three colours, mixed sizes,
                some square and some round. */}
            {Array.from({ length: CONFETTI }).map((_, i) => {
              // Deterministic scatter — a hash of the index, not Math.random, so a re-render cannot
              // reshuffle the shower mid-fall.
              const spread = ((i * 37) % 100) / 100 - 0.5;
              const lead = ((i * 53) % 100) / 100;
              const size = 7 + ((i * 17) % 3) * 4;
              const tone = i % 3;
              return (
                <Animated.View
                  key={`fetti-${i}`}
                  style={[
                    styles.confetti,
                    tone === 1 && styles.confettiCream,
                    tone === 2 && styles.confettiGold,
                    {
                      width: size,
                      height: i % 2 === 0 ? size : size * 1.7,
                      borderRadius: i % 2 === 0 ? size / 2 : 2,
                      left: (STAGE_SIZE / 2 + spread * STAGE_SIZE * 1.15) * k,
                      opacity: confetti.interpolate({
                        inputRange: [0, 0.08, 0.75, 1],
                        outputRange: [0, 1, 1, 0],
                      }),
                      transform: [
                        {
                          translateY: confetti.interpolate({
                            inputRange: [0, 1],
                            // Staggered starts, so they do not arrive as a single line.
                            outputRange: [(-260 - lead * 220) * k, STAGE_SIZE * 0.95 * k],
                          }),
                        },
                        {
                          // A STATIC tilt, not a spin. The spin was a driven node per piece for a
                          // rotation nobody can follow on a 7pt fleck falling past in a second.
                          rotate: `${(i % 5) * 24 - 48}deg`,
                        },
                      ],
                    },
                  ]}
                />
              );
            })}

            {/* MODU, storyboard beats 1-3 and 7. He is FIRST in the stage, so everything the star
                brings with it draws over him.
                ONE FLAT SPRITE: the wrench, the plank and the face are fused into the PNG, so the
                whole character squashes and bounces as a single body. The board's follow-through —
                props lagging a frame behind — and its blink both need the art exported as separate
                layers; there is no way to fake either from this file. */}
            <Animated.Image
              source={MASCOT}
              resizeMode="contain"
              style={[
                styles.mascot,
                {
                  // He stays fully opaque the whole way out — he leaves the FRAME rather than fading,
                  // and a sprite that dissolves as it flies reads as a bug.
                  opacity: fall.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 1, 1] }),
                  transform: [
                    {
                      // Fall + bounce + launch, summed rather than stacked: three translateYs would
                      // fight over the same axis and the last would simply win.
                      translateY: Animated.add(
                        Animated.add(
                          fall.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-MASCOT_FALL * k, 0],
                          }),
                          hop,
                        ),
                        Animated.add(
                          // The crouch: a few points DOWN before he goes.
                          crouch.interpolate({ inputRange: [0, 1], outputRange: [0, 16 * k] }),
                          // …then clear off the top of the screen.
                          exit.interpolate({
                            inputRange: [0, 1],
                            // A full screen height, with the extra over 0.9 as margin: the mascot
                            // sits slightly BELOW centre in the stage, so it has further to travel
                            // than half a screen.
                            outputRange: [0, -(screenH * 1.05 + MASCOT_H)],
                          }),
                        ),
                      ),
                    },
                    // A tilt on the way out, so he tumbles rather than rising like a lift.
                    {
                      rotate: exit.interpolate({
                        inputRange: [0, 1],
                        outputRange: ["0deg", "-18deg"],
                      }),
                    },
                    // The squash. Wider as it flattens, and it grows DOWNWARD from the feet rather
                    // than about the centre — hence the paired translateY, or he would sink into the
                    // floor as he compressed.
                    { scaleX: squash.interpolate({ inputRange: [0, 1], outputRange: [1, 1.24] }) },
                    { scaleY: squash.interpolate({ inputRange: [0, 1], outputRange: [1, 0.74] }) },
                    {
                      translateY: squash.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, MASCOT_H * 0.13 * k],
                      }),
                    },
                    // The crouch squashes him; the launch STRETCHES him. Squash and stretch on the
                    // same axis, one after the other, is what sells a jump.
                    {
                      scaleX: Animated.multiply(
                        crouch.interpolate({ inputRange: [0, 1], outputRange: [1, 1.16] }),
                        exit.interpolate({ inputRange: [0, 0.4], outputRange: [1, 0.86] }),
                      ),
                    },
                    {
                      scaleY: Animated.multiply(
                        crouch.interpolate({ inputRange: [0, 1], outputRange: [1, 0.84] }),
                        exit.interpolate({ inputRange: [0, 0.4], outputRange: [1, 1.18] }),
                      ),
                    },
                  ],
                },
              ]}
            />

            {/* RAYS — tapered spokes sweeping out from behind the star. This replaces the flat accent
                disc, which read as a grey circle sitting behind the artwork rather than as light
                coming off it. They rotate slightly as they travel, so the burst turns as it grows. */}
            {Array.from({ length: RAYS }).map((_, i) => (
              <Animated.View
                key={`ray-${i}`}
                style={[
                  styles.ray,
                  {
                    opacity: burst.interpolate({
                      inputRange: [0, 0.12, 0.55, 1],
                      outputRange: [0, 0.5, 0.2, 0],
                    }),
                    transform: [
                      { rotate: `${(i / RAYS) * 360}deg` },
                      {
                        // ONE scaleY, not a scaleX/scaleY pair plus a travelling rotate. Three driven
                        // nodes per ray became one; the spokes still grow and fade, which is all the
                        // eye reads at this speed.
                        scaleY: burst.interpolate({
                          inputRange: [0, 0.35, 1],
                          outputRange: [0.15, 1, 1.35],
                        }),
                      },
                    ],
                  },
                ]}
              />
            ))}

            {/* SHOCKWAVE — two hollow rings expanding out of the star at a stagger. A ring that grows
                and thins is what makes a burst read as a burst rather than a sparkle. */}
            {[0, 1].map((n) => (
              <Animated.View
                key={`wave-${n}`}
                style={[
                  styles.wave,
                  {
                    opacity: burst.interpolate({
                      inputRange: n === 0 ? [0, 0.1, 0.6] : [0.12, 0.28, 0.85],
                      outputRange: [0, 0.45, 0],
                      extrapolate: "clamp",
                    }),
                    transform: [
                      {
                        scale: burst.interpolate({
                          inputRange: n === 0 ? [0, 0.6] : [0.12, 0.85],
                          outputRange: [0.25, n === 0 ? 1.7 : 2.2],
                          extrapolate: "clamp",
                        }),
                      },
                    ],
                  },
                ]}
              />
            ))}

            {/* SPARKS. Mixed sizes, two colours, some square for glint. */}
            {Array.from({ length: SPARKS_INNER + SPARKS_OUTER }).map((_, i) => {
              const outer = i >= SPARKS_INNER;
              const n = outer ? SPARKS_OUTER : SPARKS_INNER;
              const idx = outer ? i - SPARKS_INNER : i;
              const angle = ((idx + (outer ? 0.5 : 0)) / n) * Math.PI * 2;
              const distance = ((outer ? 200 : 128) + (idx % 3) * 28) * k;
              const size = outer ? 8 + (idx % 3) * 4 : 6 + (idx % 4) * 5;
              return (
                <Animated.View
                  key={`spark-${i}`}
                  style={[
                    styles.spark,
                    i % 3 === 0 && styles.sparkLight,
                    {
                      width: size,
                      height: size,
                      borderRadius: i % 4 === 0 ? 2 : size / 2,
                      opacity: burst.interpolate({
                        inputRange: [0, 0.15, 0.7, 1],
                        outputRange: [0, 1, 0.85, 0],
                      }),
                      transform: [
                        {
                          translateX: burst.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, Math.cos(angle) * distance],
                          }),
                        },
                        {
                          translateY: burst.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, Math.sin(angle) * distance],
                          }),
                        },
                        {
                          // No per-spark rotate any more. On a 6-10pt dot it was invisible, and at
                          // one driven node per spark it was the single easiest thing to delete.
                          scale: burst.interpolate({
                            inputRange: [0, 0.3, 1],
                            outputRange: [0.3, 1.2, 0.2],
                          }),
                        },
                      ],
                    },
                  ]}
                />
              );
            })}

            <Animated.View
              style={{
                opacity: star.interpolate({ inputRange: [0, 0.05, 1], outputRange: [0, 1, 1] }),
                transform: [
                  { scale: star.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                ],
              }}
            >
              <Image source={art ?? STAR_ICON} style={styles.star} resizeMode="contain" />
              {art ? null : <Text style={styles.starNumber}>{shownLevel}</Text>}
            </Animated.View>
          </View>

          {/* THE TITLE, as a badge. NO "Level N" above it — the star already has the number painted on
              it, and saying it twice made the card read as a form.
              The wipe is a CLIP plus a slide, not a scaleX: scaling the pill would stretch its text on
              the way in. The clip measures itself, so it fits whatever the title says. */}
          {title ? (
            <View style={styles.badgeClip} onLayout={(e) => setBadgeW(e.nativeEvent.layout.width)}>
              <Animated.View
                style={{
                  opacity: reveal.interpolate({
                    inputRange: [0, 0.12, 1],
                    outputRange: [0, 1, 1],
                  }),
                  transform: [
                    {
                      translateX: reveal.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-(badgeW || 280), 0],
                      }),
                    },
                  ],
                }}
              >
                {/* THE CATALOGUE'S OWN HEADER PLATE, not a flat pill. Two nested views, exactly as
                    that screen does it: the outer carries the radius and the fill, the inner carries
                    the radius and the CLIP. They cannot share a node on Android, where
                    `overflow: hidden` would clip a shadow away with everything else outside the box.
                    The fill is the art's own top cream, so nothing shows at the antialiased edge. */}
                <View style={styles.badgePlate}>
                  <View style={styles.badgeInner}>
                    <Image
                      source={require("@/src/assets/ui/cream-header.png")}
                      style={StyleSheet.absoluteFill}
                      // STRETCH, not contain: the plate is sized by this art's own proportions, so
                      // the two agree and this only guarantees the cream reaches the rounded edge.
                      resizeMode="stretch"
                    />
                    {/* CAPITALISED. The titles are authored as prose fragments — "a steady hand" —
                        which reads as unfinished on a badge of its own. Shared with the profile
                        page's title badge so the same rank is written the same way in both. */}
                    <Text style={styles.badgeText} numberOfLines={1}>
                      {titleCase(title)}
                    </Text>
                  </View>
                </View>
              </Animated.View>
            </View>
          ) : null}
        </View>
      </Animated.View>
    </ThemeScope>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    // Above the room's own chrome, below nothing — this is the moment.
    layer: { ...StyleSheet.absoluteFillObject, zIndex: 90 },
    // Near blackout, so the only lit things on screen are the star and its burst.
    scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.82)" },
    // PADDED AT THE BOTTOM to lift the group, and the padding is doing arithmetic rather than taste.
    // Centring the whole group centres the group's midpoint, but the thing the eye reads as the
    // subject is the STAR — which sits 14pt below that midpoint once the badge is hung underneath.
    // A centred flex container shifts its content up by half its bottom padding, so 48 buys the 14
    // that squares the star with the screen and ~10 more of optical lift, since the badge below
    // pulls the eye down.
    centre: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
      paddingBottom: 48,
    },
    // Square and generous: the rays and shockwave travel well past the star, and a short stage clips
    // them. Fixed, so the badge below does not move as the star springs past its resting size.
    stage: { width: STAGE_SIZE, height: STAGE_SIZE, alignItems: "center", justifyContent: "center" },
    star: { width: 250, height: 250 },
    confetti: { position: "absolute", top: 0, backgroundColor: t.accent },
    confettiCream: { backgroundColor: CARD_CREAM },
    confettiGold: { backgroundColor: t.gold },
    // Sized from the art's own 420x324. Sits slightly low in the stage so the "floor" he lands on is
    // under the star rather than at the stage's exact middle.
    mascot: { position: "absolute", width: MASCOT_W, height: MASCOT_H, marginTop: 26 },
    starNumber: {
      ...TYPE.title,
      position: "absolute",
      alignSelf: "center",
      // PERCENT, not points. `top` is deliberately not in SCALED_PROPS, so a fixed 88 would stay put
      // while the star it sits on grew — the number would slide off centre on a tablet. A percentage
      // passes through the scaler untouched and stays proportional to whatever the star becomes.
      top: "35%",
      fontSize: 72,
      color: CARD_INK,
    },
    // A SPOKE, not a disc: tall, thin, centred and rotated into place. Twelve of these fanned around
    // the star is the "light coming off it" that the flat circle never was.
    ray: { position: "absolute", width: 16, height: 300, borderRadius: 8, backgroundColor: t.accent },
    // Hollow, so it thins as it grows instead of washing the screen out.
    wave: {
      position: "absolute",
      width: 200,
      height: 200,
      borderRadius: 100,
      borderWidth: 3,
      borderColor: CARD_CREAM,
    },
    spark: { position: "absolute", backgroundColor: t.accent },
    // The pale half of the mix. Two colours read as sparkle; one reads as confetti.
    sparkLight: { backgroundColor: CARD_CREAM },
    // The window the badge wipes into. `overflow: hidden` is what makes it a WIPE rather than a plate
    // flying in from off-screen.
    //
    // NEGATIVE MARGIN, because the stage is a fixed 330 square that has to be big enough for the rays
    // and the shockwave — so its bottom edge sits well below the star itself. Pulling the badge back
    // up puts it directly under the artwork instead of a hundred points adrift of it.
    badgeClip: { marginTop: -74, borderRadius: BADGE_H / 2, overflow: "hidden" },
    // Outer: radius and fill. The fill is load-bearing on Android, where a view with no background
    // gets a rectangular shadow outline drawn around its rounded corners.
    badgePlate: {
      width: BADGE_W,
      height: BADGE_H,
      borderRadius: BADGE_H / 2,
      backgroundColor: HEADER_CREAM,
    },
    // Inner: radius and clip, so the art cannot square off the plate's ends.
    badgeInner: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: BADGE_H / 2,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
    },
    badgeText: { ...TYPE.title, fontSize: 15, color: CARD_INK, paddingHorizontal: SPACE.md },
  });