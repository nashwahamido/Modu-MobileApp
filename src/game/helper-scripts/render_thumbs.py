# Blender thumbnail renderer — run headless via the launcher:
#   npm run render:thumbs:blender          (render-thumbs-blender.mjs resolves Blender)
# or directly:
#   blender -b -P src/game/helper-scripts/render_thumbs.py [-- --force]
#
# Renders every MISSING thumbnail under src/assets/thumbnails (pass --force to
# redo all): the furniture preview (<ID>.png), per-part thumbs from
# models/<ID>/parts/*.glb, per-cluster previews for multi-cluster furniture, and
# shared tool thumbs. The look is the neutral studio gray (materials overridden —
# the GLB beige reads muddy at 256px), transparent background, soft 3/4 ortho
# view, EEVEE. Written for Blender 4.2.
import json
import os
import struct
import sys

import bpy
from mathutils import Vector

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.normpath(os.path.join(SCRIPT_DIR, "..", ".."))
FURNITURE_MODELS = os.path.join(SRC, "assets", "models", "furnitures")
TOOL_MODELS = os.path.join(SRC, "assets", "models", "tools")
OUT = os.path.join(SRC, "assets", "thumbnails")

SIZE = 256
FORCE = "--force" in sys.argv
# camera offset direction in Blender coords (+Z up; glTF -Z becomes +Y):
# out front, a touch to the left, from above — the EKET/LACK thumbnail angle
VIEW_OFFSET = Vector((-1.25, -1.0, 0.85))
MARGIN = 1.26


def clusters_in_glb(path):
    """Distinct node-name prefixes (cluster ids) among mesh nodes of a GLB."""
    with open(path, "rb") as f:
        magic, _, _ = struct.unpack("<III", f.read(12))
        if magic != 0x46546C67:
            return []
        length, ctype = struct.unpack("<II", f.read(8))
        if ctype != 0x4E4F534A:
            return []
        data = json.loads(f.read(length))
    out = []
    for n in data.get("nodes", []):
        if "mesh" in n and n.get("name"):
            c = n["name"].split("_")[0]
            if c not in out:
                out.append(c)
    return out


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    scene.render.resolution_x = SIZE
    scene.render.resolution_y = SIZE
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    # Standard transform — Filmic/AgX gray down the flat studio look
    scene.view_settings.view_transform = "Standard"

    world = bpy.data.worlds.new("thumb-world")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (1.0, 1.0, 1.0, 1.0)
    bg.inputs[1].default_value = 0.32  # ambient fill
    scene.world = world


def neutral_material():
    mat = bpy.data.materials.new("thumb-gray")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.80, 0.80, 0.80, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.65
    bsdf.inputs["Metallic"].default_value = 0.0
    return mat


def add_lights():
    key = bpy.data.lights.new("key", type="SUN")
    key.energy = 2.4
    key.angle = 0.35  # soft-ish shadows
    key_obj = bpy.data.objects.new("key", key)
    bpy.context.scene.collection.objects.link(key_obj)
    key_obj.rotation_euler = (0.9, -0.25, -1.9)  # from the camera's upper left

    fill = bpy.data.lights.new("fill", type="SUN")
    fill.energy = 0.8
    fill.angle = 0.6
    fill_obj = bpy.data.objects.new("fill", fill)
    bpy.context.scene.collection.objects.link(fill_obj)
    fill_obj.rotation_euler = (1.1, 0.4, 1.1)  # opposite side, weaker


def frame_camera(objs):
    """Ortho camera down VIEW_OFFSET, framed on the objects' world bbox."""
    corners = []
    for obj in objs:
        for c in obj.bound_box:
            corners.append(obj.matrix_world @ Vector(c))
    if not corners:
        return None
    center = sum(corners, Vector()) / len(corners)

    direction = VIEW_OFFSET.normalized()
    cam_data = bpy.data.cameras.new("thumb-cam")
    cam_data.type = "ORTHO"
    cam = bpy.data.objects.new("thumb-cam", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    radius = max((c - center).length for c in corners)
    cam.location = center + direction * (radius * 3.0 + 0.5)
    cam.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()

    # projected extent on the camera's right/up axes decides the ortho width
    quat = direction.to_track_quat("Z", "Y")
    right = quat @ Vector((1, 0, 0))
    up = quat @ Vector((0, 1, 0))
    xs = [(c - center).dot(right) for c in corners]
    ys = [(c - center).dot(up) for c in corners]
    span = max(max(xs) - min(xs), max(ys) - min(ys), 0.001)
    cam_data.ortho_scale = span * MARGIN
    # keep the subject centered on the projected mid, not the bbox center
    mid = center + right * ((max(xs) + min(xs)) / 2) + up * ((max(ys) + min(ys)) / 2)
    cam.location = mid + direction * (radius * 3.0 + 0.5)
    bpy.context.scene.camera = cam
    return cam


def render_glb(glb_path, out_path, cluster=None):
    reset_scene()
    bpy.ops.import_scene.gltf(filepath=glb_path)

    mat = neutral_material()
    visible = []
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH":
            continue
        if cluster and not obj.name.split("_")[0] == cluster:
            bpy.data.objects.remove(obj, do_unlink=True)
            continue
        obj.data.materials.clear()
        obj.data.materials.append(mat)
        visible.append(obj)
    if not visible:
        print(f"skip {os.path.basename(glb_path)}: no meshes" + (f" in cluster {cluster}" in "" if False else ""))
        return False

    add_lights()
    if frame_camera(visible) is None:
        return False

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    bpy.context.scene.render.filepath = out_path
    bpy.ops.render.render(write_still=True)
    return True


def jobs():
    out = []
    if os.path.isdir(FURNITURE_MODELS):
        for fid in sorted(os.listdir(FURNITURE_MODELS)):
            fdir = os.path.join(FURNITURE_MODELS, fid)
            if not os.path.isdir(fdir):
                continue
            light = os.path.join(OUT, "furnitures", fid, "light")
            whole = os.path.join(fdir, f"{fid}.glb")
            if os.path.isfile(whole):
                out.append((whole, os.path.join(light, f"{fid}.png"), None))
                clusters = clusters_in_glb(whole)
                if len(clusters) > 1:
                    for c in clusters:
                        out.append((whole, os.path.join(light, "clusters", f"{c}.png"), c))
            parts = os.path.join(fdir, "parts")
            if os.path.isdir(parts):
                for f in sorted(os.listdir(parts)):
                    if f.endswith(".glb"):
                        out.append((
                            os.path.join(parts, f),
                            os.path.join(light, "parts", f[:-4] + ".png"),
                            None,
                        ))
    if os.path.isdir(TOOL_MODELS):
        for f in sorted(os.listdir(TOOL_MODELS)):
            if f.endswith(".glb"):
                out.append((
                    os.path.join(TOOL_MODELS, f),
                    os.path.join(OUT, "tools", "light", f[:-4] + ".png"),
                    None,
                ))
    return out


wrote = 0
for glb, png, cluster in jobs():
    if not FORCE and os.path.isfile(png):
        continue
    if render_glb(glb, png, cluster):
        wrote += 1
        print("thumb:", os.path.relpath(png, SRC))
print(f"done: wrote {wrote} thumbnail(s)")
