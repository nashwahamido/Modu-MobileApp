import { useEffect } from "react";
import {
  ModelRenderer,
  useFilamentContext,
  useModel,
} from "react-native-filament";
import { useGameStore } from "@/src/adhd/core/store";

// A tiny standalone model: one horizontal, unlit, alpha-blended quad carrying a
// soft radial "blob" texture. Laid flat on the ground under the assembly, it
// reads as a contact shadow and seats the table in the scene.
const SHADOW_MODEL = require("@/src/adhd/assets/models/furniture-models/LACK/shadow.glb");

// The assembly floor (leg feet) sits at pose y≈0; drop the blob a hair below to
// avoid z-fighting with the feet. Raise/lower if the shadow sits off the floor.
const FLOOR_Y = -0.004;

/**
 * Soft blob shadow under the assembly. Positioned at the assembly floor and
 * offset by the table-top drop (worldShift) so it always sits beneath the
 * table, wherever the top was placed. It never rotates — it stays flat on the
 * ground like a real cast shadow.
 */
export function ShadowPlane() {
  const model = useModel(SHADOW_MODEL);
  const { transformManager } = useFilamentContext();
  const worldShift = useGameStore((s) => s.worldShift);

  useEffect(() => {
    if (model.state !== "loaded") return;
    transformManager.setEntityPosition(
      model.rootEntity,
      [worldShift[0], FLOOR_Y + worldShift[1], worldShift[2]],
      false,
    );
  }, [model, transformManager, worldShift]);

  if (model.state !== "loaded") return null;
  return <ModelRenderer model={model} />;
}