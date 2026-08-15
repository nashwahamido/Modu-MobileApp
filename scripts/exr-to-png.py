# Convert a linear EXR texture to an 8-bit PNG, without letting colour management touch it. Run INSIDE Blender:
#   blender --background --factory-startup --python scripts/exr-to-png.py -- <in.exr> <out.png> [grey]
#
# WHY BLENDER. toktx reads .jpg/.png/.pam/.ppm/.pgm and nothing else, sharp has no EXR decoder, and neither OpenEXR, OpenCV, imageio nor numpy is installed here. Blender's image API reads EXR natively and is already how this project's other asset scripts run (bake_room_ao.py, build_room_ibl.py), so it costs no new dependency.
#
# THE TRAP THIS SCRIPT EXISTS TO AVOID, measured 2026-08-08: a plain load-and-save runs the image through the scene's view transform, which is AgX by default in Blender 4.2. On a tangent-space normal map that reads out as R/G means of 170/174 and a B mean of 198, where the correct values are 127.5/127.5/254.7 — the map is silently regraded, the lighting comes out wrong on device, and nothing anywhere reports an error. Setting colorspace to Non-Color is what actually bypasses it; the view_transform and look are pinned as well so a non-default startup file cannot reintroduce it.
#
# The third argument writes a single-channel greyscale PNG, which is what a roughness map wants — see scripts/build-surface-item.mjs for how that channel is then placed for glTF.
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:]
if len(argv) < 2:
    raise SystemExit("usage: blender --background --python scripts/exr-to-png.py -- <in.exr> <out.png> [grey]")

src, dst = argv[0], argv[1]
grey = len(argv) > 2 and argv[2] == "grey"

image = bpy.data.images.load(src)
# Non-Color is the load-bearing line: it marks the data as not-a-colour, which is what keeps the view transform off it.
image.colorspace_settings.name = "Non-Color"

scene = bpy.context.scene
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
scene.view_settings.exposure = 0.0
scene.view_settings.gamma = 1.0
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_depth = "8"
scene.render.image_settings.color_mode = "BW" if grey else "RGB"
scene.render.image_settings.compression = 15

image.save_render(filepath=dst, scene=scene)
print(f"-- {image.size[0]}x{image.size[1]} {'grey' if grey else 'rgb'} -> {dst}")
