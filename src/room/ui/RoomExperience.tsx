import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams, useRootNavigationState } from 'expo-router';
import type { Href } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StyleSheet, Image, Pressable, Text, View } from "react-native";
import { SETTINGS_ICON } from '../../components/iconAssets';
import { Button } from '../../game/ui/system/Button';
import { OverlaySheet } from '../../game/ui/system/OverlaySheet';
import { SceneBackdrop } from '../../game/ui/backdrop/SceneBackdrop';
import { ROOM_BACKGROUND } from './roomBackdrops';
import { ceilingLightOn, type CeilingLightOverride } from '../core/timeOfDay';
import { useGameStore } from '../../game/core/store';
import { avatarForProfile } from '@/src/components/avatarAssets';
import { CARD_CHROME, CREAM, useFixedStyles, LEXEND } from "@/src/game/ui/system/theme";
import { useCurrentUserId } from '../../data';
import { RoomScene } from '../scene/RoomScene';
import { FriendPickerOverlay } from './FriendPickerOverlay';
import { RoomBottomBar } from './RoomBottomBar';
import { LIGHT_COLUMN_GAP, RoomLightControls } from './RoomLightControls';
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
import { useAvatarModeNotice } from './avatarModeNotice';
import { CLEAR_PATH_BED_ITEM_ID, clearPathBedPlacement } from '../character/clearPathBed';
import { roomItemDefs, useRoomCatalogStore } from '../core/placeableItems';
import { saveSelectedAvatarMode } from '@/src/services/onboarding';

const ROOM_EDIT_GUIDE_KEY = 'modu.room-edit-guide-seen.v1';
const ROOM_WELCOME_GUIDE_KEY = 'modu.room-welcome-guide-seen.v1';

// Routes with their own Filament scene: only one engine may run at a time
// Modals are deliberately absent, so opening one leaves the room mounted
const HEAVY_ROUTES = new Set(['play', 'tutorial', 'visit']);

export function RoomExperience() {
  const s = useFixedStyles(makeStyles);

  const { welcome, open, firstPlacement } = useLocalSearchParams<{
    welcome?: string;
    open?: string;
    firstPlacement?: string;
  }>();
  const welcomeFromTutorial = welcome === 'tutorial';
  const rootNav = useRootNavigationState();
  const heavySceneActive = !!rootNav && HEAVY_ROUTES.has(rootNav.routes[rootNav.index]?.name ?? '');
  const stillViewingFriend = usePlacementStore((p) => p.viewing !== null);
  const sceneMounted = !(heavySceneActive || stillViewingFriend);
  const [sceneReady, setSceneReady] = useState(false);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (sceneMounted) return;
    setSceneReady(false);
    setRevealed(false);
  }, [sceneMounted]);
  const hour = useGameStore((s) => s.roomTimeOfDay);
  const setRoomTimeOfDay = useGameStore((s) => s.setRoomTimeOfDay);

  const [lightOverride, setLightOverride] = useState<CeilingLightOverride>(null);
  const ceilingLight = ceilingLightOn(hour, lightOverride);
  const roomGuideMascot = avatarForProfile(useGameStore((s) => s.profile));
  const pendingClearPath = useAvatarModeNotice((n) => n.pendingClearPath);
  const pebblePrompt = useAvatarModeNotice((n) => n.pebblePrompt);
  const markClearPathReady = useAvatarModeNotice((n) => n.markClearPathReady);
  const dismissPebblePrompt = useAvatarModeNotice((n) => n.dismissPebblePrompt);
  const cancelClearPathRequest = useAvatarModeNotice(
    (n) => n.cancelClearPathRequest,
  );
  const completeClearPathRequest = useAvatarModeNotice(
    (n) => n.completeClearPathRequest,
  );
  const applyProfile = useGameStore((s) => s.applyProfile);
  const [placingPebble, setPlacingPebble] = useState(false);
  // Placement is shared state (src/room/core/placement) so any route can start it and the scene can render the layout. This screen owns only the HUD: the ghost's drag lives in the scene's gesture layer, where the finger is converted to grid cells by ray picking.
  const me = useCurrentUserId();
  const hydrate = usePlacementStore((p) => p.hydrate);
  const hydrated = usePlacementStore((p) => p.hydrated);
  const editing = usePlacementStore((p) => p.activeEdit !== null);
  const roomLayout = usePlacementStore((p) => p.layout);
  const clearPathBedDef = useRoomCatalogStore(
    (c) => c.items[CLEAR_PATH_BED_ITEM_ID]?.def,
  );
  const placedFurnitureCount = usePlacementStore((p) => p.layout.length);
  useEffect(() => {
    hydrate(me);
  }, [hydrate, me]);
  useEffect(() => {
    if (
      !pendingClearPath ||
      pebblePrompt !== null ||
      !hydrated ||
      editing ||
      !clearPathBedDef
    )
      return;
    if (
      clearPathBedPlacement(roomLayout, clearPathBedDef, roomItemDefs())
    ) {
      markClearPathReady();
    }
  }, [
    clearPathBedDef,
    editing,
    hydrated,
    markClearPathReady,
    pebblePrompt,
    pendingClearPath,
    roomLayout,
  ]);
  const placePebbleBed = async () => {
    if (placingPebble) return;
    setPlacingPebble(true);
    try {
      await saveSelectedAvatarMode('clearPath');
      completeClearPathRequest();
      applyProfile('clearPath');
    } catch (error) {
      console.warn('[profile] could not switch to Clear Path', error);
    } finally {
      setPlacingPebble(false);
    }
  };
  const [unavailableFeature, setUnavailableFeature] = useState<string | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
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

  // HUD is absolutely positioned
  const safe = useSafeInsets();
  return (
    <View style={s.screen}>
      {/* The backdrop sits UNDER a transparent Filament view */}
      <SceneBackdrop source={ROOM_BACKGROUND} fit="cover" style={s.stage}>
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
      {/* ONE column: the settings disc and the two lighting discs are the same control set, so they
          share a stack and one gap rather than being positioned apart and hoping they line up.
          box-none, or the column's empty height would swallow taps meant for the room behind it. */}
      <View
        style={[
          s.leftColumn,
          {
            // Sits BELOW the coins and level bars opposite rather than level with them — the two
            // clusters are read at different moments, and the extra drop keeps the gear clear of the
            // status area. Levelling them instead would be 12 + 3 + inset: RoomTopStats pads by the
            // same 12 and centres its 23pt bar inside a 54pt badge, against this 48pt disc.
            top: 12 + 14 + Math.max(safe.raw.top, SCREEN_VERTICAL_MARGIN),
            left: 18 + Math.max(safe.raw.left, SCREEN_SIDE_MARGIN),
          },
        ]}
        pointerEvents="box-none"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          style={s.settingsButton}
          onPress={() => router.push("/settings" as Href)}
        >
          <Image source={SETTINGS_ICON} style={s.settingsIcon} resizeMode="contain" />
        </Pressable>

        {/* hidden mid-placement */}
        {editing ? null : (
          <RoomLightControls
            hour={hour}
            onHourChange={setRoomTimeOfDay}
            lightOn={ceilingLight}
            // Stamped with the CURRENT hour
            onToggleLight={() => setLightOverride({ hour, on: !ceilingLight })}
          />
        )}
      </View>

      <RoomTopStats />

      <RoomBottomBar
        onOpenShop={() => setShopOpen(true)}
        onOpenInventory={() => setInventoryOpen(true)}
        onOpenVisit={() => setVisitPickerOpen(true)}
      />

      {/* all of the placement UI swatches and buttons lives in one component on the right edge */}
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

      {pebblePrompt === 'needsSpace' ? (
        <OverlaySheet size="dialog" onClose={dismissPebblePrompt}>
          <Image
            source={avatarForProfile('clearPath')}
            style={s.roomGuideMascot}
            resizeMode="contain"
          />
          <Text style={s.roomGuideTitle}>Pebble needs a little more room</Text>
          <Text style={s.roomGuideBody}>
            Pebble needs space for a bed. Move some furniture and try again.
          </Text>
          <Button
            label="I'll make space"
            variant="primary"
            style={s.roomGuideButton}
            onPress={dismissPebblePrompt}
          />
        </OverlaySheet>
      ) : null}

      {pebblePrompt === 'ready' ? (
        <OverlaySheet size="dialog" onClose={cancelClearPathRequest}>
          <Image
            source={avatarForProfile('clearPath')}
            style={s.roomGuideMascot}
            resizeMode="contain"
          />
          <Text style={s.roomGuideTitle}>That spot works perfectly!</Text>
          <Text style={s.roomGuideBody}>Shall I bring my bed in?</Text>
          <Button
            label={placingPebble ? "Bringing it in…" : "Place my bed"}
            variant="primary"
            style={s.roomGuideButton}
            disabled={placingPebble}
            onPress={placePebbleBed}
          />
        </OverlaySheet>
      ) : null}

      {showRoomEditGuide && pebblePrompt === null ? (
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

      {showRoomWelcomeGuide && pebblePrompt === null ? (
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
  //  .
  screen: {
    flex: 1,
    backgroundColor: t.bg,
    overflow: 'hidden',
  },
  stage: StyleSheet.absoluteFillObject,

  // Hangs from the top-left corner; its height is its contents. LIGHT_COLUMN_GAP is the ONE spacing:
  // the light controls repeat it internally, so all three discs sit the same distance apart.
  leftColumn: {
    position: 'absolute',
    zIndex: 12,
    alignItems: 'flex-start',
    gap: LIGHT_COLUMN_GAP,
  },
  // Sized TO the artwork, which is a disc: the shadow follows the view's box, so a 42pt box under a
  // 48pt drawing would cast a circle smaller than the thing casting it. borderWidth is zeroed because
  // the disc brings its own edge — only the shadow is wanted from CARD_CHROME.
  settingsButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    ...CARD_CHROME,
    borderWidth: 0,
  },
  settingsIcon: {
    width: 48,
    height: 48,
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
