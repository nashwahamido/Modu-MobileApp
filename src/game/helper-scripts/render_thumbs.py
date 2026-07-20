# Blender headless thumbnail renderer for furniture parts.
#
# Invoked by render-thumbs-blender.mjs as:  blender -b -P render_thumbs.py
# (which sets no CLI args, so configuration comes from env vars).
#
#   FURNITURE   comma-separated furniture ids to render (default: EKET)
#   REPO_ROOT   repo root; defaults to two levels above this script's src dir
#   THUMB_SIZE  square render size in px (default 256)
#   THUMB_ENGINE  "EEVEE" (real materials, needs a GPU) or "WORKBENCH"
#                 (fast, CPU, matte studio shading). Default: EEVEE.
#
# For each furniture it imports <ID>.glb once and then, per mesh object:
#   * exports a single-object GLB to  assets/models/furnitures/<ID>/parts/<base>.glb
#   * renders a framed, transparent PNG to
#     assets/thumbnails/furnitures/<ID>/light/parts/<base>.png
# It also renders the whole furniture (<ID>.png) and one image per cluster
# (clusters/<cluster>.png). gen-thumbs.mjs then wires these into thumbs.gen.ts.
#
# Naming mirrors gen-thumbs.mjs' candidate bases: a structural mesh keeps its
# object name; a fastener "<head>__<a>&<b>" becomes "<head>_<a>" (first attached).

import bpy
import os
import sys
import math
from mathutils import Vector, Matrix

# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.environ.get(
    "REPO_ROOT", os.path.abspath(os.path.join(SCRIPT_DIR, "..", "..", ".."))
)
FURNITURES = [f.strip() for f in os.environ.get("FURNITURE", "EKET").split(",") if f.strip()]
SIZE = int(os.environ.get("THUMB_SIZE", "256"))
ENGINE = os.environ.get("THUMB_ENGINE", "EEVEE").strip().upper()
# Which passes to render: any of furniture,clusters,parts (default all).
STAGES = {s.strip() for s in os.environ.get("THUMB_STAGES", "furniture,clusters,parts").split(",") if s.strip()}
# Replace every material with a uniform matte gray so the thumbnail look never
# depends on the GLB's own material/texture color (the preferred neutral look).
NEUTRAL = os.environ.get("THUMB_NEUTRAL", "").strip() not in ("", "0", "false")
# Subset selection. By default gen-thumbs.mjs only references ONE representative
# object per group, so we render just those to avoid redundant duplicate parts.
# THUMB_ONLY (comma list) or THUMB_ONLY_FILE (newline list) name the exact object
# names to render; empty means render every mesh.
ONLY = {n.strip() for n in os.environ.get("THUMB_ONLY", "").split(",") if n.strip()}
_only_file = os.environ.get("THUMB_ONLY_FILE", "").strip()
if _only_file and os.path.exists(_only_file):
    with open(_only_file, "r", encoding="utf-8") as fh:
        ONLY |= {ln.strip() for ln in fh if ln.strip()}

# ISO view direction (from target toward camera). Matches the soft renderer.
VIEW_DIR = Vector((1.0, -1.0, 0.8)).normalized()
PADDING = 1.12  # extra room around the framed bounds

ASSETS = os.path.join(REPO_ROOT, "src", "assets")


def log(msg):
    print("[render_thumbs] " + msg, flush=True)


# --------------------------------------------------------------------------- #
# Scene setup
# --------------------------------------------------------------------------- #

def resolve_engine():
    ids = {e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items}
    if ENGINE == "WORKBENCH":
        return "BLENDER_WORKBENCH"
    # EEVEE: 4.2+ renamed the engine to EEVEE Next.
    if "BLENDER_EEVEE_NEXT" in ids:
        return "BLENDER_EEVEE_NEXT"
    return "BLENDER_EEVEE"


def setup_render():
    scene = bpy.context.scene
    engine = resolve_engine()
    scene.render.engine = engine
    scene.render.resolution_x = SIZE
    scene.render.resolution_y = SIZE
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.filter_size = 1.5

    if engine == "BLENDER_WORKBENCH":
        shading = scene.display.shading
        shading.light = "STUDIO"
        shading.color_type = "TEXTURE"  # show GLB textures/materials, fall back to base color
        shading.show_shadows = False
        shading.show_cavity = False
    else:
        # Soft, even key light + gentle world fill so matte surfaces read clearly.
        world = bpy.data.worlds.new("thumbWorld")
        world.use_nodes = True
        bg = world.node_tree.nodes.get("Background")
        if bg:
            bg.inputs[0].default_value = (1, 1, 1, 1)
            bg.inputs[1].default_value = 0.55
        scene.world = world

        sun_data = bpy.data.lights.new("thumbSun", "SUN")
        sun_data.energy = 3.0
        sun_data.angle = math.radians(15)  # softer shadow edges
        sun = bpy.data.objects.new("thumbSun", sun_data)
        scene.collection.objects.link(sun)
        # Light roughly from the camera's upper-left/front.
        light_dir = Vector((0.4, -0.7, 1.0)).normalized()
        sun.rotation_euler = direction_to_euler(-light_dir)

    return scene


def direction_to_euler(forward):
    # Build a rotation whose local -Z points along `forward` (Blender lamp/cam convention).
    z = (-forward).normalized()
    up = Vector((0, 0, 1))
    if abs(z.dot(up)) > 0.999:
        up = Vector((0, 1, 0))
    x = up.cross(z).normalized()
    y = z.cross(x).normalized()
    return Matrix((x, y, z)).transposed().to_euler()


def make_camera(scene):
    cam_data = bpy.data.cameras.new("thumbCam")
    cam_data.type = "ORTHO"
    cam = bpy.data.objects.new("thumbCam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    # Orient once: camera +Z along VIEW_DIR, so it looks along -VIEW_DIR at the target.
    z = VIEW_DIR
    up = Vector((0, 0, 1))
    x = up.cross(z).normalized()
    y = z.cross(x).normalized()
    cam.matrix_world = Matrix((
        (x.x, y.x, z.x, 0.0),
        (x.y, y.y, z.y, 0.0),
        (x.z, y.z, z.z, 0.0),
        (0.0, 0.0, 0.0, 1.0),
    ))
    return cam, (x, y, z)


# --------------------------------------------------------------------------- #
# Framing + rendering
# --------------------------------------------------------------------------- #

def world_corners(objs):
    corners = []
    for o in objs:
        for c in o.bound_box:
            corners.append(o.matrix_world @ Vector(c))
    return corners


def frame(cam, basis, objs):
    x_axis, y_axis, z_axis = basis
    corners = world_corners(objs)
    center = sum(corners, Vector((0, 0, 0))) / len(corners)

    minx = min((c - center).dot(x_axis) for c in corners)
    maxx = max((c - center).dot(x_axis) for c in corners)
    miny = min((c - center).dot(y_axis) for c in corners)
    maxy = max((c - center).dot(y_axis) for c in corners)
    minz = min((c - center).dot(z_axis) for c in corners)
    maxz = max((c - center).dot(z_axis) for c in corners)

    width = maxx - minx
    height = maxy - miny
    depth = maxz - minz
    extent = max(width, height, 1e-4) * PADDING

    dist = depth * 0.5 + extent * 2.0 + 1.0
    cam.location = center + z_axis * dist
    cam.data.ortho_scale = extent
    cam.data.clip_start = 0.01
    cam.data.clip_end = dist + depth + extent * 2.0 + 10.0


def render_to(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


_neutral_mat = None


def apply_neutral(meshes):
    # One shared matte-gray material on every mesh, so the thumbnail tone never
    # depends on the GLB's own material/texture color.
    global _neutral_mat
    if _neutral_mat is None:
        _neutral_mat = bpy.data.materials.new("thumbNeutral")
        _neutral_mat.use_nodes = True
        bsdf = _neutral_mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = (0.62, 0.62, 0.62, 1.0)
            bsdf.inputs["Roughness"].default_value = 0.7
            if "Specular IOR Level" in bsdf.inputs:
                bsdf.inputs["Specular IOR Level"].default_value = 0.2
    for o in meshes:
        o.data.materials.clear()
        o.data.materials.append(_neutral_mat)


def part_base(name):
    # We render one representative per group, so name the image "<cluster>_<group>"
    # — no instance index, no attached-part suffix. gen-thumbs.mjs matches this via
    # its `${cluster}_${group}` candidate base.
    cluster = name.split("_", 1)[0]
    rest = name.split("_", 1)[1] if "_" in name else name
    rest = rest.split("__", 1)[0]  # drop "__attached" for fasteners
    segs = rest.split("_")
    if len(segs) > 1 and segs[-1].isdigit():
        segs = segs[:-1]  # drop trailing instance index
    return cluster + "_" + "_".join(segs)


def cluster_of(name):
    return name.split("_")[0]


# --------------------------------------------------------------------------- #
# Main per-furniture pass
# --------------------------------------------------------------------------- #

def process(furn):
    glb = os.path.join(ASSETS, "models", "furnitures", furn, furn + ".glb")
    if not os.path.exists(glb):
        log("skip %s: missing %s" % (furn, glb))
        return

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = setup_render()
    cam, basis = make_camera(scene)

    log("importing %s" % glb)
    bpy.ops.import_scene.gltf(filepath=glb)

    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    log("%s: %d mesh objects" % (furn, len(meshes)))
    if NEUTRAL:
        apply_neutral(meshes)

    light = os.path.join(ASSETS, "thumbnails", "furnitures", furn, "light")
    parts_thumb = os.path.join(light, "parts")
    clusters_thumb = os.path.join(light, "clusters")

    def set_render_visible(visible_set):
        for o in meshes:
            o.hide_render = o not in visible_set

    # Whole furniture.
    if "furniture" in STAGES:
        set_render_visible(set(meshes))
        frame(cam, basis, meshes)
        render_to(os.path.join(light, furn + ".png"))
        log("rendered furniture %s.png" % furn)

    # Clusters.
    if "clusters" in STAGES:
        clusters = {}
        for o in meshes:
            clusters.setdefault(cluster_of(o.name), []).append(o)
        if len(clusters) > 1:
            for cid, objs in clusters.items():
                set_render_visible(set(objs))
                frame(cam, basis, objs)
                render_to(os.path.join(clusters_thumb, cid + ".png"))
            log("rendered %d clusters" % len(clusters))

    if "parts" not in STAGES:
        return

    # Per-part: isolate, frame, render. (No per-part GLB export — the render works
    # off the combined GLB above; gen-thumbs.mjs keys off the PNG basenames.)
    targets = [o for o in meshes if not ONLY or o.name in ONLY]
    for o in targets:
        base = part_base(o.name)
        set_render_visible({o})
        frame(cam, basis, [o])
        render_to(os.path.join(parts_thumb, base + ".png"))
    log("%s: rendered %d parts" % (furn, len(targets)))


def main():
    log("engine=%s size=%d furnitures=%s" % (ENGINE, SIZE, ",".join(FURNITURES)))
    log("repo=%s" % REPO_ROOT)
    for furn in FURNITURES:
        process(furn)
    log("done")


main()
