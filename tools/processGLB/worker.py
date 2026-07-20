# Headless GLB rewriter: rename -> unparent(keep transform) -> reorient(bake) -> export.
#   blender -b -P worker.py -- ops.json input.glb output.glb
import bpy, json, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
ops_path, in_glb, out_glb = argv
ops = json.load(open(ops_path, encoding="utf-8"))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=in_glb)

# renames (two-phase to dodge transient collisions)
objs = {o.name: o for o in bpy.data.objects}
missing = [old for old, new in ops["renames"] if old not in objs]
if missing:
    print("MISSING NODES:", missing[:10])
    sys.exit(3)
for i, (old, new) in enumerate(ops["renames"]):
    objs[old].name = "__T%d" % i
for i, (old, new) in enumerate(ops["renames"]):
    bpy.data.objects["__T%d" % i].name = new

# unparent keep transform (then drop leftover empties so the export is flat)
targets = [bpy.data.objects[n] for n in ops["unparent"] if n in bpy.data.objects]
mws = {o.name: o.matrix_world.copy() for o in targets}
for o in targets: o.parent = None
for o in targets: o.matrix_world = mws[o.name]
for o in [o for o in bpy.data.objects if o.type == "EMPTY"]:
    bpy.data.objects.remove(o)

# reorient: bake shaft(head sign) -> local +Y, keep world geometry fixed
#
# ops.json's shaft/sign letters come from inspect.mjs, which reads the *source* glTF file's
# raw accessor bytes directly (glTF's own Y-up local convention) -- no Blender involved.
# Blender's glTF importer, however, converts each mesh's vertex buffer into Blender's Z-up
# local convention as part of import (confirmed empirically: a node whose source-file local
# bbox is longest on local Z comes out of bpy.data with its longest dimension on local Y).
# That swap is: file +X -> blender +X, file +Y -> blender +Z, file +Z -> blender -Y.
# So a shaft/sign pair meant in file-local terms must be translated through that same swap
# before it's used as a Blender-local axis to bake against.
FILE_TO_BLENDER_AXIS = {
    "X": Vector((1, 0, 0)),
    "Y": Vector((0, 0, 1)),
    "Z": Vector((0, -1, 0)),
}
for r in ops["reorient"]:
    o = bpy.data.objects.get(r["node"])
    if o is None or o.type != "MESH":
        continue
    if o.data.users > 1:
        o.data = o.data.copy()
    head = FILE_TO_BLENDER_AXIS[r["shaft"]] * float(r["sign"])
    M = head.rotation_difference(Vector((0, 1, 0))).to_matrix().to_4x4()
    W = o.matrix_world.copy()
    o.data.transform(M)
    o.matrix_world = W @ M.inverted()

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=out_glb, export_format="GLB",
                          use_selection=True, export_yup=True, export_apply=False)
print("WROTE", out_glb)
