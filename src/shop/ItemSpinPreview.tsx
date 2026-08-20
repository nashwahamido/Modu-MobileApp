// The item, turning slowly, in the purchase confirmation's preview frame.
//
// Its own <FilamentScene>, NOT the room's: a scene owns one engine and one view, and this popup is
// drawn over a room that stays mounted behind it. So the two never share state — this one is created
// when the popup opens and torn down when it closes.
//
// The spin is driven on the RENDER thread, not by React. A state update per frame would re-render the
// popup sixty times a second; instead the render callback multiplies a small yaw delta onto the
// entity's transform each frame, the same way the assembly scene carries a held cluster.
//
// The still picture is the FALLBACK, not a backdrop: it renders only when no model resolves. An item
// whose GLB is missing from storage would otherwise leave a frame that is indistinguishable from a
// broken one. Anything with a model shows the model alone — the view renders transparently, so the
// frame's own white is what surrounds it.
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import {
  Camera,
  DefaultLight,
  FilamentScene,
  FilamentView,
  ModelRenderer,
  RenderCallbackContext,
  useFilamentContext,
  useModel,
} from "react-native-filament";

import { CatalogThumb } from "@/src/components/CatalogThumb";
import { defaultVariation } from "@/src/data/catalog/assets";
import { useItemVariants, variantsOf } from "@/src/data/catalog/variantStore";
import { probeRemote } from "@/src/data/remoteAsset";
import {
  getRoomItemStoragePath,
  getRoomItemVariantUrl,
  useRoomCatalogStore,
} from "@/src/room/core/placeableItems";
import { useVariantModelSource } from "@/src/room/scene/variantModel";

// Radians per second. A full turn every ~14s — slow enough to read as presentation rather than motion
const SPIN_RATE = (2 * Math.PI) / 14;
// The model is normalised into a unit cube (2 units across), so the framing is the same whatever the piece
const CAMERA_POSITION: [number, number, number] = [0, 0.9, 3.4];
const CAMERA_TARGET: [number, number, number] = [0, 0, 0];
const FOCAL_LENGTH_MM = 32;
const SPINNER_COLOUR = "#8E8985";

/**
 * Probe an item's model URL ahead of time, so opening the popup does not spend a round trip
 * discovering whether the file exists. Cached at module scope by remoteAsset, so calling this for
 * every tile in a grid costs one HEAD per item per session and nothing thereafter — and the source
 * then resolves SYNCHRONOUSLY on the first render of the preview instead of a tick later.
 */
export function warmItemModel(itemId: string): void {
  const url = getRoomItemVariantUrl(itemId, defaultVariation(variantsOf(itemId)));
  if (url !== null) void probeRemote(url);
}

export function ItemSpinPreview({
  itemId,
  size,
  style,
}: {
  itemId: string;
  /** The frame's height, used to size the still picture underneath */
  size: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={style}>
      {/* The stage is a child component on purpose: Filament's hooks read a context this provides. */}
      <FilamentScene>
        <SpinStage itemId={itemId} size={size} />
      </FilamentScene>
    </View>
  );
}

function SpinStage({ itemId, size }: { itemId: string; size: number }) {
  const variants = useItemVariants(itemId);
  // SUBSCRIBED even though it is not read here: the URL below is resolved through a non-reactive getState() read of this same store, and the placeable catalog is fetched at startup. Without this, a popup that opened before those rows landed would never re-resolve.
  useRoomCatalogStore((r) => r.items);
  const variation = defaultVariation(variants);
  // The same source the room places, so the preview and the placed piece can never be different models. Null while the storage URL is unconfirmed, and for good if the item has no model there.
  const source = useVariantModelSource(itemId, variation);

  useEffect(() => {
    if (source !== null) return;
    // Loud on purpose: a silent empty frame is what sent us looking at the renderer when the real answer was a missing file
    console.warn(
      `[preview] no model for ${itemId} — storage path:`,
      getRoomItemStoragePath(itemId, variation) ?? "item is not in the placeable catalog",
    );
  }, [source, itemId, variation]);

  return source === null ? (
    <View style={styles.poster}>
      <CatalogThumb source="bought" itemId={itemId} size={size} />
    </View>
  ) : (
    <Stage source={source} />
  );
}


// Split from SpinStage so useModel is never handed a null source, and so a source change remounts rather than reloading in place
function Stage({ source }: { source: NonNullable<ReturnType<typeof useVariantModelSource>> }) {
  const { transformManager } = useFilamentContext();
  const model = useModel(source);
  const entity = model.state === "loaded" ? model.rootEntity : null;

  // Normalise once, so a wardrobe and a stool both fill the frame. Depends on model.STATE, not on `model`, which useModel rebuilds as a fresh object every render.
  useEffect(() => {
    if (model.state !== "loaded") return;
    transformManager.transformToUnitCube(model.rootEntity, model.boundingBox);
  }, [model, transformManager]);

  RenderCallbackContext.useRenderCallback(
    ({ timeSinceLastFrame }) => {
      "worklet";
      if (entity == null) return;
      // Multiplied onto the current transform, so each frame adds to the last and the unit-cube fit underneath is preserved
      transformManager.setEntityRotation(entity, SPIN_RATE * timeSinceLastFrame, [0, 1, 0], true);
    },
    [entity, transformManager],
  );

  return (
    <>
      {/* The GLB is fetched over the network, so there is a beat before anything can be drawn. A quiet spinner beats an empty frame — and it is NOT the still picture, which is reserved for "there is no model at all". */}
      {model.state === "loaded" ? null : (
        <View style={styles.poster}>
          <ActivityIndicator color={SPINNER_COLOUR} />
        </View>
      )}
      <FilamentView style={styles.view} enableTransparentRendering>
        <Camera
          cameraPosition={CAMERA_POSITION}
          cameraTarget={CAMERA_TARGET}
          focalLengthInMillimeters={FOCAL_LENGTH_MM}
        />
        <DefaultLight />
        <ModelRenderer model={model} />
      </FilamentView>
    </>
  );
}

// Both fill the frame ABSOLUTELY rather than with flex: the frame centres its children, and a centred
// flex child shrinks to its content on the cross axis — which for a view with no content is zero wide.
const styles = StyleSheet.create({
  poster: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  view: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
});
