// The room hub's top-right cluster: the coins pill and the level/xp pill. Split out of
// RoomExperience.tsx for the same reason as RoomBottomBar.tsx — keeps that file down to just
// the screen's own scaffolding (scene, settings, placement bar, dialogs) rather than every
// HUD piece.
import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { StyleSheet, Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStyles, useTheme } from "@/src/game/ui/theme";
import type { Theme } from "@/src/game/ui/theme";
import { levelProgressFraction } from '../../data/levels';
import { useProfileHud } from '../../hooks/useProfileHud';

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

// A stand-in for icon art that hasn't been delivered yet (the coin and level-star glyphs).
// Decorative only — the Pressable/label around it carries the accessibility label, so this
// is hidden from screen readers rather than announced as an unlabeled square.
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

export function RoomTopStats() {
  const s = useStyles(makeStyles);
  // Landscape Android with edge-to-edge puts the notch/gesture bar on the LEFT and RIGHT, not
  // just the top (see settings.tsx for the same pattern) — mirrors RoomExperience's own inset
  // handling so this cluster clears the same edges the rest of the HUD does.
  const insets = useSafeAreaInsets();
  const padTop = Math.max(insets.top, 12);
  const padR = Math.max(insets.right, 18);
  // Null until the first fetch lands — render an em dash rather than a placeholder number that would read as real.
  const profile = useProfileHud();
  // The bar reads full at the top of the curve, where xpForNextLevel is null and there is nothing left to climb to.
  const levelPercent = profile
    ? Math.round(levelProgressFraction({ xpIntoLevel: profile.xpIntoLevel, xpForNextLevel: profile.xpForNextLevel }) * 100)
    : 0;

  return (
    <View style={[s.topRightGroup, { top: padTop, right: padR }]}>
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
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  topRightGroup:{position:'absolute',zIndex:12,flexDirection:'row',alignItems:'center',gap:18},
  levelGroup:{flexDirection:'row',alignItems:'center'},badgeCircle:{width:44,height:44,alignItems:'center',justifyContent:'center'},levelNumber:{position:'absolute',color:TEXT_COLOR,fontFamily:LEXEND.bold,fontSize:13},progress:{width:126,height:21,marginLeft:-6,borderRadius:12,backgroundColor:'#DFD7CA',overflow:'hidden',alignItems:'center',justifyContent:'center'},progressFill:{position:'absolute',left:0,top:0,bottom:0,backgroundColor:t.accent},progressText:{width:'100%',color:TEXT_COLOR,fontFamily:LEXEND.semibold,fontSize:11,textAlign:'center'},currencyGroup:{flexDirection:'row',alignItems:'center'},currency:{width:126,height:21,marginLeft:-5,borderRadius:12,backgroundColor:'#DFD7CA',alignItems:'center',justifyContent:'center'},currencyText:{color:TEXT_COLOR,fontFamily:LEXEND.bold,fontSize:12},
});
