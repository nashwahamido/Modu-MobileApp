import { Pressable as RNPressable, type PressableProps } from "react-native";
import type { ComponentProps, Ref } from "react";

import { playSfx } from "@/src/game/audio/sfx";

type Props = ComponentProps<typeof RNPressable> & { ref?: Ref<React.ComponentRef<typeof RNPressable>> };

export function Pressable({ onPress, ...rest }: Props) {
  const handler: PressableProps["onPress"] = onPress
    ? (event) => {
        playSfx("click");
        onPress(event);
      }
    : undefined;
  return <RNPressable {...rest} onPress={handler} />;
}