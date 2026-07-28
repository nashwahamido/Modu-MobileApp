import { useEffect, useRef, useState } from 'react';
import { router, useRootNavigationState } from 'expo-router';
import type { Href } from 'expo-router';
import { StyleSheet, Image, Pressable, Text, View } from "react-native";
import { CartIcon, CheckIcon, ChevronIcon, CoinMedalIcon, FriendsIcon, InventoryIcon, LevelStarIcon, RotateLeftIcon, RotateRightIcon, SettingsIcon, TrashIcon } from '../../components/Icons';
import { Button } from '../../game/ui/Button';
import { OverlaySheet } from '../../game/ui/OverlaySheet';
import { SceneBackdrop } from '../../game/ui/SceneBackdrop';
import { useGameStore } from '../../game/core/store';
import { useStyles, useTheme } from "@/src/game/ui/theme";
import { levelProgressFraction } from '../../data/levels';
import { useProfileHud } from '../../hooks/useProfileHud';
import { useCurrentUserId } from '../../data';
import { RoomScene } from '../scene/RoomScene';
import { ColourPicker } from './ColourPicker';
import { usePlacementStore } from '../core/placement';
import { ORBIT } from '../input/orbit';
import type { Theme } from "@/src/game/ui/theme";
import { clampRoomYaw } from '../core/roomShell';
import { SCREEN_SIDE_MARGIN, SCREEN_VERTICAL_MARGIN, useSafeInsets } from '../../hooks/use-safe-insets';

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
  // Tear the 3D view down only when a heavy scene is on top, not on every blur. The room screen stays mounted throughout (its placement/zoom UI state survives); only the Filament view unmounts under play/visit and rebuilds on return.
  const rootNav = useRootNavigationState();
  const heavySceneActive = !!rootNav && HEAVY_ROUTES.has(rootNav.routes[rootNav.index]?.name ?? '');
  // Null until the first fetch lands — render an em dash rather than a placeholder number that would read as real.
  const profile = useProfileHud();
  // The bar reads full at the top of the curve, where xpForNextLevel is null and there is nothing left to climb to.
  const levelPercent = profile
    ? Math.round(levelProgressFraction({ xpIntoLevel: profile.xpIntoLevel, xpForNextLevel: profile.xpForNextLevel }) * 100)
    : 0;
  const [barOpen, setBarOpen] = useState(true);
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
  const [roomRotation, setRoomRotation] = useState(0);
  const [roomZoom, setRoomZoom] = useState(1);
  const roomRotationRef = useRef(roomRotation);
  const roomZoomRef = useRef(roomZoom);
  useEffect(() => {
    roomRotationRef.current = roomRotation;
    roomZoomRef.current = roomZoom;
  }, [roomRotation, roomZoom]);
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
      <View style={[s.stats, { left: 22 + Math.max(safe.raw.left, SCREEN_SIDE_MARGIN), top: 12 + Math.max(safe.raw.top, SCREEN_VERTICAL_MARGIN) }]}>
        <Pressable
          accessibilityLabel="Settings"
          style={s.settingsButton}
          onPress={() => router.push("/settings" as Href)}
        >
          <SettingsIcon size={40} color={t.textDim} />
        </Pressable>
        <Pressable
          accessibilityLabel="Profile"
          style={s.levelGroup}
          onPress={() => router.push("/profile" as Href)}
        >
          <View style={s.levelBadge}>
            <LevelStarIcon size={48} />
            <Text style={s.levelNumber}>{profile?.level ?? "–"}</Text>
          </View>
          <View style={s.progress}>
            <View style={[s.progressFill, { width: `${levelPercent}%` }]} />
            <Text style={s.progressText}>{levelPercent}%</Text>
          </View>
        </Pressable>
        <View style={s.currencyGroup}>
          <View style={s.coinBadge}>
            <CoinMedalIcon size={44} />
          </View>
          <View style={s.currency}>
            <Text style={s.currencyText}>{profile?.coins ?? "–"}</Text>
          </View>
        </View>
      </View>

      <View style={[s.rail, !barOpen && s.railClosed, { right: 18 + Math.max(safe.raw.right, SCREEN_SIDE_MARGIN) }]}>
        <Pressable
          accessibilityLabel="Toggle menu"
          style={[s.chevron, !barOpen && s.chevronClosed]}
          onPress={() => setBarOpen((x) => !x)}
        >
          <ChevronIcon size={barOpen ? 28 : 34} up={barOpen} />
        </Pressable>
        {barOpen ? (
          <>
            <Pressable
              style={s.railButton}
              onPress={() => router.push("/store" as Href)}
            >
              <CartIcon size={31} />
              <Text style={s.railLabel}>shop</Text>
            </Pressable>
            <Pressable
              style={s.railButton}
              onPress={() => router.push("/inventory" as Href)}
            >
              <InventoryIcon size={32} />
              <Text style={s.railLabel}>inventory</Text>
            </Pressable>
            <Pressable
              style={s.railButton}
              onPress={() => router.push("/profile" as Href)}
            >
              <FriendsIcon size={34} />
              <Text style={s.railLabel}>visit friends</Text>
            </Pressable>
          </>
        ) : (
          <View style={s.collapsedPill} />
        )}
      </View>
      <Pressable
        accessibilityLabel="Tasks"
        style={[s.workbench, { right: 34 + Math.max(safe.raw.right, SCREEN_SIDE_MARGIN), bottom: 30 + Math.max(safe.raw.bottom, SCREEN_VERTICAL_MARGIN) }]}
        onPress={() => router.push("/catalogue" as Href)}
      >
        <Image
          source={require("../../assets/ui/icons/Assemble.png")}
          style={s.workbenchIcon}
          resizeMode="contain"
        />
      </Pressable>

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
    </View>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  // The stage is FULL-BLEED: the Filament view is the screen, with the HUD floating over it. Any
  // inset here becomes a hard clip line through the 3D scene the moment the room is zoomed or
  // orbited near an edge — framing belongs to the camera (src/room/input/orbit.ts), not to this view's
  // margins.
  screen:{flex:1,backgroundColor:t.bg,overflow:'hidden'},stage:StyleSheet.absoluteFillObject,stats:{position:'absolute',zIndex:12,left:22,top:12,flexDirection:'row',alignItems:'center',gap:18},settingsButton:{width:42,height:42,alignItems:'center',justifyContent:'center',shadowColor:'#50464b',shadowOpacity:.17,shadowRadius:3.5,shadowOffset:{width:0,height:2}},levelGroup:{flexDirection:'row',alignItems:'center'},levelBadge:{zIndex:2,width:50,height:50,alignItems:'center',justifyContent:'center',shadowColor:'#4f4264',shadowOpacity:.24,shadowRadius:3.7,shadowOffset:{width:-1,height:3}},levelNumber:{position:'absolute',color:t.onAccent,fontSize:15,fontWeight:'600',textShadowColor:'rgba(68,53,85,.22)',textShadowOffset:{width:0,height:1},textShadowRadius:1.2},progress:{width:126,height:21,marginLeft:-6,borderRadius:12,backgroundColor:t.surfaceInset,overflow:'hidden',justifyContent:'center'},progressFill:{position:'absolute',left:0,top:0,bottom:0,backgroundColor:t.accent},progressText:{alignSelf:'center',color:t.textDim,fontSize:11,fontWeight:'600'},currencyGroup:{flexDirection:'row',alignItems:'center'},coinBadge:{zIndex:2,width:46,height:46,alignItems:'center',justifyContent:'center',shadowColor:'#76642e',shadowOpacity:.2,shadowRadius:3.5,shadowOffset:{width:-1,height:3}},currency:{width:126,height:21,marginLeft:-5,borderRadius:12,backgroundColor:t.surfaceInset,alignItems:'center',justifyContent:'center'},currencyText:{color:t.text,fontSize:12,fontWeight:'700'},
  rail:{position:'absolute',zIndex:14,right:18,top:58,width:78,height:238,paddingVertical:15,borderWidth:1.2,borderColor:t.border,borderRadius:18,backgroundColor:t.surface,alignItems:'center',justifyContent:'space-between',shadowColor:'#8d8190',shadowOpacity:.17,shadowRadius:7,shadowOffset:{width:-3,height:6}},railClosed:{top:22,width:78,height:52,paddingVertical:0,borderWidth:0,backgroundColor:'transparent',shadowOpacity:0},chevron:{position:'absolute',top:-34,width:48,height:34,alignItems:'center',justifyContent:'center'},chevronClosed:{top:0,width:58,height:30},collapsedPill:{position:'absolute',top:39,width:58,height:9,borderRadius:6,backgroundColor:t.surface,borderWidth:.65,borderColor:t.border,shadowColor:'#8d8190',shadowOpacity:.18,shadowRadius:4,shadowOffset:{width:-2,height:3}},railButton:{width:74,minHeight:58,alignItems:'center',justifyContent:'center'},railLabel:{fontSize:10.5,lineHeight:13,color:t.text,marginTop:1,fontWeight:'400',textAlign:'center'},workbench:{position:'absolute',zIndex:13,right:34,bottom:30,width:88,height:88,alignItems:'center',justifyContent:'center'},workbenchIcon:{width:88,height:88},
  placeBar:{position:'absolute',zIndex:12,bottom:78,alignSelf:'center',flexDirection:'row',alignItems:'center',gap:10,borderRadius:22,backgroundColor:t.surface,paddingLeft:18,paddingRight:6,paddingVertical:6,shadowColor:'#000',shadowOpacity:.18,shadowRadius:8},placeBarBlocked:{borderWidth:2,borderColor:t.danger},placeHint:{flexShrink:1,color:t.textDim,fontWeight:'600'},placeHintBlocked:{color:t.danger,fontSize:11},ghostRotate:{width:36,height:36,borderRadius:18,backgroundColor:t.surfaceRaised,alignItems:'center',justifyContent:'center'},cancelGlyph:{color:t.textDim,fontSize:16,fontWeight:'800'},confirmDisabled:{opacity:.35},deleteButton:{width:36,height:36,borderRadius:18,backgroundColor:t.surfaceRaised,alignItems:'center',justifyContent:'center'},confirm:{width:36,height:36,borderRadius:18,backgroundColor:t.success,alignItems:'center',justifyContent:'center'},
  comingSoonTitle:{fontSize:22,fontWeight:'900',color:t.text,textAlign:'center'},comingSoonBody:{marginTop:8,fontSize:14,fontWeight:'600',color:t.textDim,textAlign:'center'},comingSoonButton:{marginTop:18,minWidth:120},
});