import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams, useRootNavigationState } from 'expo-router';
import type { Href } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Image,
  StyleSheet,
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  useFonts,
  Lexend_400Regular,
  Lexend_600SemiBold,
  Lexend_700Bold,
  Lexend_800ExtraBold,
  Lexend_900Black,
} from "@expo-google-fonts/lexend";
import { CheckIcon, RotateLeftIcon, RotateRightIcon, TrashIcon } from '../../components/Icons';
import { Button } from '../../game/ui/Button';
import { OverlaySheet } from '../../game/ui/OverlaySheet';
import { SceneBackdrop } from '../../game/ui/SceneBackdrop';
import { useGameStore } from '../../game/core/store';
import { useStyles, useTheme } from "@/src/game/ui/theme";
import { useCurrentUserId } from '../../data';
import { RoomScene } from '../scene/RoomScene';
import { ColourPicker } from './ColourPicker';
import { RoomBottomBar } from './RoomBottomBar';
import { RoomTopStats } from './RoomTopStats';
import { usePlacementStore } from '../core/placement';
import { ORBIT } from '../input/orbit';
import type { Theme } from "@/src/game/ui/theme";
import { clampRoomYaw } from '../core/roomShell';
import { SCREEN_SIDE_MARGIN, SCREEN_VERTICAL_MARGIN, useSafeInsets } from '../../hooks/use-safe-insets';

// This screen's text is pinned to the mockup's exact ink colour and to Lexend, rather than
// the theme's t.text/system-font pair — a deliberate override for this redesign, not an
// oversight, so it does not shift with the light/dark/high-contrast theme.
const TEXT_COLOR = '#231F20';
const ROOM_EDIT_GUIDE_KEY = 'modu.room-edit-guide-seen.v1';
const ROOM_WELCOME_GUIDE_KEY = 'modu.room-welcome-guide-seen.v1';
const ROOM_GUIDE_MASCOT = require('../../assets/images/mascot/mascot.png');
const LEXEND = {
  regular: 'Lexend_400Regular',
  semibold: 'Lexend_600SemiBold',
  bold: 'Lexend_700Bold',
  extrabold: 'Lexend_800ExtraBold',
  black: 'Lexend_900Black',
} as const;

// A stand-in for icon art that hasn't been delivered yet (star, coins, settings, and every
// bottom-bar glyph). Decorative only — the Pressable it sits in carries the accessibility
// label, so this is hidden from screen readers rather than announced as an unlabeled square.
function Placeholder({ size = 28, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width: size,
          height: size,
          borderRadius: 6,
          backgroundColor: t.surface,
          borderWidth: 1.5,
          borderColor: t.borderStrong,
        },
        style,
      ]}
    />
  );
}

// The user-facing wording for each placement rejection. The grid returns reason codes; copy
// lives here with the rest of the screen's text.
function blockedHint(reason: string | null): string {
  if (reason === null) return 'Drag to position';
  switch (reason) {
    case 'occupied': return 'That spot is occupied. Try another place.';
    case 'out-of-bounds': return 'Keep the furniture on the room floor.';
    case 'surface-not-allowed': return 'This piece cannot go there.';
    default: return 'This item cannot be placed yet.';
  }
}

// Routes that run their OWN heavy Filament scene. While one of these is on top, the room's engine must be down so only one runs at a time. Lightweight layers (the (presentation) modals: settings, profile, …) are NOT here, so opening them leaves the room mounted — no reload.
const HEAVY_ROUTES = new Set(['play', 'tutorial', 'visit']);

export function RoomExperience() {
  const s = useStyles(makeStyles);
  const t = useTheme();
  const { welcome } = useLocalSearchParams<{ welcome?: string }>();
  const welcomeFromTutorial = welcome === 'tutorial';
  // Text renders in the system font until this resolves, then re-renders once — no splash
  // gate, since this is the persistent hub screen and the flash is a single cold-start frame.
  useFonts({
    Lexend_400Regular,
    Lexend_600SemiBold,
    Lexend_700Bold,
    Lexend_800ExtraBold,
    Lexend_900Black,
  });
  // Tear the 3D view down only when a heavy scene is on top, not on every blur. The room screen stays mounted throughout (its placement/zoom UI state survives); only the Filament view unmounts under play/visit and rebuilds on return.
  const rootNav = useRootNavigationState();
  const heavySceneActive = !!rootNav && HEAVY_ROUTES.has(rootNav.routes[rootNav.index]?.name ?? '');
  // The room's own backdrop axis (Settings → Display → "Room background"), separate from the assembly scene's.
  const roomBackdrop = useGameStore((s) => s.roomBackdrop);
  const darkTheme = useGameStore((s) => s.theme) === 'dark';
  // Placement is shared state (src/room/core/placement) so any route can start it and the scene can
  // render the layout. This screen owns only the HUD: the ghost's drag lives in the scene's
  // gesture layer, where the finger is converted to grid cells by ray picking.
  const me = useCurrentUserId();
  const hydrate = usePlacementStore((p) => p.hydrate);
  // Primitive selectors on purpose: this screen re-renders the whole HUD, so it must NOT be
  // subscribed to the activeEdit object, which changes on every cell the ghost crosses.
  const editing = usePlacementStore((p) => p.activeEdit !== null);
  const roomHydrated = usePlacementStore((p) => p.hydrated);
  const placedFurnitureCount = usePlacementStore((p) => p.layout.length);
  const blockedReason = usePlacementStore((p) =>
    p.activeEdit && !p.activeEdit.check.ok ? p.activeEdit.check.reason : null,
  );
  const confirmPlacement = usePlacementStore((p) => p.confirm);
  const cancelPlacement = usePlacementStore((p) => p.cancel);
  const removePlacement = usePlacementStore((p) => p.remove);
  const rotateGhost = usePlacementStore((p) => p.rotateGhost);
  useEffect(() => {
    hydrate(me);
  }, [hydrate, me]);
  const blocked = blockedReason !== null;
  const [unavailableFeature, setUnavailableFeature] = useState<string | null>(null);
  const [showRoomEditGuide, setShowRoomEditGuide] = useState(false);
  const [showRoomWelcomeGuide, setShowRoomWelcomeGuide] = useState(false);
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
      !roomHydrated ||
      editing ||
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
    placedFurnitureCount,
    roomHydrated,
    welcomeFromTutorial,
  ]);
  useEffect(() => {
    if (!welcomeFromTutorial || !roomHydrated || editing) return;
    let active = true;
    AsyncStorage.getItem(ROOM_WELCOME_GUIDE_KEY)
      .then((seen) => {
        if (active && !seen) setShowRoomWelcomeGuide(true);
      })
      .catch((err) => console.warn('[room] welcome guide state load failed', err));
    return () => {
      active = false;
    };
  }, [editing, roomHydrated, welcomeFromTutorial]);
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
  // Every path into the view goes through here — orbit drag, pinch — so the diorama's open corner and the zoom range are enforced once and cannot be forgotten by a new input path.
  const applyRoomControls = (nextRotation: number, nextZoom: number) => {
    const clampedRotation = clampRoomYaw(nextRotation);
    const clampedZoom = Math.max(ORBIT.zoom.min, Math.min(ORBIT.zoom.max, nextZoom));
    roomRotationRef.current = clampedRotation;
    roomZoomRef.current = clampedZoom;
    setRoomRotation(clampedRotation);
    setRoomZoom(clampedZoom);
  };
  const handleRoomRotationChange = (nextRotation: number) => {
    applyRoomControls(nextRotation, roomZoomRef.current);
  };
  const handleRoomZoomChange = (nextZoom: number) => {
    applyRoomControls(roomRotationRef.current, nextZoom);
  };

  // Edge-to-edge: the room HUD is absolutely positioned, so each corner group is nudged in
  // by the device insets (0 on a bezelled tablet, real on a notched phone in landscape).
  const safe = useSafeInsets();
  return (
    <View style={s.screen}>
      {/* The backdrop sits UNDER a transparent Filament view, so the artwork frames the diorama without touching the 3D scene. "clear": the themed app background (screen) shows through. */}
      <SceneBackdrop backdrop={roomBackdrop} dark={darkTheme} style={s.stage}>
        {heavySceneActive ? null : (
          <RoomScene
            rotationY={roomRotation}
            zoom={roomZoom}
            onRotationChange={handleRoomRotationChange}
            onZoomChange={handleRoomZoomChange}
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
        <Placeholder size={26} />
      </Pressable>

      <RoomTopStats />

      <RoomBottomBar />

      {editing ? <ColourPicker /> : null}

      {editing ? (
        <View style={[s.placeBar, blocked && s.placeBarBlocked, { bottom: 78 + Math.max(safe.raw.bottom, SCREEN_VERTICAL_MARGIN) }]}>
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
            source={ROOM_GUIDE_MASCOT}
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
            source={ROOM_GUIDE_MASCOT}
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
    </View>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  // The stage is FULL-BLEED: the Filament view is the screen, with the HUD floating over it. Any
  // inset here becomes a hard clip line through the 3D scene the moment the room is zoomed or
  // orbited near an edge — framing belongs to the camera (src/room/input/orbit.ts), not to this view's
  // margins.
  screen:{flex:1,backgroundColor:t.bg,overflow:'hidden'},stage:StyleSheet.absoluteFillObject,
  // Settings sits on its own, self-positioned at the top-left — RoomTopStats (coins + level)
  // is the equivalent cluster at the top-right, now in its own file.
  settingsButton:{position:'absolute',zIndex:12,width:42,height:42,alignItems:'center',justifyContent:'center',shadowColor:'#50464b',shadowOpacity:.17,shadowRadius:3.5,shadowOffset:{width:0,height:2}},
  placeBar:{position:'absolute',zIndex:16,bottom:78,alignSelf:'center',flexDirection:'row',alignItems:'center',gap:10,borderRadius:22,backgroundColor:t.surface,paddingLeft:18,paddingRight:6,paddingVertical:6,shadowColor:'#000',shadowOpacity:.18,shadowRadius:8},placeBarBlocked:{borderWidth:2,borderColor:t.danger},placeHint:{flexShrink:1,color:TEXT_COLOR,fontFamily:LEXEND.semibold},placeHintBlocked:{color:t.danger,fontSize:11},ghostRotate:{width:36,height:36,borderRadius:18,backgroundColor:t.surfaceRaised,alignItems:'center',justifyContent:'center'},cancelGlyph:{color:TEXT_COLOR,fontFamily:LEXEND.extrabold,fontSize:16},confirmDisabled:{opacity:.35},deleteButton:{width:36,height:36,borderRadius:18,backgroundColor:t.surfaceRaised,alignItems:'center',justifyContent:'center'},confirm:{width:36,height:36,borderRadius:18,backgroundColor:t.success,alignItems:'center',justifyContent:'center'},
  comingSoonTitle:{fontFamily:LEXEND.black,fontSize:22,color:TEXT_COLOR,textAlign:'center'},comingSoonBody:{marginTop:8,fontFamily:LEXEND.semibold,fontSize:14,color:TEXT_COLOR,textAlign:'center'},comingSoonButton:{marginTop:18,minWidth:120},
  roomGuideMascot:{width:104,height:90,alignSelf:'center'},
  roomGuideTitle:{marginTop:8,fontFamily:LEXEND.black,fontSize:22,color:TEXT_COLOR,textAlign:'center'},
  roomGuideBody:{marginTop:8,fontFamily:LEXEND.semibold,fontSize:14,lineHeight:20,color:TEXT_COLOR,textAlign:'center'},
  roomGuideButton:{marginTop:18,minWidth:120,alignSelf:'center'},
});
