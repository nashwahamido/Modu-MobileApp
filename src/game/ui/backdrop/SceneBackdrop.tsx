import type { ReactNode } from "react";
import { ImageBackground, type StyleProp, type ViewStyle } from "react-native";

type Props = {
  source: number | undefined;
  fit?: "cover" | "contain";
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
