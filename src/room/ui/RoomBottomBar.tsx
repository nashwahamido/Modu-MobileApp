// The room hub's bottom navigation: shop / inventory / assemble / visit friends / you, plus
// the assemble button's collar/glow "pops out of the pill" treatment. Split out of
// RoomExperience.tsx so that src/app/(home)/room.tsx — a ROUTE file — never has to hold this
// much non-route UI; see the repo's "src/app/ contains routes only" rule.
import { useState } from 'react';
import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { StyleSheet, Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronIcon } from '../../components/Icons';
import { useStyles, useTheme } from "@/src/game/ui/theme";
import type { Theme } from "@/src/game/ui/theme";

// This bar's text is pinned to the mockup's exact ink colour and to Lexend, rather than the
// theme's t.text/system-font pair — a deliberate override for this redesign, not an
// oversight, so it does not shift with the light/dark/high-contrast theme.
const TEXT_COLOR = '#231F20';
const LEXEND = {
  regular: 'Lexend_400Regular',
  semibold: 'Lexend_600SemiBold',
  bold: 'Lexend_700Bold',
  extrabold: 'Lexend_800ExtraBold',
  black: 'Lexend_900Black',
} as const;

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

// A stand-in for icon art that hasn't been delivered yet (every bottom-bar glyph). Decorative
// only — the Pressable it sits in carries the accessibility label, so this is hidden from
// screen readers rather than announced as an unlabeled square.
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

export function RoomBottomBar() {
  const s = useStyles(makeStyles);
  // Landscape Android with edge-to-edge puts the notch/gesture bar on the LEFT and RIGHT, not
  // just the top (see settings.tsx for the same pattern) — mirrors RoomExperience's own inset
  // handling so the bar clears the same edges the rest of the HUD does.
  const insets = useSafeAreaInsets();
  const padL = Math.max(insets.left, 22);
  const padBottom = Math.max(insets.bottom, 22);
  const [barOpen, setBarOpen] = useState(true);

  return (
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
              point: it's makes the pill's top edge read as curving UP around the
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
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
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
  // rather than borrowing the bar's background, and pops above the row on a negative top margin.
  // The button is the ONE thing with a real (flex) position — its marginTop:-22 puts its
  // centre at y=4 relative to assembleWrap's top (marginTop + height/2 = -22 + 26). The
  // collar and the glow SVG are both absolutely positioned (so they can't disturb that flow)
  // and each one's `top` is solved for the SAME centre — top = 4 - ownRadius — so collar,
  // glow and button stay concentric no matter how their individual sizes change.
  assembleWrap:{alignItems:'center',justifyContent:'center'},
  assembleCollar:{position:'absolute',alignSelf:'center',top:4-ASSEMBLE_COLLAR_SIZE/2},
  assembleGlow:{position:'absolute',alignSelf:'center',top:4-ASSEMBLE_GLOW_SIZE/2},
  assembleButton:{width:52,height:52,borderRadius:26,marginTop:-22,alignItems:'center',justifyContent:'center',backgroundColor:'#D5CFD9'},
});
