import { useEffect, useRef, useState } from 'react';
import { router, useRootNavigationState } from 'expo-router';
import type { Href } from 'expo-router';
import {
  StyleSheet,
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useFonts,
  Lexend_400Regular,
  Lexend_600SemiBold,
  Lexend_700Bold,
  Lexend_800ExtraBold,
  Lexend_900Black,
} from "@expo-google-fonts/lexend";
import { CheckIcon, ChevronIcon, RotateLeftIcon, RotateRightIcon, TrashIcon } from '../../components/Icons';
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

// This screen's text is pinned to the mockup's exact ink colour and to Lexend, rather than
// the theme's t.text/system-font pair — a deliberate override for this redesign, not an
// oversight, so it does not shift with the light/dark/high-contrast theme.
const TEXT_COLOR = '#231F20';

// The bottom bar's expand/collapse: plain RN LayoutAnimation doesn't reliably fire under the
// New Architecture (app.json → newArchEnabled), which this app runs on — so the transition
// uses Reanimated's layout-animation API instead, which is built for Fabric. `BAR_LAYOUT` is
// applied to every view whose FRAME changes (the pill resizing, items shifting over as a
// neighbour appears/disappears); `BAR_ITEM_ENTERING`/`EXITING` fade the items that actually
// mount/unmount. Short, linear-ish durations on purpose — a soft settle, not a bounce.
const BAR_LAYOUT = LinearTransition.duration(220);
const BAR_ITEM_ENTERING = FadeIn.duration(160);
const BAR_ITEM_EXITING = FadeOut.duration(120);
// Diameters for the assemble button's collar and soft radial-gradient halo (see makeStyles
// for how the collar/glow/button trio stay concentric).
const ASSEMBLE_COLLAR_SIZE = 76;
const ASSEMBLE_GLOW_SIZE = 72;
// The collar's visible stroke is a single arc across its top, stopping short of the true
// equator (90° either side of top) so its two ends land ABOVE the point where the collar
// disappears into the bar, rather than running down into — and visibly crossing — the bar's
// own top stroke. Smaller = the arc ends higher / stops sooner; nudge this if the gap
// between the two strokes looks too big or the arc still reaches the bar's line.
const ASSEMBLE_COLLAR_ARC_HALF_SPAN_DEG = 65;
const ASSEMBLE_COLLAR_ARC = (() => {
  const r = ASSEMBLE_COLLAR_SIZE / 2;
  const half = (ASSEMBLE_COLLAR_ARC_HALF_SPAN_DEG * Math.PI) / 180;
  const dx = r * Math.sin(half);
  const dy = r * Math.cos(half);
  const leftX = r - dx;
  const rightX = r + dx;
  const y = r - dy;
  return `M ${leftX} ${y} A ${r} ${r} 0 0 1 ${rightX} ${y}`;
})();
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
  // Text renders in the system font until this resolves, then re-renders once — no splash
  // gate, since this is the persistent hub screen and the flash is a single cold-start frame.
  useFonts({
    Lexend_400Regular,
    Lexend_600SemiBold,
    Lexend_700Bold,
    Lexend_800ExtraBold,
    Lexend_900Black,
  });
  // Landscape Android with edge-to-edge puts the notch/gesture bar on the LEFT and RIGHT,
  // not just the top (see settings.tsx for the same pattern) — this screen used to ignore
  // insets entirely, which is the most likely visual bug on a notched device.
  const insets = useSafeAreaInsets();
  const padL = Math.max(insets.left, 22);
  const padR = Math.max(insets.right, 18);
  const padTop = Math.max(insets.top, 12);
  const padBottom = Math.max(insets.bottom, 22);
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
      <View style={[s.topBar, { top: padTop, left: padL, right: padR }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          style={s.settingsButton}
          onPress={() => router.push("/settings" as Href)}
        >
          <Placeholder size={26} />
        </Pressable>

        <View style={s.topRightGroup}>
          <View style={s.currencyGroup}>
            <View style={s.badgeCircle}>
              <Placeholder size={26} />
            </View>
            <View style={s.currency}>
              <Text style={s.currencyText}>{profile?.coins ?? "–"}</Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Profile — level ${profile?.level ?? "unknown"}, ${levelPercent}% to next level`}
            style={s.levelGroup}
            onPress={() => router.push("/profile" as Href)}
          >
            <View style={s.badgeCircle}>
              <Placeholder size={26} />
              <Text style={s.levelNumber}>{profile?.level ?? "–"}</Text>
            </View>
            <View style={s.progress}>
              <View style={[s.progressFill, { width: `${levelPercent}%` }]} />
              <Text style={s.progressText}>{levelPercent}%</Text>
            </View>
          </Pressable>
        </View>
      </View>

      <Animated.View
        layout={BAR_LAYOUT}
        style={[
          s.bottomBarWrap,
          { bottom: padBottom },
          barOpen ? s.bottomBarWrapOpen : { left: padL },
        ]}
      >
        {!barOpen ? (
          <Animated.View entering={BAR_ITEM_ENTERING} exiting={BAR_ITEM_EXITING} layout={BAR_LAYOUT}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Expand menu"
              accessibilityState={{ expanded: false }}
              hitSlop={12}
              style={s.chevronButton}
              onPress={() => setBarOpen(true)}
            >
              <View style={s.chevronLeft}>
                <ChevronIcon size={26} up color="#595551" />
              </View>
            </Pressable>
          </Animated.View>
        ) : null}

        <Animated.View layout={BAR_LAYOUT} style={[s.bottomBar, !barOpen && s.bottomBarClosed]}>
          {barOpen ? (
            <Animated.View entering={BAR_ITEM_ENTERING} exiting={BAR_ITEM_EXITING} layout={BAR_LAYOUT}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Shop"
                style={s.barItem}
                onPress={() => router.push("/store" as Href)}
              >
                <Placeholder size={32} />
                <Text style={s.barLabel}>shop</Text>
              </Pressable>
            </Animated.View>
          ) : null}

          {barOpen ? (
            <Animated.View entering={BAR_ITEM_ENTERING} exiting={BAR_ITEM_EXITING} layout={BAR_LAYOUT}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Inventory"
                style={s.barItem}
                onPress={() => router.push("/inventory" as Href)}
              >
                <Placeholder size={32} />
                <Text style={s.barLabel}>inventory</Text>
              </Pressable>
            </Animated.View>
          ) : null}

          <Animated.View layout={BAR_LAYOUT} style={s.assembleWrap}>
            {/* Bar-coloured collar, sized bigger than the button and centred on the same
                point: it's what makes the pill's top edge read as curving UP around the
                button rather than the button just sitting on top of a flat edge. A plain
                View can only stroke its FULL edge, but the lower half of this circle sits
                inside the bar — visible only on top — so the stroke is a single SVG arc
                covering just that popped-out half, matching the bar's own hairline. */}
            <Svg width={ASSEMBLE_COLLAR_SIZE} height={ASSEMBLE_COLLAR_SIZE} style={s.assembleCollar} pointerEvents="none">
              <Circle
                cx={ASSEMBLE_COLLAR_SIZE / 2}
                cy={ASSEMBLE_COLLAR_SIZE / 2}
                r={ASSEMBLE_COLLAR_SIZE / 2}
                fill="#FBFAF3"
              />
              <Path
                d={ASSEMBLE_COLLAR_ARC}
                fill="none"
                stroke="#D7D1CE"
                strokeWidth={0.4}
              />
            </Svg>
            {/* A true radial gradient (react-native-svg), not stacked flat-opacity rings —
                rings have a visible step at every ring boundary; a gradient has none. */}
            <Svg width={ASSEMBLE_GLOW_SIZE} height={ASSEMBLE_GLOW_SIZE} style={s.assembleGlow} pointerEvents="none">
              <Defs>
                <RadialGradient id="assembleGlow" cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor="#D5CFD9" stopOpacity={1} />
                  <Stop offset="0.55" stopColor="#D5CFD9" stopOpacity={0.8} />
                  <Stop offset="1" stopColor="#D5CFD9" stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Circle
                cx={ASSEMBLE_GLOW_SIZE / 2}
                cy={ASSEMBLE_GLOW_SIZE / 2}
                r={ASSEMBLE_GLOW_SIZE / 2}
                fill="url(#assembleGlow)"
              />
            </Svg>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Assemble"
              style={s.assembleButton}
              onPress={() => router.push("/catalogue" as Href)}
            >
              <Placeholder size={38} />
            </Pressable>
            {barOpen ? <Text style={s.barLabel}>assemble</Text> : null}
          </Animated.View>

          {barOpen ? (
            <Animated.View entering={BAR_ITEM_ENTERING} exiting={BAR_ITEM_EXITING} layout={BAR_LAYOUT}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Visit friends"
                style={s.barItem}
                onPress={() => router.push("/profile" as Href)}
              >
                <Placeholder size={32} />
                <Text style={s.barLabel}>visit friends</Text>
              </Pressable>
            </Animated.View>
          ) : null}

          {barOpen ? (
            <Animated.View entering={BAR_ITEM_ENTERING} exiting={BAR_ITEM_EXITING} layout={BAR_LAYOUT}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Your profile"
                style={s.barItem}
                onPress={() => router.push("/profile" as Href)}
              >
                <Placeholder size={32} />
                <Text style={s.barLabel}>you</Text>
              </Pressable>
            </Animated.View>
          ) : null}
        </Animated.View>

        {barOpen ? (
          <Animated.View entering={BAR_ITEM_ENTERING} exiting={BAR_ITEM_EXITING} layout={BAR_LAYOUT}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Collapse menu"
              accessibilityState={{ expanded: true }}
              hitSlop={12}
              style={s.chevronButton}
              onPress={() => setBarOpen(false)}
            >
              <View style={s.chevronRight}>
                <ChevronIcon size={26} up color="#595551" />
              </View>
            </Pressable>
          </Animated.View>
        ) : null}
      </Animated.View>

      {editing ? <ColourPicker /> : null}

      {editing ? (
        <View style={[s.placeBar, blocked && s.placeBarBlocked]}>
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
  screen:{flex:1,backgroundColor:t.bg,overflow:'hidden'},stage:StyleSheet.absoluteFillObject,
  // Top bar: settings on the left, coins + level on the right — both edges padded by insets so
  // they clear a landscape notch/gesture bar on either side.
  topBar:{position:'absolute',zIndex:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},settingsButton:{width:42,height:42,alignItems:'center',justifyContent:'center',shadowColor:'#50464b',shadowOpacity:.17,shadowRadius:3.5,shadowOffset:{width:0,height:2}},topRightGroup:{flexDirection:'row',alignItems:'center',gap:18},levelGroup:{flexDirection:'row',alignItems:'center'},badgeCircle:{width:44,height:44,alignItems:'center',justifyContent:'center'},levelNumber:{position:'absolute',color:TEXT_COLOR,fontFamily:LEXEND.bold,fontSize:13},progress:{width:126,height:21,marginLeft:-6,borderRadius:12,backgroundColor:'#DFD7CA',overflow:'hidden',alignItems:'center',justifyContent:'center'},progressFill:{position:'absolute',left:0,top:0,bottom:0,backgroundColor:t.accent},progressText:{width:'100%',color:TEXT_COLOR,fontFamily:LEXEND.semibold,fontSize:11,textAlign:'center'},currencyGroup:{flexDirection:'row',alignItems:'center'},currency:{width:126,height:21,marginLeft:-5,borderRadius:12,backgroundColor:'#DFD7CA',alignItems:'center',justifyContent:'center'},currencyText:{color:TEXT_COLOR,fontFamily:LEXEND.bold,fontSize:12},
  // Bottom bar: the pill (background/border/shadow/rounded corners) hugs only its own content —
  // no left+right stretch — so justifyContent no longer needs to fight empty space; `gap` alone
  // sets the distance between icons. The chevron is a SIBLING of the pill, not a child of it, so
  // it always renders outside the border rather than sharing the pill's background.
  bottomBarWrap:{position:'absolute',zIndex:14,flexDirection:'row',alignItems:'center',gap:0},bottomBarWrapOpen:{alignSelf:'center'},
  bottomBar:{flexDirection:'row',alignItems:'center',height:70,paddingHorizontal:24,borderRadius:22,borderWidth:0.4,borderColor:'#D7D1CE',backgroundColor:'#FBFAF3',gap:30,shadowColor:'#D7D1CE',shadowOpacity:0.3,shadowRadius:5,shadowOffset:{width:0,height:2},elevation:2},
  bottomBarClosed:{height:62,paddingHorizontal:0,borderWidth:0,backgroundColor:'transparent',shadowOpacity:0,gap:0},
  chevronButton:{width:26,height:26,borderRadius:13,alignItems:'center',justifyContent:'center'},
  chevronLeft:{transform:[{rotate:'270deg'}]},chevronRight:{transform:[{rotate:'90deg'}]},barItem:{width:64,alignItems:'center',justifyContent:'center'},barLabel:{fontFamily:LEXEND.regular,fontSize:10.5,lineHeight:13,color:TEXT_COLOR,marginTop:4,textAlign:'center'},
  // Assemble is the one item that survives collapse, so it carries its own elevated chip
  // (ELEVATION.raised — "the primary action, and only the primary action") rather than
  // borrowing the bar's background, and pops above the row on a negative top margin.
  // The button is the ONE thing with a real (flex) position — its marginTop:-22 puts its
  // centre at y=4 relative to assembleWrap's top (marginTop + height/2 = -22 + 26). The
  // collar and the glow SVG are both absolutely positioned (so they can't disturb that flow)
  // and each one's `top` is solved for the SAME centre — top = 4 - ownRadius — so collar,
  // glow and button stay concentric no matter how their individual sizes change.
  assembleWrap:{alignItems:'center',justifyContent:'center'},
  assembleCollar:{position:'absolute',alignSelf:'center',top:4-ASSEMBLE_COLLAR_SIZE/2},
  assembleGlow:{position:'absolute',alignSelf:'center',top:4-ASSEMBLE_GLOW_SIZE/2},
  assembleButton:{width:52,height:52,borderRadius:26,marginTop:-22,alignItems:'center',justifyContent:'center',backgroundColor:'#D5CFD9'},
  placeBar:{position:'absolute',zIndex:16,bottom:78,alignSelf:'center',flexDirection:'row',alignItems:'center',gap:10,borderRadius:22,backgroundColor:t.surface,paddingLeft:18,paddingRight:6,paddingVertical:6,shadowColor:'#000',shadowOpacity:.18,shadowRadius:8},placeBarBlocked:{borderWidth:2,borderColor:t.danger},placeHint:{flexShrink:1,color:TEXT_COLOR,fontFamily:LEXEND.semibold},placeHintBlocked:{color:t.danger,fontSize:11},ghostRotate:{width:36,height:36,borderRadius:18,backgroundColor:t.surfaceRaised,alignItems:'center',justifyContent:'center'},cancelGlyph:{color:TEXT_COLOR,fontFamily:LEXEND.extrabold,fontSize:16},confirmDisabled:{opacity:.35},deleteButton:{width:36,height:36,borderRadius:18,backgroundColor:t.surfaceRaised,alignItems:'center',justifyContent:'center'},confirm:{width:36,height:36,borderRadius:18,backgroundColor:t.success,alignItems:'center',justifyContent:'center'},
  comingSoonTitle:{fontFamily:LEXEND.black,fontSize:22,color:TEXT_COLOR,textAlign:'center'},comingSoonBody:{marginTop:8,fontFamily:LEXEND.semibold,fontSize:14,color:TEXT_COLOR,textAlign:'center'},comingSoonButton:{marginTop:18,minWidth:120},
});
