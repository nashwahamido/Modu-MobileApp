// The presentation layers: settings and profile. The root Stack presents this whole group modally (see app/_layout), so each screen floats OVER the current scene — the hub or the task — without unmounting it. Nothing behind a layer reloads. The shop and the inventory used to live here too; both are now popups inside the room (src/shop/ShopOverlay, src/inventory/InventoryOverlay), which keeps the 3D scene mounted behind them.
import { Stack } from "expo-router";

export default function PresentationLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
