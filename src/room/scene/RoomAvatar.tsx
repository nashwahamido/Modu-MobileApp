import { useEffect } from "react";
import { useFilamentContext, useModel } from "react-native-filament";

import { floorCellToRoom } from "../core/grid";
import { SCENE_SCALE, roomToScene } from "../core/roomShell";

// The supplied cat is authored at roughly one metre tall, with its feet at y=0.
// Keep these measured GLB bounds beside the placement code so replacing the asset
// cannot silently change the scale or make it sink into the floor.
const CAT_MODEL = require("../../assets/models/avatars/cute-cat.glb");
const CAT_SIZE = {
  x: 0.802734,
  y: 0.998047,
  z: 0.69336,
} as const;
const CAT_MAX_EXTENT = Math.max(CAT_SIZE.x, CAT_SIZE.y, CAT_SIZE.z);

// Static first pass: prove that the skinned GLB loads, scales and stands in the
// room correctly before animation and navigation add their own moving parts.
export function RoomAvatar() {
  const model = useModel(CAT_MODEL);
  const { transformManager } = useFilamentContext();

  useEffect(() => {
    if (model.state !== "loaded") return;

    // Match the room shell's transformToUnitCube normalisation, then restore the
    // cat's metre-authored size in the shell's normalised scene space.
    transformManager.transformToUnitCube(model.rootEntity, model.boundingBox);
    const unit = transformManager.getTransform(model.rootEntity);
    const unitScale = 2 / CAT_MAX_EXTENT;

    // Two central floor cells make a stable, deterministic prototype position.
    const centre = roomToScene(
      floorCellToRoom({ x: 8, y: 8 }, { w: 2, d: 2 }),
    );
    const transform = unit
      .scaling([
        SCENE_SCALE / unitScale,
        SCENE_SCALE / unitScale,
        SCENE_SCALE / unitScale,
      ])
      .translate([
        centre.x,
        centre.y + (CAT_SIZE.y * SCENE_SCALE) / 2,
        centre.z,
      ]);

    transformManager.setTransform(model.rootEntity, transform);
  }, [model, transformManager]);

  return null;
}
