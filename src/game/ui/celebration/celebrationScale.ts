import { useUiScale } from "@/src/game/ui/system/theme";

const CELEBRATION_TRIM = 1;

export function useCelebrationScale(): number {
  const k = useUiScale();
  return k === 1 ? 1 : Math.max(1, k * CELEBRATION_TRIM);
}