# The whole Blender half of a room-shell re-export, as ONE command: normalise the material names, bake the AO, save the .blend, write the raw GLB. Run INSIDE Blender against the current shell .blend:
#   - blender <shell>.blend --background --python <repo>/scripts/export_room.py -- [out.glb [repo]], or
#   - in the Scripting tab, Text > Open this file FROM DISK (not pasted — it locates the checkout from its own path) and press Run
# Then finish on the JS side with `npm run build:room`, which compresses, sets blend modes and AO strength, declares the surface-item map slots, and verifies.
#
# WHY THIS EXISTS. The bake lives in the .blend — an "AO" UV layer per object, a packed room_ao image, an AO_BAKE_TARGET node per material — and the exporter simply carries out whatever is there. So a re-export never "overwrites" the AO: it faithfully exports whatever the file was last SAVED with, and if the bake was only ever in an unsaved session, or a Ctrl+Z took it (script edits are invisible to Blender's undo stack), the export quietly ships the state before it. That is exactly what happened on 2026-08-10: the ceiling was raised and re-exported out of print_room_v2.blend, and the shell came back with all 336 WCells and all four Shell_Band_* panels pinned to one white texel — the flat-band regression bake_room_ao.py was rewritten to kill on 2026-08-04, resurrected by nothing more than a file that did not hold the fix. Nothing failed; the pipeline ran clean and the verifier passed.
# Binding the bake to the export is the fix, because the two can then never disagree. It also happens to be REQUIRED rather than merely tidy: the bake is geometry-dependent, so any edit worth re-exporting for — moving the ceiling, thickening a wall — has already invalidated the occlusion in the file. There is no such thing as a correct export that reuses an older bake.
#
# The bake costs a minute or two. Pay it every time. `scripts/set-ao-strength.mjs` remains the way to tune AO INTENSITY without Blender; only the geometry-dependent part lives here.
import sys
from pathlib import Path

import bpy

COLLECTION = "model"


def ascend(start):
    """The nearest ancestor of `start` (itself included) that holds a scripts/bake_room_ao.py, or None."""
    return next((d for d in [start, *start.parents] if (d / "scripts" / "bake_room_ao.py").exists()), None)


# The checkout is FOUND rather than hardcoded, so moving the repo — or running out of a clone on another machine — needs no edit. Blender does not hand a script a reliable path to do that with. __file__ is real when the script is passed on the command line, but a text block run from the Scripting tab gets a FICTION: the .blend's own path with the text's name stuck on the end — "E:\...\room.blend\export_room.py", naming a directory that cannot exist. Measured 2026-08-10, and note it happened to a block that had been opened from disk with Text > Open and had a perfectly good `filepath` on it, so "was it pasted or opened" is not the distinction and text.filepath is not a substitute either. So no single source is trusted. Every plausible starting point is walked UP until one turns out to have the scripts directory beneath it — which as a side effect means a .blend living anywhere inside the checkout locates it on its own, and the fiction above is itself a usable start since its false leading component simply fails the test and gets walked past.
def repo_root():
    starts = []
    if "__file__" in globals():
        starts.append(Path(__file__).parent)
    starts += [Path(bpy.path.abspath(t.filepath)).parent for t in bpy.data.texts if t.filepath]
    if bpy.data.filepath:
        starts.append(Path(bpy.data.filepath).parent)
    found = next((hit for hit in (ascend(s) for s in starts) if hit), None)
    if found:
        return found
    raise SystemExit("cannot find the checkout — no scripts/bake_room_ao.py above any of " + ", ".join(str(s) for s in starts) + ". Set REPO by hand below, or pass the repo root as the second argument after `--`.")


argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
REPO = Path(argv[1]) if len(argv) > 1 else repo_root()
# Gitignored on purpose — .gitignore allowlists only virtualroom_empty.glb under this directory, so the ~9 MB raw export cannot be committed by accident. `npm run build:room` reads this exact path.
out = Path(argv[0]) if argv else REPO / "src" / "assets" / "models" / "room" / "room_empty.glb"
assert (REPO / "scripts" / "bake_room_ao.py").exists(), f"{REPO} does not look like the checkout — no scripts/bake_room_ao.py under it"

assert bpy.data.filepath, "this .blend has never been saved — save it once so the bake has somewhere to write room_ao.png next to it"


def run(name):
    path = REPO / "scripts" / name
    assert path.exists(), f"missing {path}"
    print(f"\n===== {name} " + "=" * (60 - len(name)))
    exec(compile(path.read_text(encoding="utf-8"), str(path), "exec"), {"__name__": "__main__", "__file__": str(path)})


# Nothing evaluates while the file sits in Edit Mode — the exporter and the bake both read a stale mesh — and bake_room_ao.py's first operator needs an active object to change mode on. Both are settled here, once, rather than assumed.
if bpy.context.object and bpy.context.object.mode != "OBJECT":
    bpy.ops.object.mode_set(mode="OBJECT")
if bpy.context.view_layer.objects.active is None:
    bpy.context.view_layer.objects.active = next(o for o in bpy.data.collections[COLLECTION].objects if o.type == "MESH")

# Pure bpy.data and idempotent, so it is free to run every time; it goes FIRST because set-shell-blend-modes.mjs rejects a suffixed material at the very end of the pipeline, after a bake and an export have already been paid for.
run("normalise_shell_materials.py")
run("bake_room_ao.py")

# The save is the entire point of this script. Without it the bake is a session artefact and the next export reverts to whatever is on disk.
bpy.ops.wm.save_mainfile()
print(f"\nsaved {bpy.data.filepath}")

# use_active_collection rather than a selection: the shell's own objects are hidden and unhidden freely during the bake, and a selection-based export silently drops whatever happens to be hidden at the moment it runs. Setting the active collection also enforces the other half of the export contract — the `windows` object and the sample furniture in the other collections are excluded because they are not in `model`, not because we remembered to deselect them.
layer = bpy.context.view_layer
stack = [layer.layer_collection]
active = None
while stack:
    node = stack.pop()
    if node.collection.name == COLLECTION:
        active = node
        break
    stack.extend(node.children)
assert active, f"no layer collection named {COLLECTION!r} in this view layer"
assert not active.exclude, f"the {COLLECTION!r} collection is excluded from the view layer — re-enable it or the export is empty"
layer.active_layer_collection = active

out.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=str(out),
    export_format="GLB",
    use_active_collection=True,
    use_active_collection_with_nested=True,
    use_selection=False,
    # Both False deliberately: visibility and renderability are bake bookkeeping here, not export intent, and the `model` collection is the whole of what ships.
    use_visible=False,
    use_renderable=False,
    export_yup=True,
    export_apply=True,
    export_materials="EXPORT",
    export_cameras=False,
    export_lights=False,
    export_animations=False,
    export_extras=False,
)
print(f"\nexported {out}  ({out.stat().st_size / 1048576:.2f} MB)")
print("\nnow run:  npm run build:room")
