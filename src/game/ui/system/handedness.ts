import { useMemo } from "react";
import type { TextStyle, ViewStyle } from "react-native";

import { useGameStore } from "@/src/game/core/store";
import { usePrefsStore } from "@/src/game/core/prefsStore";
import type { Handedness } from "@/src/game/core/type";

type Mirrorable = ViewStyle | TextStyle;

const PAIRS: [keyof ViewStyle, keyof ViewStyle][] = [
  ["left", "right"],
  ["marginLeft", "marginRight"],
  ["paddingLeft", "paddingRight"],
  ["borderLeftWidth", "borderRightWidth"],
  ["borderTopLeftRadius", "borderTopRightRadius"],
  ["borderBottomLeftRadius", "borderBottomRightRadius"],
];

const ROW: Record<string, string> = {
  row: "row-reverse",
  "row-reverse": "row",
};

const ALIGN: Record<string, string> = {
  "flex-start": "flex-end",
  "flex-end": "flex-start",
};

const TEXT_ALIGN: Record<string, string> = {
  left: "right",
  right: "left",
};

export function mirror<T extends Mirrorable>(style: T, handedness: Handedness): T {
  if (handedness !== "left") return style;
  const out: Record<string, unknown> = { ...style };
  for (const [a, b] of PAIRS) {
    const hasA = a in style;
    const hasB = b in style;
    if (!hasA && !hasB) continue;
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
  const isColumn = style.flexDirection === undefined || String(style.flexDirection).startsWith("column");
  if (isColumn && typeof style.alignItems === "string" && ALIGN[style.alignItems]) {
    out.alignItems = ALIGN[style.alignItems];
  }
  const textAlign = (style as TextStyle).textAlign;
  if (typeof textAlign === "string" && TEXT_ALIGN[textAlign]) {
    out.textAlign = TEXT_ALIGN[textAlign];
  }
  return out as T;
}

export function mirrorTable<T extends Record<string, ViewStyle>>(table: T, handedness: Handedness): T {
  if (handedness !== "left") return table;
  const out: Record<string, ViewStyle> = {};
  for (const key of Object.keys(table)) out[key] = mirror(table[key], handedness);
  return out as T;
}

export function useHandedness(): Handedness {
  return usePrefsStore((s) => s.handedness);
}

export function useIsLeftHanded(): boolean {
  return usePrefsStore((s) => s.handedness === "left");
}

export function useMirror(): <T extends Mirrorable>(style: T) => T {
  const handedness = useHandedness();
  return useMemo(() => <T extends Mirrorable>(style: T) => mirror(style, handedness), [handedness]);
}

export function useMirroredTable<T extends Record<string, ViewStyle>>(table: T): T {
  const handedness = useHandedness();
  return useMemo(() => mirrorTable(table, handedness), [table, handedness]);
}