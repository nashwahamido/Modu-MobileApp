# Re-derives each window option's anchor and hole footprint after its model has been edited.
# Run INSIDE Blender (Scripting tab), any time a window-* group changes size or shape; then run
# derive_window_defs.py to regenerate the JSON/GLBs. Complements the authoring contract described
# in scripts/derive_window_defs.py and src/room/core/roomShell.ts.
#
# What it does, per window-* collection:
#   - repositions the parent empty (WITHOUT moving the meshes) so that, in the empty's own frame,
#     the model is centred in width and height with its back plane WALL_THICK behind the origin —
#     the placement-anchor convention. Working in the empty's local frame makes this correct no
#     matter where the group is parked or how it is rotated in the scene.
#   - sets hole_cols / hole_rows to the NEAREST quarter-metre per axis. Nearest, not floor: a hole
#     smaller than the glazing would show wall behind the glass, which looks broken, while a hole
#     slightly larger than the frame just shows a few millimetres of plaster reveal, which looks
#     like architecture. Hand-tuned hole props are OVERWRITTEN by this script — re-apply after.
import bpy
from mathutils import Vector, Matrix

WALL_THICK = 0.12
CELL = 0.25   # WALL_CELL_SIZE in roomShell.ts

for coll in bpy.data.collections:
    if not coll.name.startswith("window-"):
        continue
    empty = bpy.data.objects.get(coll.name)
    parts = [o for o in coll.objects if o.type == 'MESH']
    if empty is None or empty.type != 'EMPTY' or not parts:
        print(f"!! {coll.name}: missing anchor empty or mesh parts — skipped")
        continue

    inv = empty.matrix_world.inverted()
    pts = [inv @ (o.matrix_world @ v.co) for o in parts for v in o.data.vertices]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))

    offset = Vector(((mn.x + mx.x) / 2, mn.y + WALL_THICK, (mn.z + mx.z) / 2))
    if offset.length > 1e-6:
        saved = {o: o.matrix_world.copy() for o in parts}
        empty.matrix_world = empty.matrix_world @ Matrix.Translation(offset)
        bpy.context.view_layer.update()
        for o, mw in saved.items():
            o.matrix_world = mw
        bpy.context.view_layer.update()

    w, h = mx.x - mn.x, mx.z - mn.z
    cols = max(1, round(w / CELL))
    rows = max(1, round(h / CELL))
    empty["hole_cols"], empty["hole_rows"] = cols, rows
    dw, dh = (w - cols * CELL) / 2, (h - rows * CELL) / 2
    def fit(d):
        return f"{'lip' if d >= 0 else 'reveal'} {abs(round(d * 1000))}mm"
    print(f"{coll.name}: {w:.3f} x {h:.3f} -> hole {cols}x{rows} ({fit(dw)} / {fit(dh)})")

print("done — rerun scripts/derive_window_defs.py to refresh JSON and GLB exports")
