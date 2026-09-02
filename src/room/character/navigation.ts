import { cellKey, type Cell } from "../core/grid";

export type NavigationBounds = { w: number; h: number };

const parseKey = (key: string): Cell => {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
};
const manhattan = (a: Cell, b: Cell): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const inside = (cell: Cell, bounds: NavigationBounds): boolean =>
  cell.x >= 0 && cell.y >= 0 && cell.x < bounds.w && cell.y < bounds.h;
const neighbours = (cell: Cell): Cell[] => [
  { x: cell.x + 1, y: cell.y },
  { x: cell.x - 1, y: cell.y },
  { x: cell.x, y: cell.y + 1 },
  { x: cell.x, y: cell.y - 1 },
];

export function inflateBlocked(
  occupied: ReadonlySet<string>,
  bounds: NavigationBounds,
  radius: number,
  wallMargin = radius,
): Set<string> {
  const blocked = new Set<string>();
  for (let x = 0; x < bounds.w; x += 1) {
    for (let y = 0; y < bounds.h; y += 1) {
      const insideWallMargin =
        x < wallMargin ||
        y < wallMargin ||
        x >= bounds.w - wallMargin ||
        y >= bounds.h - wallMargin;
      if (insideWallMargin) blocked.add(cellKey({ x, y }));
    }
  }
  for (const key of occupied) {
    const centre = parseKey(key);
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        const cell = { x: centre.x + dx, y: centre.y + dy };
        if (inside(cell, bounds)) blocked.add(cellKey(cell));
      }
    }
  }
  return blocked;
}

export function findPath(
  start: Cell,
  goal: Cell,
  blocked: ReadonlySet<string>,
  bounds: NavigationBounds,
): Cell[] | null {
  if (!inside(start, bounds) || !inside(goal, bounds)) return null;
  if (blocked.has(cellKey(start)) || blocked.has(cellKey(goal))) return null;
  if (start.x === goal.x && start.y === goal.y) return [];
  const startKey = cellKey(start);
  const goalKey = cellKey(goal);
  const open = new Set([startKey]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[startKey, 0]]);
  const fScore = new Map<string, number>([[startKey, manhattan(start, goal)]]);
  while (open.size > 0) {
    let currentKey = "";
    let best = Infinity;
    for (const key of open) {
      const score = fScore.get(key) ?? Infinity;
      if (score < best) {
        best = score;
        currentKey = key;
      }
    }
    if (currentKey === goalKey) {
      const reversed: Cell[] = [];
      let key = currentKey;
      while (key !== startKey) {
        reversed.push(parseKey(key));
        const previous = cameFrom.get(key);
        if (!previous) return null;
        key = previous;
      }
      return reversed.reverse();
    }
    open.delete(currentKey);
    const current = parseKey(currentKey);
    for (const next of neighbours(current)) {
      const nextKey = cellKey(next);
      if (!inside(next, bounds) || blocked.has(nextKey)) continue;
      const tentative = (gScore.get(currentKey) ?? Infinity) + 1;
      if (tentative >= (gScore.get(nextKey) ?? Infinity)) continue;
      cameFrom.set(nextKey, currentKey);
      gScore.set(nextKey, tentative);
      fScore.set(nextKey, tentative + manhattan(next, goal));
      open.add(nextKey);
    }
  }
  return null;
}

export function nearestWalkable(
  origin: Cell,
  blocked: ReadonlySet<string>,
  bounds: NavigationBounds,
): Cell | null {
  if (inside(origin, bounds) && !blocked.has(cellKey(origin))) return origin;
  const queue: Cell[] = [origin];
  const seen = new Set([cellKey(origin)]);
  for (let index = 0; index < queue.length; index += 1) {
    for (const next of neighbours(queue[index])) {
      const key = cellKey(next);
      if (!inside(next, bounds) || seen.has(key)) continue;
      if (!blocked.has(key)) return next;
      seen.add(key);
      queue.push(next);
    }
  }
  return null;
}
