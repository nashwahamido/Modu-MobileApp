import { useEffect, useRef, useSyncExternalStore } from "react";

let queue: string[] = [];
let nextClaim = 0;
let owner: string | null = null;
const subscribers = new Set<() => void>();

function emit(): void {
  subscribers.forEach((notify) => notify());
}

function claimant(): string | null {
  return queue.length > 0 ? queue[queue.length - 1] : null;
}

export function settleSlot(): void {
  const next = claimant();
  if (owner === next) return;
  owner = owner === null ? next : null;
  emit();
}

export function requestSlot(id: string): void {
  if (!queue.includes(id)) queue.push(id);
  settleSlot();
}

export function withdrawSlot(id: string): void {
  queue = queue.filter((entry) => entry !== id);
  if (owner === id) owner = null;
  settleSlot();
}

export function currentOwner(): string | null {
  return owner;
}

export function resetSceneSlot(): void {
  queue = [];
  owner = null;
  subscribers.clear();
}

function subscribe(notify: () => void): () => void {
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
  };
}

export function useSceneSlot(id: string, wanted = true): boolean {
  const claim = useRef<string | null>(null);
  if (claim.current === null) claim.current = `${id}#${nextClaim++}`;
  const mine = claim.current;
  const current = useSyncExternalStore(subscribe, currentOwner, currentOwner);
  useEffect(() => {
    if (!wanted) {
      withdrawSlot(mine);
      return;
    }
    requestSlot(mine);
    return () => withdrawSlot(mine);
  }, [mine, wanted]);
  const granted = current === mine;
  useEffect(() => {
    if (!granted) settleSlot();
  }, [granted]);
  return granted;
}
