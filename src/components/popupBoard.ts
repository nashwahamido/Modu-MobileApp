import type { ImageSourcePropType } from "react-native";

import { GRID_EDGE, PANEL_EDGE } from "./popupInsets";

export const POPUP_BOARD: ImageSourcePropType = require("@/src/assets/ui/icons/cream-panel.png");

export const BOARD_ASPECT = 2639 / 355;

export const BOARD_STRETCH_Y = 1.18;

export const BOARD_DROP = 16;

export const BOARD_EDGE_BREATH = 4;

export const BOARD_LABEL_OUTLINE = "#FAF7F2";

const BOARD_WIDEN_BY_ASPECT = [
  { aspect: 4 / 3, widen: 1.02 },
  { aspect: 16 / 10, widen: 1.06 },
];

export function tabletBoardWiden(aspect: number): number {
  const [square, wide] = BOARD_WIDEN_BY_ASPECT;
  if (aspect <= square.aspect) return square.widen;
  if (aspect >= wide.aspect) return wide.widen;
  const t = (aspect - square.aspect) / (wide.aspect - square.aspect);
  return square.widen + (wide.widen - square.widen) * t;
}

export function spanBoardWidth(available: number, aspect: number): number {
  return Math.min(
    (available - GRID_EDGE * 2) * tabletBoardWiden(aspect),
    available + (PANEL_EDGE - BOARD_EDGE_BREATH) * 2,
  );
}

export function boardHeight(width: number): number {
  return (width / BOARD_ASPECT) * BOARD_STRETCH_Y;
}
