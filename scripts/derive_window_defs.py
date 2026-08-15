# Derives the catalog data for the window options authored in print_room.blend, and (optionally)
# exports each one as a placement-ready GLB. Run INSIDE Blender:
#   - paste into the Scripting tab and press Run, or
#   - blender print_room.blend --background --python scripts/derive_window_defs.py
#
# Authoring contract this script reads (set up 2026-07-29, see src/room/core/roomShell.ts):
#   - each window option is a collection named window-<something> containing its mesh parts, all
#     parented to an ARROWS empty with the SAME name as the collection;
#   - the empty sits at the placement anchor: hole-centre on the wall's INNER face, with the model's
#     back plane at anchor_y - wall thickness (interior of the room toward Blender +Y);
#   - the empty carries integer custom properties hole_cols / hole_rows: the opening's footprint in
#     wall-grid cells (WALL_CELL_SIZE = 0.25 m per cell).
#
# Output: window_exports/window_defs.json next to the .blend — one entry per option with the fields
# the cloud catalog (placeable_items) and src/room/core/placeableItems.ts need. Size axes are in the
# GLB's (glTF) frame: x = width along the wall, y = height, z = depth out of the wall.
import json
import os

import bpy
from mathutils import Matrix, Vector

EXPORT_GLBS = True                 # set False to only (re)generate the JSON
WALL_CELL_SIZE = 0.25
MIN_LIP = 0.01                     # warn when the frame overlaps the hole edge less than this

out_dir = os.path.join(os.path.dirname(bpy.data.filepath), "window_exports")
os.makedirs(out_dir, exist_ok=True)

defs = []
for coll in bpy.data.collections:
    if not coll.name.startswith("window-"):
        continue
    anchor = bpy.data.objects.get(coll.name)
    if anchor is None or anchor.type != 'EMPTY':
        print(f"!! {coll.name}: no anchor empty of the same name — skipped")
        continue
    parts = [o for o in coll.objects if o.type == 'MESH']
    if not parts:
        print(f"!! {coll.name}: no mesh parts — skipped")
        continue

    cols = int(anchor["hole_cols"])
    rows = int(anchor["hole_rows"])
    hole_w, hole_h = cols * WALL_CELL_SIZE, rows * WALL_CELL_SIZE

    # Measure in the ANCHOR'S frame, not world axes: a group parked at a tilt in the scene would
    # otherwise report an inflated world-AABB — and the anchor frame is exactly what the export ships.
    inv = anchor.matrix_world.inverted()
    pts = [inv @ (o.matrix_world @ v.co) for o in parts for v in o.data.vertices]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    size_w, size_d, size_h = mx.x - mn.x, mx.y - mn.y, mx.z - mn.z

    lip_w = (size_w - hole_w) / 2
    lip_h = (size_h - hole_h) / 2
    for axis, lip in (("width", lip_w), ("height", lip_h)):
        if lip < MIN_LIP:
            print(f"!! {coll.name}: {axis} lip {lip:.3f} < {MIN_LIP} — frame may not cover the hole edge")

    defs.append({
        "itemId": coll.name,
        # glTF axes: x width, y height, z depth. Blender height is z, depth is y.
        "size": {"x": round(size_w, 4), "y": round(size_h, 4), "z": round(size_d, 4)},
        "hole": {"cols": cols, "rows": rows, "w": hole_w, "h": hole_h},
        # PlaceableItemDef shape: wall items use footprint.w for width and wallHeightCells for
        # height on the wall grid; depth is irrelevant on a wall.
        "def": {
            "itemId": coll.name,
            "footprint": {"w": cols, "d": 1},
            "wallHeightCells": rows,
            "allowedSurfaces": ["wall"],
        },
        # Anchor-relative extents, for sanity-checking the origin convention: back should be at
        # -wallThickness in y, and the model roughly centred in x/height. Already anchor-local.
        "anchorRelative": {
            "back": round(mn.y, 4),
            "front": round(mx.y, 4),
            "left": round(mn.x, 4),
            "right": round(mx.x, 4),
            "bottom": round(mn.z, 4),
            "top": round(mx.z, 4),
        },
    })

    if EXPORT_GLBS:
        # The GLB must have the anchor at the IDENTITY — origin AND unrotated: parts are parented,
        # so resetting the whole matrix carries a scene-tilted group back to its authored pose for
        # the export, and the file's node transforms ARE the placement-ready transforms.
        saved = anchor.matrix_world.copy()
        anchor.matrix_world = Matrix.Identity(4)
        bpy.context.view_layer.update()
        for o in bpy.context.view_layer.objects:
            o.select_set(False)
        anchor.select_set(True)
        for o in parts:
            o.select_set(True)
        bpy.context.view_layer.objects.active = anchor
        path = os.path.join(out_dir, f"{coll.name}.glb")
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True,
                                  export_yup=True, export_apply=True)
        anchor.matrix_world = saved
        bpy.context.view_layer.update()
        print(f"exported {path}")

json_path = os.path.join(out_dir, "window_defs.json")
with open(json_path, "w", encoding="utf-8") as fh:
    json.dump(defs, fh, indent=2)
print(f"wrote {json_path} ({len(defs)} windows)")
