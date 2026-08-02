// One purchasable tile in the shop popup: price badge, picture well, name
import { StyleSheet, Image, Pressable, Text, View } from "react-native";

import { COIN_ICON, levelIcon } from "@/src/components/iconAssets";
import { useStyles } from "@/src/game/ui/theme";
import type { Theme } from "@/src/game/ui/theme";
import { IconPlaceholder, ImagePlaceholder } from "./ShopPlaceholders";

const TEXT_COLOR = "#231F20";
// Well height as a fraction of the tile's width; the grid owns the width
const WELL_ASPECT = 0.79;
// How far the price pill is tucked under the coin, so it reads as flowing out of it
const PRICE_TUCK = 26;

export function ShopItemTile({
  name,
  price,
  width,
  owned,
  lockLevel,
  onPress,
  disabled,
}: {
  name: string;
  price: number;
  /** Column width handed down by the grid */
  width: number;
  owned?: boolean;
  /** Required level, when the player is below it. Undefined = unlocked */
  lockLevel?: number;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const s = useStyles(makeStyles);
  const locked = lockLevel !== undefined;
  const lockStar = lockLevel !== undefined ? levelIcon(lockLevel) : null;
  const wellHeight = Math.round(width * WELL_ASPECT);
  return (
    <Pressable
      accessibilityRole="button"
      // One control, so its label carries everything the visuals say
      accessibilityLabel={
        `${name}, ${price} coins` +
        (owned ? ", owned" : "") +
        (locked ? `, locked until level ${lockLevel}` : "")
      }
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [s.tile, { width }, pressed && !disabled && s.tilePressed]}
      onPress={onPress}
      disabled={disabled}
    >
      <View style={s.wellWrap}>
        <ImagePlaceholder width={width} height={wellHeight} style={s.well} />

        {/* A tint, not a blur — RN has no blur without a native module */}
        {locked ? <View style={s.veil} pointerEvents="none" /> : null}
        {locked ? (
          <View style={s.lockBadge} pointerEvents="none">
            {/* The star art has its number baked in; the fallback draws a real one */}
            {lockStar ? (
              <Image source={lockStar} style={s.lockStar} resizeMode="contain" />
            ) : (
              <>
                <IconPlaceholder size={54} />
                <Text style={s.lockLevel}>{lockLevel}</Text>
              </>
            )}
          </View>
        ) : null}

        {/* Last, so the price stays legible over the veil on a locked tile */}
        <View style={s.priceBadge}>
          <Image source={COIN_ICON} style={s.priceIcon} resizeMode="contain" />
          <View style={s.pricePill}>
            <Text style={s.priceText}>{price}</Text>
          </View>
        </View>
      </View>

      <Text style={s.name} numberOfLines={1}>
        {name}
      </Text>
      {owned ? <Text style={s.owned}>owned</Text> : null}
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    tile: {
      marginBottom: 18,
    },
    tilePressed: {
      opacity: 0.7,
    },
    // Top padding gives the price badge room to overhang without clipping
    wellWrap: {
      paddingTop: 14,
    },
    well: {
      borderRadius: 6,
      backgroundColor: "#FFFFFF",
    },
    veil: {
      ...StyleSheet.absoluteFillObject,
      top: 14,
      borderRadius: 6,
      backgroundColor: "#DFD7CA",
      opacity: 0.72,
    },
    lockBadge: {
      ...StyleSheet.absoluteFillObject,
      top: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    lockLevel: {
      position: "absolute",
      fontFamily: "Lexend_700Bold",
      fontSize: 18,
      color: TEXT_COLOR,
    },
    priceBadge: {
      position: "absolute",
      left: -6,
      top: 0,
      flexDirection: "row",
      alignItems: "center",
    },
    // zIndex keeps the coin on top of the pill tucked under it
    priceIcon: {
      zIndex: 2,
      width: 34,
      height: 34,
    },
    lockStar: {
      width: 76,
      height: 76,
    },
    // paddingLeft = tuck + paddingRight, so the number centres in the visible part
    pricePill: {
      marginLeft: -PRICE_TUCK,
      minWidth: 54,
      height: 19,
      borderRadius: 10,
      paddingLeft: PRICE_TUCK + 8,
      paddingRight: 8,
      backgroundColor: "#FBFAF3",
      borderWidth: 0.6,
      borderColor: "#D7D1CE",
      alignItems: "center",
      justifyContent: "center",
    },
    priceText: {
      fontFamily: "Lexend_700Bold",
      fontSize: 11,
      color: TEXT_COLOR,
    },
    name: {
      marginTop: 8,
      fontFamily: "Lexend_400Regular",
      fontSize: 14,
      color: TEXT_COLOR,
    },
    owned: {
      marginTop: 2,
      fontFamily: "Lexend_400Regular",
      fontSize: 11,
      color: t.textDim,
    },
  });
