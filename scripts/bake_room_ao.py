# Bakes the room shell's ambient occlusion into a single 1024 atlas on a second UV set. Run INSIDE Blender against the current shell .blend (print_room_v2.blend as of 2026-08-04) — it keys off the "model" collection, not a filename:
#   - paste into the Scripting tab and press Run, or
#   - blender <shell>.blend --background --python scripts/bake_room_ao.py
#
# WHY THIS EXISTS. The walls are alphaMode BLEND, forced there by scripts/set-shell-blend-modes.mjs so camera-facing culling has an alpha to write, and Filament builds its screen-space AO buffer out of the OPAQUE depth pass only. Measured on device 2026-08-03: cranking SSAO intensity to 4 darkened the floor heavily and moved the walls by nothing at all. So no run-time setting can ever darken a wall in this scene, and a baked map — a MATERIAL feature, which does not care about alphaMode — is the only route. See the note above RoomPostProcess in src/room/scene/RoomScene.tsx.
#
# Output: room_ao.png next to the .blend, also packed into it, plus an "AO" UV layer on every object that shares a baked material. Wiring it into the exported GLB as occlusionTexture is a separate step.
#
# FOUR TRAPS, all of which cost a bake to find:
#   1. Cycles bakes into whichever Image Texture node is ACTIVE in each material, and in this file that is the real base colour — wall.png, wooden-floor.png, "Generated image 1 (4).png". A bake run without the guard below writes the AO straight over the authored textures. This is the reason for the dedicated AO_BAKE_TARGET node.
#   2. bake_type='AO' ignores world.light_settings.distance in Blender 4.x — that is an EEVEE setting — so it traces at effectively infinite range. Inside a sealed box every point is ~90% occluded and the whole shell bakes near-black. The fix is to bake EMIT through an Ambient Occlusion SHADER node, which takes a real Distance.
#   3. Objects from other collections are parked inside the room (a sofa, cabinets, bar stools, the ibl_bake ceiling). Left ray-visible they print permanent furniture shadows into the wall and floor. They are hidden for the bake and restored after.
#   4. Materials are SHARED between a baked wall and its 84 WCell boxes, which are not baked. Every sharer therefore needs the AO layer or it samples an undefined UV on export. They are given one by MAPPING them onto their band panel's island (step 5), so a cell samples exactly the texels the panel it replaces would.
#   5. Removing the old room_ao image orphans every AO_BAKE_TARGET node that referenced it, leaving image=None, which exports as NO occlusionTexture while the bake still reports success. Step 4b re-points them. This one shipped: the 2026-08-03 build had the map in the .blend and in room_ao.png and on none of its 15 materials.
#
# WHY THE BAND IS BAKED RATHER THAN PINNED, changed 2026-08-04. Every WCell and every Shell_Band_* used to be pinned to a single "white" texel, so the whole window band rendered at one flat value while the wall around it carried a real gradient. Measured off the shipped GLB: the band sat at 210/255 against inner wall faces averaging 129-185, and that ~14% step with no gradient across it read on device as a lighter rectangle floating in the middle of the wall — the band footprint exactly, inset from the wall edges on all four sides. The pin also put 2688 vertices on ONE texel whose mip chain collapsed (mip1 103, mip3 28) because a black gutter sat a pixel away, so any minification would have turned the band near-black.
# The pin existed for a real reason: a WCell's SIDE faces became the window jamb the moment a cell was knocked out, and a jamb carrying baked-in darkness reads black in a fresh opening. Those side faces were deleted on 2026-08-04 — a cell is now just an inner and an outer skin — so that reason is gone and the band can carry honest occlusion like the rest of the wall.
import bpy
from mathutils import Vector

AO_UV = "AO"
IMG_NAME = "room_ao"
NODE_NAME = "AO_BAKE_TARGET"
TMP_MAT = "__AO_BAKE__"
SIZE = 1024
# Occlusion range in metres. The shell measures ~5.3 across, so this reaches far enough to darken a wall into its corner and along the floor junction without flattening into the sealed-box near-black of trap 2.
DISTANCE = 0.75
AO_SAMPLES = 32
BAKE_SAMPLES = 128
MARGIN = 8
# Gutter between islands, in UV units: ~10 px at 1024, comfortably clear of MARGIN so no island bleeds into its neighbour under mipmapping.
ISLAND_MARGIN = 0.01

model = bpy.data.collections["model"]

# Shell_Band_* IS a receiver: it is the solid form of the band, and its island is what the 84 WCell boxes of that wall are mapped onto in step 5. Baking the panel while the cells are mapped to it keeps the two forms identical, which is what makes the diced/undiced swap invisible — the failure the old exclusion comment worried about, solved by mapping rather than by excluding. Shell_Ceiling is excluded because it is pinned to alpha 0 and never drawn — but it stays ray-visible below, since it is what stops the bake seeing open sky overhead.
def is_receiver(o):
    return o.type == "MESH" and o.name.startswith("Shell_") and o.name != "Shell_Ceiling"


receivers = sorted([o for o in model.objects if is_receiver(o)], key=lambda o: o.name)
assert receivers, "no Shell_* receivers found — is the 'model' collection present?"


def room_bounds():
    pts = [o.matrix_world @ Vector(c) for o in model.objects for c in o.bound_box]
    return (Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))),
            Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts))))


def overlaps(o, mn, mx):
    p = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return not (max(q.x for q in p) < mn.x or min(q.x for q in p) > mx.x or
                max(q.y for q in p) < mn.y or min(q.y for q in p) > mx.y or
                max(q.z for q in p) < mn.z or min(q.z for q in p) > mx.z)


# ---- 1. unwrap ------------------------------------------------------------
bpy.ops.object.mode_set(mode="OBJECT")
bpy.ops.object.select_all(action="DESELECT")
for o in receivers:
    o.hide_viewport = False
    o.hide_set(False)
    # Additive only. UVMap carries the tiled material UVs the base colour depends on and must never be written to, and it must keep active_render — that is the set the renderer and the glTF exporter treat as default.
    uv = o.data.uv_layers.get(AO_UV) or o.data.uv_layers.new(name=AO_UV)
    o.data.uv_layers.active = uv
    o.data.uv_layers["UVMap"].active_render = True
    o.select_set(True)
bpy.context.view_layer.objects.active = receivers[0]

bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
# Multi-object edit: with all receivers selected, smart_project packs every object's islands into ONE shared 0-1 space, which is what makes a single atlas possible.
bpy.ops.uv.smart_project(angle_limit=1.15192, island_margin=ISLAND_MARGIN, area_weight=0.0,
                         correct_aspect=True, scale_to_bounds=False)
bpy.ops.object.mode_set(mode="OBJECT")
print(f"unwrapped {len(receivers)} receivers into a shared {SIZE} atlas")

# ---- 2. quiet everything that is not the shell (trap 3) -------------------
mn, mx = room_bounds()
hidden = []
for o in bpy.data.objects:
    if o.type != "MESH" or o.name in model.objects:
        continue
    if not o.hide_render and overlaps(o, mn, mx):
        o.hide_render = True
        hidden.append(o.name)
# The WCells must be ray-INVISIBLE for the bake. Each one is coplanar with the Shell_Band_* panel it stands in for, so leaving them visible would have the panel occluded by a box sitting in its own surface — a zero-distance hit on every ray, which bakes the entire band black. Hiding them is also what makes the panel's island the honest "solid wall" occlusion that step 5 then hands to the cells. The room stays sealed because the panel fills the hole they leave.
for o in model.objects:
    o.hide_render = o.name.startswith("WCell_")
    if o.hide_render:
        hidden.append(o.name)
print(f"hidden for the bake ({len(hidden)}): {len(hidden)} objects")

# ---- 3. bake (traps 1 and 2) ----------------------------------------------
old = bpy.data.images.get(IMG_NAME)
if old:
    bpy.data.images.remove(old)
# White-initialised, and use_clear stays off below: clearing writes BLACK, and black is fully-occluded, so every texel the bake fails to reach would print as a dark patch. White means a miss is simply "no darkening".
img = bpy.data.images.new(IMG_NAME, SIZE, SIZE, alpha=False, float_buffer=False)
img.generated_color = (1.0, 1.0, 1.0, 1.0)
img.colorspace_settings.name = "Non-Color"

tmp = bpy.data.materials.get(TMP_MAT) or bpy.data.materials.new(TMP_MAT)
tmp.use_nodes = True
nt = tmp.node_tree
nt.nodes.clear()
ao = nt.nodes.new("ShaderNodeAmbientOcclusion")
ao.samples, ao.only_local = AO_SAMPLES, False
ao.inputs["Distance"].default_value = DISTANCE
emit = nt.nodes.new("ShaderNodeEmission")
out = nt.nodes.new("ShaderNodeOutputMaterial")
nt.links.new(ao.outputs["AO"], emit.inputs["Color"])
nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
tex = nt.nodes.new("ShaderNodeTexImage")
tex.name, tex.image = NODE_NAME, img
uvn = nt.nodes.new("ShaderNodeUVMap")
uvn.uv_map = AO_UV
nt.links.new(uvn.outputs["UV"], tex.inputs["Vector"])
tex.select = True
nt.nodes.active = tex

# Swapping in a temporary material is safer than rewiring fourteen authored node trees and hoping every one restores; it also sidesteps trap 1 entirely, since the only active image node in play is ours.
original = {o.name: [m.name if m else None for m in o.data.materials] for o in receivers}
try:
    for o in receivers:
        for i in range(len(o.data.materials)):
            o.data.materials[i] = tmp
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.bake_type = "EMIT"
    scene.cycles.samples = BAKE_SAMPLES
    scene.render.bake.use_selected_to_active = False
    scene.render.bake.use_clear = False
    scene.render.bake.margin = MARGIN
    bpy.ops.object.select_all(action="DESELECT")
    for o in receivers:
        o.select_set(True)
    bpy.context.view_layer.objects.active = receivers[0]
    print(f"baking EMIT through an AO node, distance {DISTANCE} m ...")
    bpy.ops.object.bake(type="EMIT")
finally:
    # Restore in a finally: a failed bake must never strand the shell wearing the bake material.
    for o in receivers:
        for i, name in enumerate(original[o.name]):
            o.data.materials[i] = bpy.data.materials[name] if name else None
    for name in hidden:
        obj = bpy.data.objects.get(name)
        if obj:
            obj.hide_render = False
    if tmp.users == 0:
        bpy.data.materials.remove(tmp)

# ---- 4. persist -----------------------------------------------------------
dest = bpy.path.abspath("//" + IMG_NAME + ".png")
img.filepath_raw, img.file_format = dest, "PNG"
img.save()
img.source, img.filepath = "FILE", dest
img.colorspace_settings.name = "Non-Color"
img.reload()
# Packed AS WELL as written to disk: the file is the re-exportable source, the pack is what stops a moved or deleted PNG silently emptying the material elsewhere.
img.pack()
print(f"wrote {dest}")

# ---- 4b. re-point the materials at the image we just made (trap 5) --------
# Step 3 REMOVES the previous room_ao datablock, and removing an image leaves every Image Texture node that referenced it holding None — silently. The authored materials wire AO_BAKE_TARGET -> Separate Color -> "glTF Material Output".Occlusion, so a node with no image exports a material with NO occlusionTexture at all, and nothing anywhere errors: the bake succeeds, the .png is written, the GLB just quietly has no AO.
# That is exactly what shipped between 2026-08-03 and 08-04 — the map was in the .blend and in room_ao.png, and absent from all 15 materials of the built GLB. Re-pointing here is what makes the bake actually reach the export.
repointed = []
for mat in {m for o in model.objects if o.type == "MESH" for m in o.data.materials if m}:
    if not mat.use_nodes:
        continue
    node = mat.node_tree.nodes.get(NODE_NAME)
    if node is not None and node.image != img:
        node.image = img
        repointed.append(mat.name)
print(f"re-pointed {len(repointed)} materials at the new {IMG_NAME}: {sorted(repointed)}")

# ---- 5. map the WCells onto their band panel's island (trap 4) ------------
# A cell is a 0.25 m tile of the panel it replaces, so its AO UVs are the panel's UVs at the cell's own position: an AFFINE map, solved per panel face from that face's corners. Doing it geometrically rather than by unwrapping the cells is what guarantees the diced and undiced forms sample IDENTICAL texels — unwrap them separately and the swap would show as a seam the moment a window is placed.
# Faces are matched between cell and panel by world normal AND by lying in the same plane, so a cell's inner skin can only ever take the panel's inner skin. That is axis-agnostic, which matters because the x-walls and z-walls span different Blender axes.
def quad_frame(obj, face):
    """Origin, edge vectors and matching UV vectors for one planar quad, in world space."""
    mesh = obj.data
    uv = mesh.uv_layers[AO_UV].data
    loops = list(face.loop_indices)
    co = [obj.matrix_world @ mesh.vertices[mesh.loops[li].vertex_index].co for li in loops]
    uvs = [Vector(uv[li].uv) for li in loops]
    return co[0], co[1] - co[0], co[-1] - co[0], uvs[0], uvs[1] - uvs[0], uvs[-1] - uvs[0]


def world_normal(obj, face):
    return (obj.matrix_world.to_3x3() @ face.normal).normalized()


panels = {o.name[len("Shell_Band_"):]: o for o in model.objects if o.name.startswith("Shell_Band_")}
assert panels, "no Shell_Band_* panels found — nothing to map the WCells onto"

mapped = 0
for o in sorted(model.objects, key=lambda o: o.name):
    if o.type != "MESH" or not o.name.startswith("WCell_"):
        continue
    wall = o.name.split("_")[1]
    panel = panels.get(wall)
    assert panel, f"{o.name} has no Shell_Band_{wall} to map onto"
    frames = [(world_normal(panel, f), quad_frame(panel, f)) for f in panel.data.polygons]
    uv = o.data.uv_layers.get(AO_UV) or o.data.uv_layers.new(name=AO_UV)
    for face in o.data.polygons:
        n = world_normal(o, face)
        origin_c = o.matrix_world @ o.data.vertices[o.data.loops[face.loop_indices[0]].vertex_index].co
        match = None
        for pn, fr in frames:
            # Same facing, and coplanar: the offset from the panel face to the cell face must have no component along the normal.
            if pn.dot(n) > 0.99 and abs((origin_c - fr[0]).dot(pn)) < 1e-3:
                match = fr
                break
        assert match, f"{o.name}: no coplanar panel face matches a face with normal {n[:]}"
        p0, e1, e2, uv0, du1, du2 = match
        for li in face.loop_indices:
            p = o.matrix_world @ o.data.vertices[o.data.loops[li].vertex_index].co
            a = (p - p0).dot(e1) / e1.length_squared
            b = (p - p0).dot(e2) / e2.length_squared
            uv.data[li].uv = uv0 + du1 * a + du2 * b
    o.data.uv_layers["UVMap"].active_render = True
    mapped += 1
print(f"mapped {mapped} WCells onto their band panel islands")

# Anything else sharing a baked material would export sampling an undefined UV, so it is still worth asserting — there is nothing in that set today, which is the point.
receiver_mats = {m.name for o in receivers for m in o.data.materials if m}
missing = [o.name for o in model.objects
           if o.type == "MESH" and any(m and m.name in receiver_mats for m in o.data.materials)
           and AO_UV not in o.data.uv_layers]
assert not missing, f"objects on a baked material still lack the {AO_UV} layer: {missing}"
print("done — save the .blend to keep the bake")
