// The stroke around a header badge disc, shared by the shop and inventory popups.
//
// An arc and not a border: the circle's right side is buried in the tab pill, and a full ring would draw a seam across the join. The two surfaces keep their own components (see convention 6 in game/ui/theme.ts), but this geometry has to AGREE between them. A badge whose arc ends a few degrees early reads as a different component, and the drift is invisible until the two are seen side by side.

/**
 * An SVG path for the visible (left) part of a badge disc's outline.
 *
 * @param circleSize  the disc's diameter
 * @param barHeight   the tab pill's height — the arc stops where the pill's edges cross it
 * @param strokeWidth the hairline width, pulled out of the radius so the line does not clip at the canvas edge
 */
export function badgeArcPath(circleSize: number, barHeight: number, strokeWidth: number): string {
  const r = circleSize / 2 - strokeWidth;
  const c = circleSize / 2;
  // Ends where the circle crosses the pill's edges, so the two strokes meet end to end
  const dy = Math.min(barHeight / 2, r);
  const dx = Math.sqrt(Math.max(r * r - dy * dy, 0));
  // Top edge, round the left, to the bottom edge: counter-clockwise, always >180deg
  return `M ${c + dx} ${c - dy} A ${r} ${r} 0 1 0 ${c + dx} ${c + dy}`;
}
