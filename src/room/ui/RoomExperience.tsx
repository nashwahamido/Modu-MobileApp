import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams, useRootNavigationState } from 'expo-router';
import type { Href } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StyleSheet, Image, Pressable, Text, View } from "react-native";
import { SETTINGS_ICON } from '../../components/iconAssets';
import { Button } from '../../game/ui/system/Button';
import { OverlaySheet } from '../../game/ui/system/OverlaySheet';
import { SceneBackdrop } from '../../game/ui/backdrop/SceneBackdrop';
import { roomBackdropView } from './roomBackdrops';
import { ceilingLightOn, sunPreset, type CeilingLightOverride } from '../core/timeOfDay';
import { useGameStore } from '../../game/core/store';
import { avatarForProfile } from '@/src/components/avatarAssets';
import { CREAM, useFixedStyles, LEXEND } from "@/src/game/ui/system/theme";
import { useCurrentUserId } from '../../data';
import { RoomScene } from '../scene/RoomScene';
import { FriendPickerOverlay } from './FriendPickerOverlay';
import { RoomBottomBar } from './RoomBottomBar';
import { RoomLightControls } from './RoomLightControls';
import { RoomLoadingOverlay } from './RoomLoadingOverlay';
import { RoomFirstPlacementGuide } from './RoomFirstPlacementGuide';
import {
  PlacementRail,
  type PlacementGuideInteraction,
  type PlacementGuideTarget,
} from './PlacementRail';
import { RoomTopStats } from './RoomTopStats';
import { ShopOverlay } from '../../shop/ShopOverlay';
import { InventoryOverlay } from '../../inventory/InventoryOverlay';
import { usePlacementStore } from '../core/placement';
import { ORBIT } from '../input/orbit';
import type { Theme } from "@/src/game/ui/system/theme";
import { SCREEN_SIDE_MARGIN, SCREEN_VERTICAL_MARGIN, useSafeInsets } from '../../hooks/use-safe-insets';

const ROOM_EDIT_GUIDE_KEY = 'modu.room-edit-guide-seen.v1';
const ROOM_WELCOME_GUIDE_KEY = 'modu.room-welcome-guide-seen.v1';

// Routes with their own Filament scene: only one engine may run at a time
// Modals are deliberately absent, so opening one leaves the room mounted
const HEAVY_ROUTES = new Set(['play', 'tutorial', 'visit']);

export function RoomExperience() {
  const s = useFixedStyles(makeStyles);
  // open=inventory arrives from BuildComplete, sending the player to their new piece.
  // A search param rather than a global flag: the inventory is a popup INSIDE this screen now, so the only way to ask for it from outside is on the navigation that mounts the room.
  const { welcome, open, firstPlacement } = useLocalSearchParams<{
    welcome?: string;
    open?: string;
    firstPlacement?: string;
  }>();
  const welcomeFromTutorial = welcome === 'tutorial';
  // Tear the 3D view down only when a heavy scene is on top, not on every blur. The room screen stays mounted throughout (its placement/zoom UI state survives); only the Filament view unmounts under play/visit and rebuilds on return.
  const rootNav = useRootNavigationState();
  const heavySceneActive = !!rootNav && HEAVY_ROUTES.has(rootNav.routes[rootNav.index]?.name ?? '');
  // The hub's scene must stay down until the visit's teardown has actually landed: stopViewing() runs from a cleanup, which React fires in the passive-effect phase AFTER the commit that re-mounts RoomScene here, so heavySceneActive alone flips back to false one commit too early and the hub's first frame would read s.viewing?.layout ?? s.layout as the friend's room, mounting and then immediately unmounting every visited item's Filament asset (see the visit.tsx cleanup and RoomScene's asset-release churn).
  const stillViewingFriend = usePlacementStore((p) => p.viewing !== null);
  const sceneMounted = !(heavySceneActive || stillViewingFriend);
  // The loading gate, re-armed on every mount of the scene rather than once per app run. Coming back from a friend's room (or from the assembly) is a genuine cold load — the scene was torn down, so the shell and every piece re-parse from scratch — and the room would otherwise be watched rebuilding itself piece by piece. Both flags reset while the scene is DOWN, so the overlay is already in place on the commit that brings it back.
  const [sceneReady, setSceneReady] = useState(false);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (sceneMounted) return;
    setSceneReady(false);
    setRevealed(false);
  }, [sceneMounted]);
  // Backdrop follows the HOUR (Settings → "Time of day") rather than being its own axis: the view out of the room and the light inside it are the same fact, and letting them disagree only ever produces a daytime photo behind a night-lit room. Each preset names its backdrop; see core/timeOfDay.
  const hour = useGameStore((s) => s.roomTimeOfDay);
  const setRoomTimeOfDay = useGameStore((s) => s.setRoomTimeOfDay);
  const roomBackdrop = sunPreset(hour).backdrop;
  // The switch's deviation from this hour's default, stamped with the hour it was made at so it applies to THAT hour only — see ceilingLightOn. Note it is set aside rather than discarded: move away and the new hour's default rules, move back and the deviation applies again, which is what makes "off at night" stay a night preference instead of a one-shot. Only one slot exists, so touching the switch at a second hour replaces it. Deliberately NOT persisted and deliberately not in the store: the default follows the VIEWER's hour, so a visitor's room lights correctly with no owned state to disagree about.
  const [lightOverride, setLightOverride] = useState<CeilingLightOverride>(null);
  const ceilingLight = ceilingLightOn(hour, lightOverride);
  const darkTheme = useGameStore((s) => s.theme) === 'dark';
  const roomGuideMascot = avatarForProfile(useGameStore((s) => s.profile));
  // Placement is shared state (src/room/core/placement) so any route can start it and the scene can render the layout. This screen owns only the HUD: the ghost's drag lives in the scene's gesture layer, where the finger is converted to grid cells by ray picking.
  const me = useCurrentUserId();
  const hydrate = usePlacementStore((p) => p.hydrate);
  // The saved room has answered — the loading screen's first milestone. False again for the length of an account switch's re-hydrate, which is exactly when the room is worth covering.
  const hydrated = usePlacementStore((p) => p.hydrated);
  // Primitive selectors: activeEdit changes on every cell the ghost crosses.
  const editing = usePlacementStore((p) => p.activeEdit !== null);
  const placedFurnitureCount = usePlacementStore((p) => p.layout.length);
  useEffect(() => {
    hydrate(me);
  }, [hydrate, me]);
  const [unavailableFeature, setUnavailableFeature] = useState<string | null>(null);
  // A layer not a route, so the room stays alive and shows through the scrim
  const [shopOpen, setShopOpen] = useState(false);
  // Opens already-true when arriving with ?open=inventory, so the popup is sliding up on the first frame instead of appearing a beat after the room has drawn.
  const [inventoryOpen, setInventoryOpen] = useState(open === 'inventory');
  const [visitPickerOpen, setVisitPickerOpen] = useState(false);
  const [showRoomEditGuide, setShowRoomEditGuide] = useState(false);
  const [showRoomWelcomeGuide, setShowRoomWelcomeGuide] = useState(false);
  const [firstPlacementGuideSession, setFirstPlacementGuideSession] =
    useState(false);
  const [placementGuideTarget, setPlacementGuideTarget] =
    useState<PlacementGuideTarget | null>(null);
  const [placementGuideInteraction, setPlacementGuideInteraction] =
    useState<PlacementGuideInteraction | null>(null);
  const placementGuideSequence = useRef(0);
  const handlePlacementGuideAction = useCallback(
    (type: PlacementGuideTarget) => {
      placementGuideSequence.current += 1;
      setPlacementGuideInteraction({
        type,
        sequence: placementGuideSequence.current,
      });
    },
    [],
  );
  const [roomRotation, setRoomRotation] = useState(0);
  const [roomZoom, setRoomZoom] = useState(1);
  const roomRotationRef = useRef(roomRotation);
  const roomZoomRef = useRef(roomZoom);
  useEffect(() => {
    roomRotationRef.current = roomRotation;
    roomZoomRef.current = roomZoom;
  }, [roomRotation, roomZoom]);
  // Both guides wait on `revealed`, not merely on the data: a guide is advice ABOUT the room, so it has to arrive after the loading screen has handed the room over. Gated here rather than at the render so the AsyncStorage read waits too — raising one behind an opaque overlay would burn its once-only "seen" flag on a dialog nobody ever saw.
  useEffect(() => {
    if (
      welcomeFromTutorial ||
      !hydrated ||
      !revealed ||
      editing ||
      firstPlacementGuideSession ||
      placedFurnitureCount === 0
    )
      return;
    let active = true;
    AsyncStorage.getItem(ROOM_EDIT_GUIDE_KEY)
      .then((seen) => {
        if (active && !seen) setShowRoomEditGuide(true);
      })
      .catch((err) => console.warn('[room] edit guide state load failed', err));
    return () => {
      active = false;
    };
  }, [
    editing,
    firstPlacementGuideSession,
    placedFurnitureCount,
    hydrated,
    revealed,
    welcomeFromTutorial,
  ]);
  useEffect(() => {
    if (!welcomeFromTutorial || !hydrated || !revealed || editing) return;
    let active = true;
    AsyncStorage.getItem(ROOM_WELCOME_GUIDE_KEY)
      .then((seen) => {
        if (active && !seen) setShowRoomWelcomeGuide(true);
      })
      .catch((err) => console.warn('[room] welcome guide state load failed', err));
    return () => {
      active = false;
    };
  }, [editing, hydrated, revealed, welcomeFromTutorial]);
  const dismissRoomEditGuide = () => {
    setShowRoomEditGuide(false);
    AsyncStorage.setItem(ROOM_EDIT_GUIDE_KEY, '1').catch((err) =>
      console.warn('[room] edit guide state save failed', err),
    );
  };
  const dismissRoomWelcomeGuide = () => {
    setShowRoomWelcomeGuide(false);
    AsyncStorage.setItem(ROOM_WELCOME_GUIDE_KEY, '1').catch((err) =>
      console.warn('[room] welcome guide state save failed', err),
    );
  };
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
        {sceneMounted ? (
          <RoomScene
            rotationY={roomRotation}
            zoom={roomZoom}
            onRotationChange={handleRoomRotationChange}
            onZoomChange={handleRoomZoomChange}
            ceilingLight={ceilingLight}
            onReady={() => setSceneReady(true)}
            onPlacementReposition={() =>
              handlePlacementGuideAction('reposition')
            }
          />
        ) : null}
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

      {/* All of the placement UI — swatches and buttons — lives in one component on the right edge; this screen only decides when it is up. See PlacementRail. */}
      {editing ? (
        <PlacementRail
          guideTarget={placementGuideTarget}
          onGuideAction={handlePlacementGuideAction}
        />
      ) : null}

      <RoomFirstPlacementGuide
        requestedItemId={firstPlacement === 'lack-table' ? firstPlacement : null}
        interaction={placementGuideInteraction}
        onTargetChange={setPlacementGuideTarget}
        onSessionChange={setFirstPlacementGuideSession}
      />

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

      {showRoomEditGuide ? (
        <OverlaySheet size="dialog" onClose={dismissRoomEditGuide}>
          <Image
            source={roomGuideMascot}
            style={s.roomGuideMascot}
            resizeMode="contain"
          />
          <Text style={s.roomGuideTitle}>Make the room your own</Text>
          <Text style={s.roomGuideBody}>
            Press and hold any furniture to move, rotate, recolour, or remove it.
          </Text>
          <Button
            label="Got it"
            variant="primary"
            style={s.roomGuideButton}
            onPress={dismissRoomEditGuide}
          />
        </OverlaySheet>
      ) : null}

      {showRoomWelcomeGuide ? (
        <OverlaySheet size="dialog" onClose={dismissRoomWelcomeGuide}>
          <Image
            source={roomGuideMascot}
            style={s.roomGuideMascot}
            resizeMode="contain"
          />
          <Text style={s.roomGuideTitle}>Welcome to your cozy home!</Text>
          <Text style={s.roomGuideBody}>
            Find the perfect spot for your first piece of furniture. Make it
            yours. Long press it anytime to move it again.
          </Text>
          <Button
            label="Got it"
            variant="primary"
            style={s.roomGuideButton}
            onPress={dismissRoomWelcomeGuide}
          />
        </OverlaySheet>
      ) : null}

      {/* Last child, and opaque: the room loads UNDERNEATH this — HUD included, so no bar or button flashes over a half-built room either. */}
      {sceneMounted && !revealed ? (
        <RoomLoadingOverlay
          dataReady={hydrated}
          sceneReady={sceneReady}
          label="Getting your room ready!"
          onRevealed={() => setRevealed(true)}
        />
      ) : null}
    </View>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  // The stage is FULL-BLEED: the Filament view is the screen, with the HUD floating over it. Any inset here becomes a hard clip line through the 3D scene the moment the room is zoomed or orbited near an edge — framing belongs to the camera (src/room/input/orbit.ts), not to this view's margins.
  screen: {
    flex: 1,
    backgroundColor: t.bg,
    overflow: 'hidden',
  },
  stage: StyleSheet.absoluteFillObject,
  // Settings sits on its own, self-positioned at the top-left — RoomTopStats (coins + level) is the equivalent cluster at the top-right, now in its own file.
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
  comingSoonTitle: {
    ...LEXEND.black,
    fontSize: 22,
    color: CREAM.ink,
    textAlign: 'center',
  },
  comingSoonBody: {
    marginTop: 8,
    ...LEXEND.semibold,
    fontSize: 14,
    color: CREAM.ink,
    textAlign: 'center',
  },
  comingSoonButton: {
    marginTop: 18,
    minWidth: 120,
  },
  roomGuideMascot: {
    width: 104,
    height: 90,
    alignSelf: 'center',
  },
  roomGuideTitle: {
    marginTop: 8,
    ...LEXEND.black,
    fontSize: 22,
    color: CREAM.ink,
    textAlign: 'center',
  },
  roomGuideBody: {
    marginTop: 8,
    ...LEXEND.semibold,
    fontSize: 14,
    lineHeight: 20,
    color: CREAM.ink,
    textAlign: 'center',
  },
  roomGuideButton: {
    marginTop: 18,
    minWidth: 120,
    alignSelf: 'center',
  },
});