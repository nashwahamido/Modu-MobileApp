// Left-hand mode: the one place that knows how to flip a placement.
//
// The HUD is authored RIGHT-handed — joystick bottom-left, trays and every task control down the right edge — and a left-handed player is reaching across the screen for all of it. Left-hand mode mirrors those placements horizontally.
//
// WHAT IS MIRRORED IS POSITION, NEVER DIRECTION. A slide control's drag axis, a dial's turn direction and a part's approach are tied to the authored placeDir / engageDir in each furniture's data and to the camera looking at the model — flipping any of those would not help a left-handed player, it would break the assembly. So this module swaps edges and nothing else, and no caller should reach past it to invert a gesture.
//
// It is a plain function over a style object rather than a transform on a container, deliberately: `scaleX(-1)` would mirror the placements AND every piece of text, icon and thumbnail inside them.

import { useMemo } from "react";
import type { TextStyle, ViewStyle } from "react-native";

import { useGameStore } from "@/src/game/core/store";
import type { Handedness } from "@/src/game/core/type";

/** What this module will mirror.
 *
 *  GENERIC over the style rather than pinned to one of RN's style types, and that is deliberate: ViewStyle and TextStyle overlap but are not assignable to one another in every version of the React Native typings — `cursor` and `userSelect` are typed more loosely on one than the other, and which way round that falls has changed between releases. Naming either one concretely made this module reject the other on some machines and not on ours. Taking `T` and handing `T` back sidesteps the question entirely.
 *
 *  The returned type is a small, knowing inaccuracy: a mirrored style swaps `left` for `right`, so it does not truly have the same keys as its input. It is the right trade for a style object, which is consumed by a `style` prop that accepts both shapes anyway. */
type Mirrorable = ViewStyle | TextStyle;

/** The pairs a horizontal mirror has to exchange. Anything not listed here is untouched — which is why `top`, `bottom`, `width` and every visual property pass through unchanged. */
const PAIRS: [keyof ViewStyle, keyof ViewStyle][] = [
  ["left", "right"],
  ["marginLeft", "marginRight"],
  ["paddingLeft", "paddingRight"],
  ["borderLeftWidth", "borderRightWidth"],
  ["borderTopLeftRadius", "borderTopRightRadius"],
  ["borderBottomLeftRadius", "borderBottomRightRadius"],
];

/** Row directions, so a row of buttons pinned to an edge keeps its outermost item outermost when the edge changes. */
const ROW: Record<string, string> = {
  row: "row-reverse",
  "row-reverse": "row",
};

/** Self-alignment, for the few elements that sit in a flow rather than on an edge. */
const ALIGN: Record<string, string> = {
  "flex-start": "flex-end",
  "flex-end": "flex-start",
};

/** textAlign names the EDGES rather than the flex ends, so it needs its own table — "left" is not "flex-start" here. */
const TEXT_ALIGN: Record<string, string> = {
  left: "right",
  right: "left",
};

/**
 * A style, mirrored — or returned AS IS when the player is right-handed.
 *
 * The right-handed path returns the very same object, not a copy, so the default costs nothing and
 * every `StyleSheet.create` id survives untouched.
 */
export function mirror<T extends Mirrorable>(style: T, handedness: Handedness): T {
  if (handedness !== "left") return style;
  const out: Record<string, unknown> = { ...style };
  for (const [a, b] of PAIRS) {
    const hasA = a in style;
    const hasB = b in style;
    if (!hasA && !hasB) continue;
    // Assigned through a temp pair so a style carrying BOTH edges swaps rather than clobbering one with the other, and so an edge that is only on one side genuinely MOVES instead of being copied to both.
    const av = (style as Record<string, unknown>)[a as string];
    const bv = (style as Record<string, unknown>)[b as string];
    if (hasB) out[a as string] = bv;
    else delete out[a as string];
    if (hasA) out[b as string] = av;
    else delete out[b as string];
  }
  if (typeof style.flexDirection === "string" && ROW[style.flexDirection]) {
    out.flexDirection = ROW[style.flexDirection];
  }
  if (typeof style.alignSelf === "string" && ALIGN[style.alignSelf]) {
    out.alignSelf = ALIGN[style.alignSelf];
  }
  // A plain view simply has no textAlign to find, so this reads as undefined and falls through.
  const textAlign = (style as TextStyle).textAlign;
  if (typeof textAlign === "string" && TEXT_ALIGN[textAlign]) {
    out.textAlign = TEXT_ALIGN[textAlign];
  }
  return out as T;
}

/** Every entry of a placement TABLE, mirrored in one pass — the shape hudChrome and tutorialChrome are in. */
export function mirrorTable<T extends Record<string, ViewStyle>>(table: T, handedness: Handedness): T {
  if (handedness !== "left") return table;
  const out: Record<string, ViewStyle> = {};
  for (const key of Object.keys(table)) out[key] = mirror(table[key], handedness);
  return out as T;
}

/** The player's hand, for anything that needs to branch rather than mirror a style — a cue that points, an icon that faces. */
export function useHandedness(): Handedness {
  return useGameStore((s) => s.handedness);
}

/** True when the HUD is mirrored. The readable form of `useHandedness() === "left"`. */
export function useIsLeftHanded(): boolean {
  return useGameStore((s) => s.handedness === "left");
}

/** A mirroring function bound to the current hand, memoised so a right-handed session re-uses one identity and never re-renders on it. */
export function useMirror(): <T extends Mirrorable>(style: T) => T {
  const handedness = useHandedness();
  return useMemo(() => <T extends Mirrorable>(style: T) => mirror(style, handedness), [handedness]);
}

/** A placement table bound to the current hand. Memoised on the table's identity as well as the hand, so a module-level table is mirrored ONCE per session rather than on every render. */
export function useMirroredTable<T extends Record<string, ViewStyle>>(table: T): T {
  const handedness = useHandedness();
  return useMemo(() => mirrorTable(table, handedness), [table, handedness]);
}