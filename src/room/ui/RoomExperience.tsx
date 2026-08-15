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
  const me = useCurrentUserId();
  const hydrate = usePlacementStore((p) => p.hydrate);
  const hydrated = usePlacementStore((p) => p.hydrated);
  const editing = usePlacementStore((p) => p.activeEdit !== null);
  const placedFurnitureCount = usePlacementStore((p) => p.layout.length);
  useEffect(() => {
    hydrate(me);
  }, [hydrate, me]);
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

      {/* hidden mid-placement */}
      {editing ? null : (
        <RoomLightControls
          hour={hour}
          onHourChange={setRoomTimeOfDay}
          lightOn={ceilingLight}
          // Stamped with the CURRENT hour
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