// All screen-level HUD styling AND the small HUD controls shared by play.tsx and the tutorial fork, in one place so the two HUDs stay pixel-identical. The canonical placements live in hudControlStyles below but are APPLIED by the caller (play as a style prop, tutorial on the wrapping TutorialTarget); look and behavior live here.

import {
  Image,
  Pressable,
  StyleSheet,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { ELEVATION, RADIUS, SPACE, useTheme } from "@/src/game/ui/system/theme";
import { useMirroredTable } from "@/src/game/ui/system/handedness";
import { useGameStore } from "@/src/game/core/store";
import { useHudIcon } from "@/src/game/ui/hud/hudIcons";
import { GrainOverlay } from "@/src/game/ui/system/Button";
import { SCENE_BACKGROUND } from "@/src/game/scene/lighting";
import { playSfx } from "@/src/game/audio/sfx";

/**
 * The bottom offset EVERY task control sits at — the sliders in `input/slide`, the pads in `input/pad`, and anything else that lands in that corner while a step is live.
 *
 * The toggles row (auto / Focus / Spot) sits at bottom:16 and stands 44 tall, so its top edge is at 60; 72 clears it by 12. Below that the control shares a band with three buttons, and the same finger that drags it can hit one on the way past — which is what it did at 36.
 *
 * It lives HERE, with the other canonical HUD placements, rather than in one of the control folders: `pad/` and `slide/` both need it, and neither may import the other for a reason that is only layout (see input/README).
 */
export const TASK_CONTROL_BOTTOM = 72;

/** One shared size for every bare HUD icon so they line up on the grid. */
// 24 inside the 36 chip: the art was nearly filling its container, which read as heavy against the scene. The chip size is unchanged, so the grid and the tap targets hold.
export const HUD_ICON = 24;


/**
 * A HUD icon inside a container chip — surface fill, hairline border, rounded corners, the
 * clay grain, and a card shadow, so it reads as a pressable tile matching the app's other
 * buttons. Dims on press. The 30px icon sits centred in a 36px chip.
 */
export function IconButtonBare({
  source,
  onPress,
  disabled,
  size = HUD_ICON,
  style,
  accessibilityLabel,
}: {
  source: ImageSourcePropType;
  onPress: () => void;
  disabled?: boolean;
  size?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      // The HUD's chips click like every other button — see withClick in system/Button.
      onPress={() => {
        playSfx("click");
        onPress();
      }}
      disabled={disabled}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        bareStyles.wrap,
        {
          backgroundColor: t.surface,
          borderColor: t.border,
          opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
        },
        ELEVATION.card,
        style,
      ]}
    >
      <GrainOverlay radius={RADIUS.control} />
      <Image
        source={source}
        style={[bareStyles.img, { width: size, height: size }]}
        resizeMode="contain"
      />
    </Pressable>
  );
}

/** Recenter re-frames the camera on the build, so it is disabled until there IS a build — on an empty canvas it just jumps the view for no visible reason. */
export function RecenterButton({
  enabled,
  onPress,
  style,
}: {
  enabled: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <IconButtonBare
      source={useHudIcon("recenter")}
      onPress={onPress}
      disabled={!enabled}
      style={style}
      accessibilityLabel="Recenter the view"
    />
  );
}

/**
 * Mute for the spoken step clips, on the same chip as the gear and the hint beside it.
 *
 * VISIBLE ONLY IN THE VISUAL PROFILE, which is the one that turns `audio` on by default — so it is
 * the one place a player is hearing every step read aloud without having asked for it, and the one
 * place a way to stop is owed at the moment they want it rather than three taps into Settings.
 * Every other profile starts silent and turns it on from Settings deliberately.
 *
 * The profile test lives HERE rather than at the call sites, so the play screen and the tutorial
 * fork cannot disagree about when it shows.
 */
export function SpokenStepsButton({ style }: { style?: StyleProp<ViewStyle> }) {
  const profile = useGameStore((s) => s.profile);
  const audio = useGameStore((s) => s.settings.audio);
  const setSettings = useGameStore((s) => s.setSettings);
  // ABOVE the early return, like every other hook here — a hook called past a conditional return
  // changes the hook order between the renders where this button shows and the ones where it does
  // not, which React treats as a different component.
  const icon = useHudIcon(audio ? "soundOn" : "soundOff");
  if (profile !== "visual") return null;
  return (
    <IconButtonBare
      // Through the icon registry, so the speaker follows the chrome it sits on: the cream art on
      // the dark HUD, the original on cream. It was pinned to the light pair, which is a dark glyph
      // — on the dark chip it went dark-on-dark while the gear beside it inverted correctly.
      //
      // Still the same pair VoiceButton draws, so "sound" looks like one idea across the app; that
      // button lives on onboarding's cream and keeps the light art either way. The crossed speaker
      // says WHAT is off; the chip's own disabled dimming is not used, because the button is not
      // disabled — it is the way back.
      source={icon}
      onPress={() => setSettings({ audio: !audio })}
      // 24, the same glyph size the settings gear draws inside its own 36 chip. The chips were
      // already identical; at 20 the speaker just sat smaller inside its own, which reads as a
      // smaller button next to the gear rather than a quieter one.
      size={24}
      style={style}
      accessibilityLabel={audio ? "Turn spoken steps off" : "Turn spoken steps on"}
    />
  );
}

/** The hint nudge on the 36px icon-button grid. */
export function HintButton({
  onPress,
  style,
}: {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <IconButtonBare
      source={require("@/src/assets/ui/icons/icon-hint.png")}
      onPress={onPress}
      style={style}
      accessibilityLabel="Spot the next part"
    />
  );
}

const bareStyles = StyleSheet.create({
  wrap: {
    // 36px chip centring a 30px icon — the same grid the gear sits on, so settings, undo, recenter, hint and pause all align at left:14 with matching centres and tap targets.
    width: 36,
    height: 36,
    borderRadius: RADIUS.control,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    // Clip the clay grain to the chip's rounded corners without clipping the card shadow — the GrainOverlay self-clips, so the Pressable itself must NOT set overflow:hidden.
  },
  img: {},
});

/** The right-handed source tables below are exported unchanged, because the tutorial's spotlight maths and a few call sites want the raw numbers. EVERY RENDERING CALL SITE SHOULD USE THE HOOKS AT THE FOOT OF THIS FILE instead — they hand back the same table mirrored when the player is left-handed. A placement read straight off the raw table simply will not move, which is exactly the failure that is invisible until someone tests in left-hand mode. */
export const hudControlStyles = StyleSheet.create({
  // Canonical HUD placements, applied by the caller (play passes them as the style prop, tutorial puts them on the TutorialTarget wrapper so the spotlight measures the right frame). The top row runs on a 44pt pitch from the gear: gear 36 wide at left:14, +8 gap → 58, → 102.
  //
  // THE HINT OWNS THE SLOT BESIDE THE GEAR. It is the older control and the one a player reaches for
  // under pressure, so it does not move for anything.
  hintButton: { position: "absolute", left: 58, top: 8 },
  // The spoken-steps toggle takes whichever slot is FREE, and the call site decides which by passing
  // one of these two. The pair are conditional on different things — the hint on free mode, the
  // toggle on the visual profile — so on most screens exactly one of them is showing, and a fixed
  // third slot would leave the toggle floating a gap away from the gear through every guide mode.
  spokenStepsButton: { position: "absolute", left: 102, top: 8 },
  // Its own row, directly under undo (top:54 + 36 + 12 gap); same 36x36 square as the rest of the column.
  recenterButton: { position: "absolute", left: 14, top: 102 },
});

export const hudChrome = {
  // Each screen layers its own backgroundColor on top (play: t.bg, tutorial: SCENE_BACKGROUND).
  root: { flex: 1 },
  sceneWrap: { ...StyleSheet.absoluteFillObject },
  chrome: { position: "absolute" },

  // The row owns the position; the ObjectiveBar is just a flex child of it.
  topRow: {
    position: "absolute",
    // 8 — the SAME top as everything else on this line: the gear (8), the audio and hint chips
    // (8) and the Map slot (8), so the row's top edges agree.
    //
    // It was 3, tuned so a PAUSE button that used to live in this row read as level with the
    // top-left grid. That button is gone; the 5pt lift it needed stayed behind and left the
    // objective bar sitting proud of everything beside it.
    top: 8,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
  },

  // HintButton and RecenterButton placements live with the element (hudControlStyles above).

  // The way back to the tray in float mode. PRIMARY: while a part is in the air, this is the one thing the player might need, so it is the one thing that carries the accent. Below Recenter. Only visible in float mode, while a part is in the air.
  putBackButton: { position: "absolute", left: 14, top: 150 },

  // Left edge aligned with Recenter and the gear (all left:14); bottom aligned with the toolbar row (bottom:16). In LEFT-hand mode this and the toggles row swap edges — see useHudChrome.
  joystickZone: { position: "absolute", left: 14, bottom: 16 },
  togglesRow: {
    position: "absolute",
    right: 14,
    bottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    zIndex: 15,
  },
} satisfies Record<string, ViewStyle>;

/** The tutorial fork: the same chrome plus the spotlight's target rectangles (regions TutorialTarget measures for the highlight — the elements themselves render elsewhere). */
export const tutorialChrome = {
  ...hudChrome,
  root: { flex: 1, backgroundColor: SCENE_BACKGROUND },
  rootDark: { backgroundColor: "#17140f" },
  sceneTarget: { flex: 1 },
  assemblyTarget: {
    position: "absolute",
    left: "22%",
    top: "24%",
    width: "50%",
    height: "52%",
  },
  // The pill itself is the shared ObjectiveBar (ui/ObjectiveBar); this just centres it, as in play.tsx.
  // 8, matching topRow above and every chip on that line — the gear, the audio and hint buttons and
  // the Map slot all sit at top:8, so this has to as well.
  //
  // The tutorial uses THIS wrapper for every profile but momentum, where play.tsx uses topRow. That
  // is why the two were 10 and 3: each was tuned against its own screen and neither against the
  // other. Both are 8 now, which also means the bar does not jump when a player moves between the
  // tutorial and a real build.
  objectiveWrap: { position: "absolute", top: 8, alignSelf: "center" },
  // Must match PartsTray's own `column` (right:14, top:70, bottom:70, width:86) so the spotlight frames the tray exactly, not a larger box around it.
  partsTrayTarget: {
    position: "absolute",
    right: 14,
    top: 70,
    bottom: 70,
    width: 86,
  },
  toolTarget: {
    position: "absolute",
    // Match TightenControl exactly (right:220, bottom:120, 144×144).
    // Keeping this in the same HUD coordinate space makes the tutorial spotlight surround the purple clockwise dial instead of its old area.
    right: 220,
    bottom: 120,
    width: 144,
    height: 144,
  },
  // Match BeatControl's bottom-right swipe card. This target exists only for
  // tutorial spotlight measurement; the shared task control stays unchanged.
  beatControlTarget: {
    position: "absolute",
    right: 56,
    bottom: 54,
    width: 320,
    height: 142,
  },
  undoTarget: {
    position: "absolute",
    top: 54,
    left: 14,
    width: 36,
    height: 36,
  },
  // BOTH buttons under one spotlight: undo at top 54 and recenter at top 102, each 36 tall, so the
  // span runs 54 to 138. The tutorial teaches them as a pair — "go back a step, reset the angle" is
  // one idea — and a step can only name one target, so the pair needs a rectangle of its own rather
  // than two consecutive steps saying half of it each.
  undoRecenterTarget: {
    position: "absolute",
    top: 54,
    left: 14,
    width: 36,
    height: 102 + 36 - 54,
  },
  // Match the real gear in GameSettings (left:14, top:8, 36×36). left:92 pointed the spotlight at the hint slot instead of the gear.
  settingsTarget: {
    position: "absolute",
    top: 8,
    left: 14,
    width: 36,
    height: 36,
  },
} satisfies Record<string, ViewStyle>;

// ── handedness ───────────────────────────────────────────────────────────────
// The mirrored views of the three tables above. Memoised on the table identity inside useMirroredTable, so a right-handed session hands back the very same objects it always did and pays nothing.

/** The HUD's placements, mirrored for a left-handed player. */
export function useHudChrome(): typeof hudChrome {
  return useMirroredTable(hudChrome);
}

/** The hint and recenter placements, mirrored for a left-handed player. */
export function useHudControlStyles(): typeof hudControlStyles {
  return useMirroredTable(hudControlStyles);
}

/** The tutorial's chrome AND its spotlight target rectangles, mirrored together — the targets have to travel with the controls they frame, or the spotlight lands on empty screen. */
export function useTutorialChrome(): typeof tutorialChrome {
  return useMirroredTable(tutorialChrome);
}