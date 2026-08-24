import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams, useRootNavigationState } from 'expo-router';
import type { Href } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StyleSheet, Image, Text, View } from "react-native";
import { Pressable } from "@/src/components/Pressable";
import { SETTINGS_ICON } from '../../components/iconAssets';
import { Button } from '../../game/ui/system/Button';
import { OverlaySheet } from '../../game/ui/system/OverlaySheet';
import { SceneBackdrop } from '../../game/ui/backdrop/SceneBackdrop';
import { ROOM_BACKGROUND } from './roomBackdrops';
import { ceilingLightOn, type CeilingLightOverride } from '../core/timeOfDay';
import { useGameStore } from '../../game/core/store';
import { avatarForProfile } from '@/src/components/avatarAssets';
import { CARD_CHROME, CREAM, useFixedStyles, useIsTablet, LEXEND } from "@/src/game/ui/system/theme";
import { useCurrentUserId } from '../../data';
import { RoomScene } from '../scene/RoomScene';
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

// The gear's chip, matched to the light buttons below it (RoomLightControls' BUTTON)
const SETTINGS_DISC = 48;
// The chip's cream, shared with the room's other chrome
const ROOM_CHIP_FILL = '#FBFAF3';
// The artwork inside the chip. Short of the chip so the gear reads as sitting ON a tile rather than
// filling it — the same relationship the assembly HUD's icons have to their chips.
const SETTINGS_ICON_FRACTION = 0.92;
// The gear is NOT centred in its own file, and `contain` centres the CANVAS rather than the drawing —
// so the file's own offset lands on screen as an icon parked high in its chip. Measured on alpha,
// icon-settings.png draws x 12..208 and y 3..202 of a 218x218 canvas: a centre 6.5px above and 1px
// right of the canvas's, which at the rendered size left twice as much chip below the gear as above.
// Expressed as a fraction of the ICON BOX so it holds at any scale, phone and tablet alike.
// RE-MEASURE IF THE PNG IS RE-EXPORTED: nudge = (canvas/2 - drawnCentre) / canvas, per axis.
const SETTINGS_ART_NUDGE_X = -1 / 218;
const SETTINGS_ART_NUDGE_Y = 6.5 / 218;

const ROOM_EDIT_GUIDE_KEY = 'modu.room-edit-guide-seen.v1';
const ROOM_WELCOME_GUIDE_KEY = 'modu.room-welcome-guide-seen.v1';

// Routes with their own Filament scene: only one engine may run at a time
// Modals are deliberately absent, so opening one leaves the room mounted
const HEAVY_ROUTES = new Set(['play', 'tutorial', 'visit']);

export function RoomExperience() {
  const s = useFixedStyles(makeStyles);
  // This screen's sheet stays FIXED — it carries the scene's own chrome, laid out to the point. Only
  // the left column is scaled for tablets, and by hand, so nothing else on the screen moves.
  const k = useLeftColumnScale();
  // The room has TWO layouts, not one layout at two sizes. See the branch further down.
  const tablet = useIsTablet();
 
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
  // The level the profile currently reports. LevelUpCelebration compares it against the last one it
  // congratulated, so this is just "what they are now", not "did something happen".
  const hudProfile = useProfileHud();
  const placedFurnitureCount = usePlacementStore((p) => p.layout.length);
  useEffect(() => {
    hydrate(me);
  }, [hydrate, me]);
  const [unavailableFeature, setUnavailableFeature] = useState<string | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(open === 'inventory');
  const [visitPickerOpen, setVisitPickerOpen] = useState(false);
  // Which navigation item is marked as active, for whichever of the two layouts is on screen. Derived
  // rather than a third piece of state: the popups' own flags already say which one is up, and a
  // separate "current tab" would be one more thing that can disagree with them.
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
            // The design offsets scale with the screen; the device insets do NOT — a cutout is a
            // physical clearance, and multiplying it would inset the column further for no reason.
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
          // RADIUS.control, not half the width: this is the same rounded-square chip the light switch
          // below it wears. Scaled here because the sheet's own radius is not — the inline value wins.
          style={[
            s.settingsButton,
            { width: SETTINGS_DISC * k, height: SETTINGS_DISC * k, borderRadius: ROOM_CHIP_RADIUS * k },
          ]}
          onPress={() => router.push("/settings" as Href)}
        >
          <Image
            source={SETTINGS_ICON}
            style={{
              width: SETTINGS_DISC * SETTINGS_ICON_FRACTION * k,
              height: SETTINGS_DISC * SETTINGS_ICON_FRACTION * k,
              // A transform, not a margin: this corrects where the ART lands, and the box it sits in
              // is already centred in the chip. A margin would move the box and unbalance that.
              transform: [
                { translateX: SETTINGS_DISC * SETTINGS_ICON_FRACTION * SETTINGS_ART_NUDGE_X * k },
                { translateY: SETTINGS_DISC * SETTINGS_ICON_FRACTION * SETTINGS_ART_NUDGE_Y * k },
              ],
            }}
            resizeMode="contain"
          />
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

      {/* Fires only when the level has climbed past the last one celebrated — see the component.
          Held back while a placement is in progress or a guide is up: those are the player steering
          something, and a full-screen reward over them takes the room away mid-action. */}
      <LevelUpCelebration
        level={hudProfile?.level ?? null}
        title={hudProfile?.title ?? null}
        blocked={editing || showRoomWelcomeGuide}
      />

      {/* TWO LAYOUTS, chosen by device — not one layout scaled.
          A phone is narrow and tall-ish in landscape: a band across the bottom eats the floor, which is
          where the room's furniture is, so navigation goes down the right edge as a rail and Assemble
          stands alone in the opposite corner.
          A tablet has width to spare and the bar reads fine there, so it keeps the arrangement it was
          designed and tuned against. The two share their icons, their scale hooks and their chrome, but
          not their arrangement — a tweak to one does NOT reach the other, which is the cost of this. */}
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

          {/* Opposite the rail, and clear of it: the one action, not one of the places to go. Hidden mid-placement, like the light controls — the room is being edited, not navigated. */}
          {editing ? null : (
            <RoomAssembleButton
              style={{
                // Aligned on CENTRES, not on left edges: this button's collar is wider than the discs
                // above it, so sharing their left inset would push it half the difference to the right
                // and break the column's line.
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
  
  // Hangs from the top-left corner; its height is its contents. LIGHT_COLUMN_GAP is the ONE spacing:
  // the light controls repeat it internally, so all three discs sit the same distance apart.
  leftColumn: {
    position: 'absolute',
    zIndex: 12,
    alignItems: 'flex-start',
    gap: LIGHT_COLUMN_GAP,
  },
  // A rounded-square CHIP, matching the small buttons on the assembly HUD (game/ui/hud/hudChrome's
  // IconButtonBare). The shadow fits now because it follows this container rather than the artwork:
  // icon-settings.png draws off-centre in its own canvas (see SETTINGS_ART_NUDGE_Y), so a shadow cast
  // by the image's own box ringed the drawing instead of sitting under it.
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