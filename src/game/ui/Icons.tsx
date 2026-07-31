// Line icons for the HUD, drawn as SVG rather than shipped as PNGs.
//
// Two reasons this beats an image asset here: the colour follows the theme (a PNG has to be
// recoloured or tinted, and tinting is the thing that silently fails), and it stays crisp at
// any size on any density without exporting @2x/@3x variants.

import Svg, { Circle, Path } from "react-native-svg";

interface IconProps {
  size?: number;
  color: string;
}

/**
 * Recenter — four arrows converging on a point.
 *
 * Drawn once pointing inward from the top, then rotated 90° three times about the centre.
 * One path, four placements: the arrows can't drift out of agreement with each other.
 */
export function RecenterIcon({ size = 20, color }: IconProps) {
  // Shaft down the centre line, then a chevron at its inner end.
  // The chevron spread is deliberately narrow (±2.9, not ±3.4): four wide arrowheads
  // meeting at a point read as a snowflake rather than as arrows converging.
  const arrow = "M 12 2.5 L 12 9 M 9.1 6.3 L 12 9.2 L 14.9 6.3";
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {[0, 90, 180, 270].map((deg) => (
        <Path
          key={deg}
          d={arrow}
          transform={`rotate(${deg} 12 12)`}
          stroke={color}
          // 1.6, not 2.1: at 20px the heavier stroke closed the gaps between the four
          // arrows and the whole glyph filled in.
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
      <Circle cx={12} cy={12} r={1.4} fill={color} />
    </Svg>
  );
}

/**
 * A five-pointed star, drawn rather than typed.
 *
 * A `★` text glyph sits low in its em box and the exact offset varies by font and platform,
 * so a number laid over one never quite centres. This star is a path around a known centre,
 * so an absolutely-centred label lands on it precisely.
 */
export function StarBadge({ size = 40, color }: IconProps) {
  const outer = 11.5;
  // Fuller arms than a geometric star: the wireframe's badge is a chunky sticker, and a deep
  // inner radius reads as spiky next to the round nodes.
  const inner = 5.4;
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    // Tilted a few degrees, as drawn — a perfectly upright star looks pasted on.
    const a = (-90 + 8 + i * 36) * (Math.PI / 180);
    pts.push(`${12 + r * Math.cos(a)},${12 + r * Math.sin(a)}`);
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={`M ${pts.join(" L ")} Z`} fill={color} />
    </Svg>
  );
}

/** Pause — two thin bars. Drawn rather than typed so the weight is ours to set: the ❙❙ and
 *  ⏸ glyphs are heavy and vary by platform font. */
export function PauseIcon({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M 9.5 6 L 9.5 18 M 14.5 6 L 14.5 18"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Resume — a play triangle, for a stage that is under way and can be picked back up. */
export function ResumeIcon({ size = 16, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M 8 5 L 19 12 L 8 19 Z" fill={color} />
    </Svg>
  );
}