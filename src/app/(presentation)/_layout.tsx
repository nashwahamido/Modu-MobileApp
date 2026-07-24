// The presentation layers: settings, profile, and later store / inventory. The root Stack presents this whole group modally (see app/_layout), so each screen floats OVER the current scene — the hub or the task — without unmounting it. Nothing behind a layer reloads.
import { Stack } from "expo-router";

export default function PresentationLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
