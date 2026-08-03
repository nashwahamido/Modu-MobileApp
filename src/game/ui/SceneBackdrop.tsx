// The one backdrop renderer for every scene screen (play, tutorial, room) — an ImageBackground as the screen root, so the artwork always frames identically.
// A separate <Image style={absoluteFill}> scaled the same file differently (that was the tutorial's zoomed-in backdrop), so all screens must go through this component.
// The source is resolved by the caller's own backdrop table (game/ui/backdrops for the build screens, room/ui/roomBackdrops for the room) — this component only renders it, so the two sets can diverge without a shared id type.
// "clear": the resolver returns undefined — no image, the caller's root background shows through.
import type { ReactNode } from "react";
import { ImageBackground, type StyleProp, type ViewStyle } from "react-native";

type Props = {
  /** The require()'d image, or undefined for no artwork at all. */
  source: number | undefined;
  /** "cover" (default) fills the screen and crops the overflow; "contain" fits the whole image and shows the root style's background at the edges. */
  fit?: "cover" | "contain";
  // The screen's root style (flex:1 + its own background colour for "clear").
  style: StyleProp<ViewStyle>;
  children?: ReactNode;
};

export function SceneBackdrop({ source, fit = "cover", style, children }: Props) {
  return (
    <ImageBackground source={source} resizeMode={fit} style={style}>
      {children}
    </ImageBackground>
  );
}
