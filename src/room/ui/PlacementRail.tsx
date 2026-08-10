// The controls shown while a piece is being placed: the colour swatches and the button column, in one rail on the RIGHT edge of the screen. Lifted out of RoomExperience so this whole cluster can be restyled on its own — the room screen only decides WHEN it is up (activeEdit), never how it looks.
//
// Right edge, and a column, because the app is landscape: the free space is vertical, and the old bottom-centre bar sat across the room's width and on top of the bottom navigation. The rail is centred in the band left between the top stats cluster and the bottom bar, so it covers neither.
import { StyleSheet, Pressable, Text, View } from "react-native";

import { BulbIcon, CheckIcon, RotateLeftIcon, RotateRightIcon, TrashIcon } from "../../components/Icons";
import { getRoomItemDef } from "../core/placeableItems";
import { usePlacementStore } from "../core/placement";
import { ColourPicker } from "./ColourPicker";
import { CREAM, useStyles, useTheme, FONT, LEXEND } from "@/src/game/ui/system/theme";
import type { Theme } from "@/src/game/ui/system/theme";
import { SCREEN_SIDE_MARGIN, SCREEN_VERTICAL_MARGIN, useSafeInsets } from "../../hooks/use-safe-insets";


// How far the rail's band is held clear of the two HUD clusters it must never cover: the stats pills at the top right, and the bottom navigation. Each is added to that corner's own inset offset, so the three move together.
const TOP_STATS_CLEARANCE = 66;
const BOTTOM_BAR_CLEARANCE = 78;

// The grid returns reason codes; the player-facing wording for each lives here
function blockedHint(reason: string | null): string {
  if (reason === null) return 'Drag to position';
  switch (reason) {
    case 'occupied': return 'That spot is occupied. Try another place.';
    case 'out-of-bounds': return 'Keep the furniture on the room floor.';
    case 'surface-not-allowed': return 'This piece cannot go there.';
    default: return 'This item cannot be placed yet.';
  }
}

export type PlacementGuideTarget = "style" | "rotate" | "confirm";

export interface PlacementGuideInteraction {
  type: PlacementGuideTarget;
  sequence: number;
}

interface PlacementRailProps {
  guideTarget?: PlacementGuideTarget | null;
  onGuideAction?: (type: PlacementGuideTarget) => void;
}

export function PlacementRail({ guideTarget = null, onGuideAction }: PlacementRailProps) {
  const s = useStyles(makeStyles);
  const t = useTheme();
  // The HUD is absolutely positioned, so each corner nudges itself in by the insets
  const safe = useSafeInsets();
  // Primitive selectors: activeEdit changes on every cell the ghost crosses.
  const blockedReason = usePlacementStore((p) =>
    p.activeEdit && !p.activeEdit.check.ok ? p.activeEdit.check.reason : null,
  );
  const confirmPlacement = usePlacementStore((p) => p.confirm);
  const cancelPlacement = usePlacementStore((p) => p.cancel);
  const removePlacement = usePlacementStore((p) => p.remove);
  const rotateGhost = usePlacementStore((p) => p.rotateGhost);
  const toggleGhostLight = usePlacementStore((p) => p.toggleGhostLight);
  // Three-valued on purpose: null means "the selected piece is not a lamp", which is how the place bar knows to show no switch at all. A boolean could not tell that apart from a lamp that is off.
  const ghostLightOn = usePlacementStore((p) =>
    p.activeEdit && getRoomItemDef(p.activeEdit.placement.itemId)?.emitsLight
      ? p.activeEdit.placement.lightOn !== false
      : null,
  );
  const blocked = blockedReason !== null;

  return (
    // box-none, or the rail's empty middle would swallow drags meant for the room.
    <View
      pointerEvents="box-none"
      style={[
        s.rail,
        {
          right: 12 + Math.max(safe.raw.right, SCREEN_SIDE_MARGIN),
          top: 12 + Math.max(safe.raw.top, SCREEN_VERTICAL_MARGIN) + TOP_STATS_CLEARANCE,
          bottom: 22 + Math.max(safe.raw.bottom, SCREEN_VERTICAL_MARGIN) + BOTTOM_BAR_CLEARANCE,
        },
      ]}
    >
      <ColourPicker
        highlighted={guideTarget === "style"}
        onSelect={() => onGuideAction?.("style")}
      />

      <View style={[s.bar, blocked && s.barBlocked]}>
        <Text style={[s.hint, blocked && s.hintBlocked]}>{blockedHint(blockedReason)}</Text>
        {/* Only a lamp gets a switch, and it sits with rotate and delete because it is the same kind of thing: a property of the piece you are holding, committed when you confirm it. */}
        {ghostLightOn !== null ? (
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel="Lamp light"
            accessibilityState={{ checked: ghostLightOn }}
            style={[s.roundButton, ghostLightOn && s.lightOn]}
            onPress={toggleGhostLight}
          >
            <BulbIcon size={20} on={ghostLightOn} color={ghostLightOn ? '#8a6b1f' : '#807277'} />
          </Pressable>
        ) : null}
        {/* Paired per row: the two rotations are one choice, and cancel/delete are both ways of backing out. */}
        <View style={s.row}>
          <Pressable
            accessibilityLabel="Rotate furniture left"
            style={[s.roundButton, guideTarget === "rotate" && s.guideTarget]}
            onPress={() => {
              rotateGhost(-1);
              onGuideAction?.("rotate");
            }}
          >
            <RotateLeftIcon size={21} />
          </Pressable>
          <Pressable
            accessibilityLabel="Rotate furniture right"
            style={[s.roundButton, guideTarget === "rotate" && s.guideTarget]}
            onPress={() => {
              rotateGhost(1);
              onGuideAction?.("rotate");
            }}
          >
            <RotateRightIcon size={21} />
          </Pressable>
        </View>
        <View style={s.row}>
          <Pressable
            accessibilityLabel="Cancel placement"
            style={s.roundButton}
            onPress={cancelPlacement}
          >
            <Text style={s.cancelGlyph}>✕</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Delete furniture"
            style={s.roundButton}
            onPress={removePlacement}
          >
            <TrashIcon size={23} color={t.danger} />
          </Pressable>
        </View>
        {/* Full width of the rail: the primary action, and the only one that ends the placement well. */}
        <Pressable
          accessibilityLabel="Confirm furniture position"
          style={[s.confirm, blocked && s.confirmDisabled, guideTarget === "confirm" && s.guideTarget]}
          disabled={blocked}
          onPress={() => {
            confirmPlacement();
            onGuideAction?.("confirm");
          }}
        >
          <CheckIcon size={27} color={t.onSuccess} />
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  // The band the placement UI is centred in — pinned to the right edge, its top and bottom set at the render above. A row, so the swatches sit to the LEFT of the button column and the controls stay hard against the edge.
  rail: {
    position: 'absolute',
    zIndex: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  // A column, not a bar: stacking keeps the controls out of the room's width. Small buttons still pair up in rows (see row) so the column stays short enough to fit a landscape screen.
  bar: {
    width: 98,
    alignItems: 'center',
    gap: 10,
    borderRadius: 22,
    backgroundColor: t.surface,
    paddingHorizontal: 8,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: .18,
    shadowRadius: 8,
  },
  barBlocked: {
    borderWidth: 2,
    borderColor: t.danger,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  // Heads the column and wraps to its width — the rail is too narrow for a single line of hint text.
  hint: {
    alignSelf: 'stretch',
    color: CREAM.ink,
    ...LEXEND.semibold,
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
  },
  hintBlocked: {
    color: t.danger,
    fontFamily: FONT,
    fontSize: 11,
  },
  roundButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Lit reads as warm rather than as "selected", matching the ceiling light's own switch in RoomLightControls.
  lightOn: {
    backgroundColor: '#f6e6b8',
  },
  cancelGlyph: {
    color: CREAM.ink,
    ...LEXEND.extrabold,
    fontSize: 16,
  },
  // The width of the column's two-button rows, so the primary action reads as the base of the stack.
  confirm: {
    alignSelf: 'stretch',
    height: 36,
    borderRadius: 18,
    backgroundColor: t.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmDisabled: {
    opacity: .35,
  },
  guideTarget: {
    borderWidth: 3,
    borderColor: t.accent,
    shadowColor: t.accent,
    shadowOpacity: .45,
    shadowRadius: 8,
  },
});
