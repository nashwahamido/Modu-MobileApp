// React Native's Pressable, with the app's click.
//
// WHY A WRAPPER RATHER THAN 139 EDITED HANDLERS. The click first went into the shared button
// primitives — Button, IconButton, Fab, PanelRow, IconButtonBare — which felt like the one place
// that would catch everything. It is not: those account for 45 of the app's 184 pressable surfaces,
// and the other 139 are raw `<Pressable>` written inline on the screens. A quarter of the buttons
// clicked and three quarters did not, which reads as broken rather than as sparse.
//
// So the click lives at the primitive every one of them already uses. A screen swaps one import and
// every button on it is audible; a new screen gets it by importing from here.
//
// DRAGGING A PART IS SAFE FROM THIS, and not by luck: the parts tray and the cluster tray drag
// through GestureDetector, not Pressable (see PartsTray/ClusterTray), so a part being picked up
// never passes through this file. It keeps the pickup and drop sounds that are about the PART, which
// is what she asked for.
import { Pressable as RNPressable, type PressableProps } from "react-native";
import type { ComponentProps, Ref } from "react";

import { playSfx } from "@/src/game/audio/sfx";

type Props = ComponentProps<typeof RNPressable> & { ref?: Ref<React.ComponentRef<typeof RNPressable>> };

/**
 * Drop-in for react-native's Pressable.
 *
 * The click fires on PRESS, not on press-in: press-in fires when a finger lands even if it then
 * slides off and the press is abandoned, so the sound would say "that worked" for a tap that did
 * nothing. onPress only runs on a completed press, and a `disabled` Pressable never calls it — so a
 * refused tap stays silent, which is the honest answer.
 */
export function Pressable({ onPress, ...rest }: Props) {
  const handler: PressableProps["onPress"] = onPress
    ? (event) => {
        playSfx("click");
        onPress(event);
      }
    : undefined;
  return <RNPressable {...rest} onPress={handler} />;
}