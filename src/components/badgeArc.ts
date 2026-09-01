export function badgeArcPath(circleSize: number, barHeight: number, strokeWidth: number): string {
  const r = circleSize / 2 - strokeWidth;
  const c = circleSize / 2;
  const dy = Math.min(barHeight / 2, r);
  const dx = Math.sqrt(Math.max(r * r - dy * dy, 0));
  return `M ${c + dx} ${c - dy} A ${r} ${r} 0 1 0 ${c + dx} ${c + dy}`;
}
