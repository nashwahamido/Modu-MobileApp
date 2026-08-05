import { useEffect, useRef, useState } from 'react';
import { router, useRootNavigationState } from 'expo-router';
import type { Href } from 'expo-router';
import { StyleSheet, Image, Pressable, Text, View } from "react-native";
import {
  useFonts,
  Lexend_400Regular,
  Lexend_600SemiBold,
  Lexend_700Bold,
  Lexend_800ExtraBold,
  Lexend_900Black,
} from "@expo-google-fonts/lexend";
import { BulbIcon, CheckIcon, RotateLeftIcon, RotateRightIcon, TrashIcon } from '../../components/Icons';
import { getRoomItemDef } from '../core/placeableItems';
import { SETTINGS_ICON } from '../../components/iconAssets';
import { Button } from '../../game/ui/Button';
import { OverlaySheet } from '../../game/ui/OverlaySheet';
import { SceneBackdrop } from '../../game/ui/SceneBackdrop';
import { roomBackdropView } from './roomBackdrops';
import { ceilingLightOn, sunPreset, type CeilingLightOverride } from '../core/timeOfDay';
import { useGameStore } from '../../game/core/store';
import { useStyles, useTheme } from "@/src/game/ui/theme";
import { useCurrentUserId } from '../../data';
import { RoomScene } from '../scene/RoomScene';
import { ColourPicker } from './ColourPicker';
import { FriendPickerOverlay } from './FriendPickerOverlay';
import { RoomBottomBar } from './RoomBottomBar';
import { RoomLightControls } from './RoomLightControls';
import { RoomTopStats } from './RoomTopStats';
import { ShopOverlay } from '../../shop/ShopOverlay';
import { InventoryOverlay } from '../../inventory/InventoryOverlay';
import { usePlacementStore } from '../core/placement';
import { ORBIT } from '../input/orbit';
import type { Theme } from "@/src/game/ui/theme";
import { SCREEN_SIDE_MARGIN, SCREEN_VERTICAL_MARGIN, useSafeInsets } from '../../hooks/use-safe-insets';

// Pinned to the mockup rather than the theme, so it holds across light/dark
const TEXT_COLOR = '#231F20';
const LEXEND = {
  regular: 'Lexend_400Regular',
  semibold: 'Lexend_600SemiBold',
  bold: 'Lexend_700Bold',
  extrabold: 'Lexend_800ExtraBold',
  black: 'Lexend_900Black',
} as const;

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

// Routes with their own Filament scene: only one engine may run at a time
// Modals are deliberately absent, so opening one leaves the room mounted
const HEAVY_ROUTES = new Set(['play', 'tutorial', 'visit']);

export function RoomExperience() {
  const s = useStyles(makeStyles);
  const t = useTheme();
  // No splash gate- the system-font flash is a single cold-start frame
  useFonts({
    Lexend_400Regular,
    Lexend_600SemiBold,
    Lexend_700Bold,
    Lexend_800ExtraBold,
    Lexend_900Black,
  });
  // Only the Filament view unmounts under a heavy route; the screen stays mounted
  const rootNav = useRootNavigationState();
  const heavySceneActive = !!rootNav && HEAVY_ROUTES.has(rootNav.routes[rootNav.index]?.name ?? '');
  // The hub's scene must stay down until the visit's teardown has actually landed: stopViewing() runs from a cleanup, which React fires in the passive-effect phase AFTER the commit that re-mounts RoomScene here, so heavySceneActive alone flips back to false one commit too early and the hub's first frame would read s.viewing?.layout ?? s.layout as the friend's room, mounting and then immediately unmounting every visited item's Filament asset (see the visit.tsx cleanup and RoomScene's asset-release churn).
  const stillViewingFriend = usePlacementStore((p) => p.viewing !== null);
  // Backdrop follows the HOUR (Settings → "Time of day") rather than being its own axis: the view out
  // of the room and the light inside it are the same fact, and letting them disagree only ever produces
  // a daytime photo behind a night-lit room. Each preset names its backdrop; see core/timeOfDay.
  const hour = useGameStore((s) => s.roomTimeOfDay);
  const setRoomTimeOfDay = useGameStore((s) => s.setRoomTimeOfDay);
  const roomBackdrop = sunPreset(hour).backdrop;
  // The switch's deviation from this hour's default, stamped with the hour it was made at so it applies to THAT hour only — see ceilingLightOn. Note it is set aside rather than discarded: move away and the new hour's default rules, move back and the deviation applies again, which is what makes "off at night" stay a night preference instead of a one-shot. Only one slot exists, so touching the switch at a second hour replaces it. Deliberately NOT persisted and deliberately not in the store: the default follows the VIEWER's hour, so a visitor's room lights correctly with no owned state to disagree about.
  const [lightOverride, setLightOverride] = useState<CeilingLightOverride>(null);
  const ceilingLight = ceilingLightOn(hour, lightOverride);
  const darkTheme = useGameStore((s) => s.theme) === 'dark';
  // Placement is shared state, so any route can start it. This screen owns only the HUD.
  const me = useCurrentUserId();
  const hydrate = usePlacementStore((p) => p.hydrate);
  // Primitive selectors: activeEdit changes on every cell the ghost crosses.
  const editing = usePlacementStore((p) => p.activeEdit !== null);
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
  useEffect(() => {
    hydrate(me);
  }, [hydrate, me]);
  const blocked = blockedReason !== null;
  const [unavailableFeature, setUnavailableFeature] = useState<string | null>(null);
  // A layer not a route, so the room stays alive and shows through the scrim
  const [shopOpen, setShopOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [visitPickerOpen, setVisitPickerOpen] = useState(false);
  const [roomRotation, setRoomRotation] = useState(0);
  const [roomZoom, setRoomZoom] = useState(1);
  const roomRotationRef = useRef(roomRotation);
  const roomZoomRef = useRef(roomZoom);
  useEffect(() => {
    roomRotationRef.current = roomRotation;
    roomZoomRef.current = roomZoom;
  }, [roomRotation, roomZoom]);
  // Every path into THIS view goes through here — orbit drag, pinch — so the zoom range is enforced once and cannot be forgotten by a new input path. Rotation is NOT clamped any more: the shell is enclosed on all four sides and the walls between the camera and the room fade out, so the room reads as a room at every azimuth (see src/room/core/wallCulling). NOTE: src/app/(social)/visit.tsx carries an identical copy of this function for the friend's-room screen, so this is one of TWO places the clamp lives — change both or the two scenes drift apart.
  const applyRoomControls = (nextRotation: number, nextZoom: number) => {
    const clampedZoom = Math.max(ORBIT.zoom.min, Math.min(ORBIT.zoom.max, nextZoom));
    roomRotationRef.current = nextRotation;
    roomZoomRef.current = clampedZoom;
    setRoomRotation(nextRotation);
    setRoomZoom(clampedZoom);
  };
  const handleRoomRotationChange = (nextRotation: number) => {
    applyRoomControls(nextRotation, roomZoomRef.current);
  };
  const handleRoomZoomChange = (nextZoom: number) => {
    applyRoomControls(roomRotationRef.current, nextZoom);
  };

  // The HUD is absolutely positioned, so each corner nudges itself in by the insets
  const safe = useSafeInsets();
  return (
    <View style={s.screen}>
      {/* The backdrop sits UNDER a transparent Filament view, so the artwork frames the diorama without touching the 3D scene. "clear": the themed app background (screen) shows through. */}
      <SceneBackdrop {...roomBackdropView(roomBackdrop, darkTheme)} style={s.stage}>
        {heavySceneActive || stillViewingFriend ? null : (
          <RoomScene
            rotationY={roomRotation}
            zoom={roomZoom}
            onRotationChange={handleRoomRotationChange}
            onZoomChange={handleRoomZoomChange}
            ceilingLight={ceilingLight}
          />
        )}
      </SceneBackdrop>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Settings"
        style={[
          s.settingsButton,
          {
            top: 12 + Math.max(safe.raw.top, SCREEN_VERTICAL_MARGIN),
            left: 22 + Math.max(safe.raw.left, SCREEN_SIDE_MARGIN),
          },
        ]}
        onPress={() => router.push("/settings" as Href)}
      >
        <Image source={SETTINGS_ICON} style={s.settingsIcon} resizeMode="contain" />
      </Pressable>

      {/* Hidden mid-placement: the place bar and colour picker own the screen then, and nobody changes the hour with a piece under their finger. */}
      {editing ? null : (
        <RoomLightControls
          hour={hour}
          onHourChange={setRoomTimeOfDay}
          lightOn={ceilingLight}
          // Stamped with the CURRENT hour, which is what scopes it — see ceilingLightOn.
          onToggleLight={() => setLightOverride({ hour, on: !ceilingLight })}
          style={[
            s.lightControls,
            {
              top: 12 + Math.max(safe.raw.top, SCREEN_VERTICAL_MARGIN) + 50,
              left: 22 + Math.max(safe.raw.left, SCREEN_SIDE_MARGIN),
            },
          ]}
        />
      )}

      <RoomTopStats />

      <RoomBottomBar
        onOpenShop={() => setShopOpen(true)}
        onOpenInventory={() => setInventoryOpen(true)}
        onOpenVisit={() => setVisitPickerOpen(true)}
      />

      {editing ? <ColourPicker /> : null}

      {editing ? (
        <View style={[s.placeBar, blocked && s.placeBarBlocked, { bottom: 78 + Math.max(safe.raw.bottom, SCREEN_VERTICAL_MARGIN) }]}>
          {/* Only a lamp gets a switch, and it sits with rotate and delete because it is the same kind of thing: a property of the piece you are holding, committed when you confirm it. */}
          {ghostLightOn !== null ? (
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel="Lamp light"
              accessibilityState={{ checked: ghostLightOn }}
              style={[s.ghostRotate, ghostLightOn && s.ghostLightOn]}
              onPress={toggleGhostLight}
            >
              <BulbIcon size={20} on={ghostLightOn} color={ghostLightOn ? '#8a6b1f' : '#807277'} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityLabel="Rotate furniture left"
            style={s.ghostRotate}
            onPress={() => rotateGhost(-1)}
          >
            <RotateLeftIcon size={21} />
          </Pressable>
          <Pressable
            accessibilityLabel="Rotate furniture right"
            style={s.ghostRotate}
            onPress={() => rotateGhost(1)}
          >
            <RotateRightIcon size={21} />
          </Pressable>
          <Text style={[s.placeHint, blocked && s.placeHintBlocked]}>
            {blockedHint(blockedReason)}
          </Text>
          <Pressable
            accessibilityLabel="Cancel placement"
            style={s.deleteButton}
            onPress={cancelPlacement}
          >
            <Text style={s.cancelGlyph}>✕</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Delete furniture"
            style={s.deleteButton}
            onPress={removePlacement}
          >
            <TrashIcon size={23} color={t.danger} />
          </Pressable>
          <Pressable
            accessibilityLabel="Confirm furniture position"
            style={[s.confirm, blocked && s.confirmDisabled]}
            disabled={blocked}
            onPress={confirmPlacement}
          >
            <CheckIcon size={27} color={t.onSuccess} />
          </Pressable>
        </View>
      ) : null}

      {shopOpen ? <ShopOverlay onClose={() => setShopOpen(false)} /> : null}

      {inventoryOpen ? <InventoryOverlay onClose={() => setInventoryOpen(false)} /> : null}

      {visitPickerOpen ? <FriendPickerOverlay onClose={() => setVisitPickerOpen(false)} /> : null}

      {unavailableFeature ? (
        <OverlaySheet size="dialog" onClose={() => setUnavailableFeature(null)}>
          <Text style={s.comingSoonTitle}>{unavailableFeature}</Text>
          <Text style={s.comingSoonBody}>This feature is coming soon.</Text>
          <Button
            label="Got it"
            variant="primary"
            style={s.comingSoonButton}
            onPress={() => setUnavailableFeature(null)}
          />
        </OverlaySheet>
      ) : null}
    </View>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  // Full-bleed: framing belongs to the camera (src/room/input/orbit.ts), not to insets here
  screen: {
    flex: 1,
    backgroundColor: t.bg,
    overflow: 'hidden',
  },
  stage: StyleSheet.absoluteFillObject,
  settingsButton: {
    position: 'absolute',
    zIndex: 12,
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#50464b',
    shadowOpacity: .17,
    shadowRadius: 3.5,
    shadowOffset: { width: 0, height: 2 },
  },
  settingsIcon: {
    width: 48,
    height: 48,
  },
  // Absolute like every other HUD corner; the inset maths lives at the call site with the settings button's, so the two stay in one column.
  lightControls: {
    position: 'absolute',
    zIndex: 12,
  },
  placeBar: {
    position: 'absolute',
    zIndex: 16,
    bottom: 78,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 22,
    backgroundColor: t.surface,
    paddingLeft: 18,
    paddingRight: 6,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: .18,
    shadowRadius: 8,
  },
  placeBarBlocked: {
    borderWidth: 2,
    borderColor: t.danger,
  },
  placeHint: {
    flexShrink: 1,
    color: TEXT_COLOR,
    fontFamily: LEXEND.semibold,
  },
  placeHintBlocked: {
    color: t.danger,
    fontSize: 11,
  },
  // Lit reads as warm rather than as "selected", matching the ceiling light's own switch in RoomLightControls.
  ghostLightOn: {
    backgroundColor: '#f6e6b8',
  },
  ghostRotate: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelGlyph: {
    color: TEXT_COLOR,
    fontFamily: LEXEND.extrabold,
    fontSize: 16,
  },
  confirmDisabled: {
    opacity: .35,
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirm: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  comingSoonTitle: {
    fontFamily: LEXEND.black,
    fontSize: 22,
    color: TEXT_COLOR,
    textAlign: 'center',
  },
  comingSoonBody: {
    marginTop: 8,
    fontFamily: LEXEND.semibold,
    fontSize: 14,
    color: TEXT_COLOR,
    textAlign: 'center',
  },
  comingSoonButton: {
    marginTop: 18,
    minWidth: 120,
  },
});
