import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StyleSheet, Image, Text, View } from "react-native";
import { Pressable } from "@/src/components/Pressable";
import { SETTINGS_ICON } from '../../components/iconAssets';
import { Button } from '../../game/ui/system/Button';
import { OverlaySheet } from '../../game/ui/system/OverlaySheet';
import { SLIDE_UP } from '../../game/ui/system/slideUp';
import { SceneBackdrop } from '../../game/ui/backdrop/SceneBackdrop';
import { roomBackgroundView } from './roomBackdrops';
import { ceilingLightOn, timeOfDayPhase, type CeilingLightOverride } from '../core/timeOfDay';
import { useGameStore } from '../../game/core/store';
import { usePrefsStore } from "@/src/game/core/prefsStore";
import { avatarForProfile } from '@/src/components/avatarAssets';
import { CARD_CHROME, CREAM, useFixedStyles, useIsTablet, LEXEND } from "@/src/game/ui/system/theme";
import { useCurrentUserId } from '../../data';
import { RoomScene } from '../scene/RoomScene';
import { useSceneSlot } from '../../game/scene/sceneSlot';
import { FriendPickerOverlay } from './FriendPickerOverlay';
import { RoomNavRail } from './RoomNavRail';
import { ASSEMBLE_COLLAR_SIZE, RoomAssembleButton } from './RoomAssembleButton';
import { RoomBottomBar } from './RoomBottomBar';
import { LIGHT_COLUMN_GAP, ROOM_CHIP_RADIUS, RoomLightControls } from './RoomLightControls';
import { useLeftColumnScale } from './roomScale';
import { RoomLoadingOverlay } from './RoomLoadingOverlay';
import { RoomFirstPlacementGuide } from './RoomFirstPlacementGuide';
import {
  PlacementRail,
  type PlacementGuideInteraction,
  type PlacementGuideTarget,
} from './PlacementRail';
import { useProfileHud } from '../../hooks/useProfileHud';
import { LevelUpCelebration } from './LevelUpCelebration';
import { RoomTopStats } from './RoomTopStats';
import { ShopOverlay } from '../../shop/ShopOverlay';
import { InventoryOverlay } from '../../inventory/InventoryOverlay';
import { usePlacementStore } from '../core/placement';
import { ORBIT } from '../input/orbit';
import type { Theme } from "@/src/game/ui/system/theme";
import { SCREEN_SIDE_MARGIN, SCREEN_VERTICAL_MARGIN, useSafeInsets } from '../../hooks/use-safe-insets';

const SETTINGS_DISC = 48;
const ROOM_CHIP_FILL = '#FBFAF3';
const SETTINGS_ICON_FRACTION = 0.92;
const SETTINGS_ART_NUDGE_X = -1 / 218;
const SETTINGS_ART_NUDGE_Y = 6.5 / 218;

const ROOM_EDIT_GUIDE_KEY = 'modu.room-edit-guide-seen.v1';
const ROOM_WELCOME_GUIDE_KEY = 'modu.room-welcome-guide-seen.v1';

export function RoomExperience() {
  const s = useFixedStyles(makeStyles);
  const k = useLeftColumnScale();
  const tablet = useIsTablet();

  const { welcome, open, firstPlacement } = useLocalSearchParams<{
    welcome?: string;
    open?: string;
    firstPlacement?: string;
  }>();
  const welcomeFromTutorial = welcome === 'tutorial';
  const stillViewingFriend = usePlacementStore((p) => p.viewing !== null);
  const sceneMounted = useSceneSlot('room', !stillViewingFriend);
  const [sceneReady, setSceneReady] = useState(false);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (sceneMounted) return;
    setSceneReady(false);
    setRevealed(false);
  }, [sceneMounted]);
  const hour = usePrefsStore((s) => s.roomTimeOfDay);
  const setRoomTimeOfDay = usePrefsStore((s) => s.setRoomTimeOfDay);
  const roomBackground = usePrefsStore((s) => s.roomBackground);

  const [lightOverride, setLightOverride] = useState<CeilingLightOverride>(null);
  const ceilingLight = ceilingLightOn(hour, lightOverride);
  const roomGuideMascot = avatarForProfile(useGameStore((s) => s.profile));
  const me = useCurrentUserId();
  const hydrate = usePlacementStore((p) => p.hydrate);
  const hydrated = usePlacementStore((p) => p.hydrated);
  const editing = usePlacementStore((p) => p.activeEdit !== null);
  const hudProfile = useProfileHud();
  const placedFurnitureCount = usePlacementStore((p) => p.layout.length);
  useEffect(() => {
    hydrate(me);
  }, [hydrate, me]);
  const [unavailableFeature, setUnavailableFeature] = useState<string | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(open === 'inventory');
  const [visitPickerOpen, setVisitPickerOpen] = useState(false);

  const panelOpen = shopOpen || inventoryOpen || visitPickerOpen;
  const [scenePaused, setScenePaused] = useState(false);
  useEffect(() => {
    if (!panelOpen) {
      setScenePaused(false);
      return;
    }
    const timer = setTimeout(() => setScenePaused(true), SLIDE_UP.enterMs);
    return () => clearTimeout(timer);
  }, [panelOpen]);
  const navActive = shopOpen
    ? 'shop'
    : inventoryOpen
      ? 'inventory'
      : visitPickerOpen
        ? 'friends'
        : null;
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

  const safe = useSafeInsets();
  return (
    <View style={s.screen}>
      <SceneBackdrop {...roomBackgroundView(roomBackground, timeOfDayPhase(hour))} style={s.stage}>
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
            paused={scenePaused}
          />
        ) : null}
      </SceneBackdrop>
      <View
        style={[
          s.leftColumn,
          {
            top: (12 + 14) * k + Math.max(safe.raw.top, SCREEN_VERTICAL_MARGIN),
            left: 18 * k + Math.max(safe.raw.left, SCREEN_SIDE_MARGIN),
            gap: LIGHT_COLUMN_GAP * k,
          },
        ]}
        pointerEvents="box-none"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          style={[
            s.settingsButton,
            {
              width: SETTINGS_DISC * k,
              height: SETTINGS_DISC * k,
              borderRadius: ROOM_CHIP_RADIUS * k,
            },
          ]}
          onPress={() => router.push("/settings" as Href)}
        >
          <Image
            source={SETTINGS_ICON}
            style={{
              width: SETTINGS_DISC * SETTINGS_ICON_FRACTION * k,
              height: SETTINGS_DISC * SETTINGS_ICON_FRACTION * k,
              transform: [
                { translateX: SETTINGS_DISC * SETTINGS_ICON_FRACTION * SETTINGS_ART_NUDGE_X * k },
                { translateY: SETTINGS_DISC * SETTINGS_ICON_FRACTION * SETTINGS_ART_NUDGE_Y * k },
              ],
            }}
            resizeMode="contain"
          />
        </Pressable>

        {editing ? null : (
          <RoomLightControls
            hour={hour}
            onHourChange={setRoomTimeOfDay}
            lightOn={ceilingLight}
            onToggleLight={() =>
              setLightOverride({
                hour,
                on: !ceilingLight,
              })
            }
          />
        )}
      </View>

      <RoomTopStats />

      <LevelUpCelebration
        level={hudProfile?.level ?? null}
        title={hudProfile?.title ?? null}
        blocked={editing || showRoomWelcomeGuide}
      />

      {tablet ? (
        <RoomBottomBar
          onOpenShop={() => setShopOpen(true)}
          onOpenInventory={() => setInventoryOpen(true)}
          onOpenVisit={() => setVisitPickerOpen(true)}
          active={navActive}
        />
      ) : (
        <>
          <RoomNavRail
            onOpenShop={() => setShopOpen(true)}
            onOpenInventory={() => setInventoryOpen(true)}
            onOpenVisit={() => setVisitPickerOpen(true)}
            active={navActive}
          />

          {editing ? null : (
            <RoomAssembleButton
              style={{
                left:
                  18 * k +
                  Math.max(safe.raw.left, SCREEN_SIDE_MARGIN) -
                  ((ASSEMBLE_COLLAR_SIZE - SETTINGS_DISC) / 2) * k,
                bottom: 14 * k + Math.max(safe.raw.bottom, SCREEN_VERTICAL_MARGIN),
              }}
            />
          )}
        </>
      )}

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
  screen: {
    flex: 1,
    backgroundColor: t.bg,
    overflow: 'hidden',
  },
  stage: StyleSheet.absoluteFillObject,

  leftColumn: {
    position: 'absolute',
    zIndex: 12,
    alignItems: 'flex-start',
    gap: LIGHT_COLUMN_GAP,
  },
  settingsButton: {
    borderRadius: ROOM_CHIP_RADIUS,
    backgroundColor: ROOM_CHIP_FILL,
    alignItems: 'center',
    justifyContent: 'center',
    ...CARD_CHROME,
    borderWidth: 0,
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
