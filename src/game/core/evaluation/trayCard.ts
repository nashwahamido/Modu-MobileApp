import { isPickupType } from "@/src/game/core/ids";
import { isNonLeadBody } from "@/src/game/core/model/components";
import { isStaged } from "@/src/game/core/model/staging";
import type { AssemblyAction, Furniture } from "@/src/game/core/type";

/** Does this action earn a tray card? Pickup-type is necessary but NOT sufficient, and using the type alone is the bug this exists to prevent: a 3-phase insert is a press gesture on an already-dropped fastener, a staged carrier's seating placePart seats by sliding, and a non-lead component body hides behind its lead's card. All three are pickup types with no card of their own. */
export function hasTrayCard(f: Furniture, a: AssemblyAction): boolean {
  if (!a.partId) return false;
  if (!isPickupType(a.type)) return false;
  const part = f.parts[a.partId];
  if (!part) return false;
  if (a.type === "insertFastener" && part.insertStage) return false;
  if (a.type === "placePart" && isStaged(part)) return false;
  if (isNonLeadBody(f.components, a.partId)) return false;
  return true;
}
