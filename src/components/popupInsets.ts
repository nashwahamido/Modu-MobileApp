import { useWindowDimensions } from "react-native";

import { useScreenInsets } from "@/src/hooks/use-safe-insets";

const TABLET_MIN_SHORT_DP = 600;

const PHONE_SIDE = 62;
const PHONE_VERTICAL = 18;

const TABLET_VERTICAL_FRACTION = 0.08;

const TABLET_SIDE_BY_ASPECT = [
  { aspect: 4 / 3, side: 0.13 },
  { aspect: 16 / 10, side: 0.16 },
];

function tabletSideFraction(aspect: number): number {
  const [square, wide] = TABLET_SIDE_BY_ASPECT;
  if (aspect <= square.aspect) return square.side;
  if (aspect >= wide.aspect) return wide.side;
  const t = (aspect - square.aspect) / (wide.aspect - square.aspect);
  return square.side + (wide.side - square.side) * t;
}

export const GRID_EDGE = 22;

export const PANEL_EDGE = 22;

export interface PopupInsets {
  padTop: number;
  padSide: number;
  padBottom: number;
}

export function usePopupInsets(): PopupInsets {
  const safe = useScreenInsets();
  const { width, height } = useWindowDimensions();
  const tablet = Math.min(width, height) >= TABLET_MIN_SHORT_DP;

  const aspect = Math.max(width, height) / Math.min(width, height);
  const side = tablet ? Math.round(width * tabletSideFraction(aspect)) : PHONE_SIDE;
  const vertical = tablet ? Math.round(height * TABLET_VERTICAL_FRACTION) : PHONE_VERTICAL;

  return {
    padTop: vertical + safe.top,
    padSide: side + safe.side,
    padBottom: vertical + safe.bottom,
  };
}
