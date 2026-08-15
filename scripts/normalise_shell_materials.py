# Strip the .001 suffixes off the room shell's materials, and clear the dead diced shell that is holding the un-suffixed names hostage. Run INSIDE Blender:
#   - paste into the Scripting tab and press Run, or
#   - blender <file>.blend --background --python scripts/normalise_shell_materials.py
#
# WHY THIS EXISTS. Building the undiced shell in a file that already held the diced one leaves TWO copies of every shell material — Wall_xmin and Wall_xmin.001 — with the live meshes wearing the .001 set. The suffix survives the glTF export, and on the app side that is fatal in three places at once:
#   * src/room/core/wallCulling.ts matches /^(?:Wall|Trim)_(xmin|xmax|zmin|zmax)$/ — ANCHORED, so "Wall_xmin.001" matches nothing and camera-facing wall culling silently fades nothing at all.
#   * The same file's corner regex likewise, so the four cornice corner blocks never fade either.
#   * CEILING_MATERIAL in src/room/core/roomShell.ts is compared with ===, so "Ceiling.001" is never pinned to alpha 0 and the ceiling renders as a solid opaque lid over the room.
# scripts/set-shell-blend-modes.mjs checks the same list and exits 1, so a suffixed export cannot reach a device — but it fails at the END of the asset pipeline, after a bake and an export have already been paid for. This runs at the start instead.
#
# WHAT ACTUALLY HOLDS THE CANONICAL NAMES, measured 2026-08-03 in print_room_bakein.blend: not orphan materials, but 355 MESH DATABLOCKS WITH NO OBJECT — Shell_Band_*, every WCell_*, the old Shell_Wall_* — the diced shell's geometry, left behind when its objects were deleted. Blender keeps mesh data alive until a purge or a save-and-reload, and while it lives it counts as a material user: Wall_xmin sat at 86 users (84 band cells + slab + panel) with not one of them drawn in any scene. So the rename cannot work until that data goes, which is step 1 below.
#
# SAFETY. Pure bpy.data — no operators, no mode changes, no bmesh — so it is safe to run while you are in Edit Mode and it will not disturb a selection or an in-progress edit. It only ever removes a mesh that NO object references and that wears a shell material, never renames a material that is not on a Shell_* mesh, and ABORTS without touching anything if a canonical name turns out to be held by something genuinely in use. It does NOT save the file: read the report, then save yourself.
#
# Idempotent: a second run finds nothing to do and says so.
import re
import bpy

SUFFIX = re.compile(r"^(.*)\.\d{3}$")


def canonical(name):
    match = SUFFIX.match(name)
    return match.group(1) if match else name


# The export contract, and the exact list scripts/set-shell-blend-modes.mjs demands. Fifteen materials: one per wall, one per cornice run, one per cornice CORNER (a corner shows while EITHER of its walls does, so it cannot share either one's material), plus the ceiling, the floor slab and the plinth.
WALLS = ["xmin", "xmax", "zmin", "zmax"]
EXPECTED = (
    [f"Wall_{w}" for w in WALLS]
    + [f"Trim_{w}" for w in WALLS]
    + [f"Trim_{x}_{z}" for x in ("xmin", "xmax") for z in ("zmin", "zmax")]
    + ["Ceiling", "Floor", "FloorEdge"]
)

model = bpy.data.collections.get("model")
if model is None:
    raise RuntimeError("no 'model' collection — is this the room .blend?")

# Scoped to Shell_* meshes ON PURPOSE. The model collection also holds the window dressing (windows.001 and its window-default parent), whose materials are called things like Wood.004 — stripping THAT suffix would collide with the unrelated 'Wood' already in the file and quietly repaint a mesh.
shell_objects = [o for o in model.objects if o.type == "MESH" and o.name.startswith("Shell_")]
if not shell_objects:
    raise RuntimeError("no Shell_* meshes in the 'model' collection")

live_meshes = {o.data for o in bpy.data.objects if o.type == "MESH" and o.data}
print(f"-- {len(shell_objects)} Shell_* objects | {len(bpy.data.meshes)} mesh datablocks, {len(bpy.data.meshes) - len(live_meshes)} of them drawn by nothing")

# ---- 1. clear the dead diced shell ----------------------------------------
# Scoped twice over: a mesh must have NO object referencing it AND wear at least one material whose canonical name is in the contract. That second test is what keeps this from becoming a general-purpose orphan purge — an unused furniture mesh someone is about to re-link is none of this script's business.
dead = []
for mesh in list(bpy.data.meshes):
    if mesh in live_meshes:
        continue
    if not any(m and canonical(m.name) in EXPECTED for m in mesh.materials):
        continue
    dead.append(mesh.name)
    bpy.data.meshes.remove(mesh)

if dead:
    print(f"-- removed {len(dead)} object-less shell mesh datablock(s), e.g. {sorted(dead)[:4]}")
else:
    print("-- no dead shell geometry to clear")

# ---- 2. work out what each live material wants to be called ---------------
live = []
for o in shell_objects:
    for m in o.data.materials:
        if m and m not in live:
            live.append(m)

plan = []
for m in live:
    target = canonical(m.name)
    if target not in EXPECTED:
        # Not a shell material by name. Left strictly alone and reported: renaming something this script does not recognise is exactly how a mesh gets silently repainted.
        print(f"   ? {m.name!r} -> {target!r} is not in the export contract, SKIPPED")
        continue
    if target != m.name:
        plan.append((m, target))

if not plan:
    print("-- nothing to rename: every shell material is already canonical")

# ---- 3. clear the canonical names, refusing to do so destructively --------
# Blender re-suffixes a rename straight back to .001 if the target name is taken, so whatever holds it has to go first. "Orphan" is checked, never assumed. A canonical name still held by something with real users after step 1 is a genuine ambiguity — two different materials both claiming to be Wall_xmin — and this stops rather than picking one.
removed, blocked = [], []
for material, target in plan:
    squatter = bpy.data.materials.get(target)
    if squatter is None or squatter is material:
        continue
    if squatter.users == 0:
        bpy.data.materials.remove(squatter)
        removed.append(target)
    else:
        blocked.append((target, squatter.users))

if blocked:
    for name, users in blocked:
        print(f"   ! {name!r} is still held by {users} user(s) — cannot rename onto it")
    raise RuntimeError(
        "aborted before renaming: "
        + ", ".join(n for n, _ in blocked)
        + ". Find what still uses those materials (Blender's Outliner in Blender File mode shows it), detach or delete it, then run again."
    )

print(f"-- purged {len(removed)} freed material copy/copies: {sorted(removed)}")

# ---- 4. rename ------------------------------------------------------------
for material, target in plan:
    was = material.name
    material.name = target
    # Blender silently appends a suffix if the name is still taken, so the result is verified rather than trusted.
    if material.name != target:
        raise RuntimeError(f"rename {was!r} -> {target!r} came back as {material.name!r}; the name is still taken")
    print(f"   {was}  ->  {target}")

# ---- 5. verify the export contract ----------------------------------------
on_shell = {m.name for o in shell_objects for m in o.data.materials if m}
missing = [name for name in EXPECTED if name not in on_shell]
if missing:
    raise RuntimeError(
        f"shell is missing {len(missing)} contract material(s): {missing}. "
        "set-shell-blend-modes.mjs would exit 1 on this export."
    )
print(f"-- contract OK: all {len(EXPECTED)} materials present on Shell_* meshes")
extra = sorted(on_shell - set(EXPECTED))
if extra:
    print(f"   note: Shell_* meshes also wear {extra} — harmless, but they ship as extra glTF materials")

# ---- 6. de-duplicate the image copies the same history left behind --------
# Cosmetic for the export (glTF names its own images), but a second packed 1024 AO map is a megabyte of .blend for nothing, and two datablocks called room_ao / room_ao.001 pointing at one PNG is a trap for whoever next wires a material by name. Only a zero-user image whose FILEPATH is also held by a surviving one is dropped — an image that is merely unused is left alone, because unused is not the same as duplicate.
in_use = {}
for image in bpy.data.images:
    if image.users > 0 and image.filepath:
        in_use.setdefault(image.filepath, image.name)

dropped = []
for image in list(bpy.data.images):
    if image.users > 0 or not image.filepath:
        continue
    survivor = in_use.get(image.filepath)
    if survivor and survivor != image.name:
        dropped.append(image.name)
        bpy.data.images.remove(image)

# With the duplicate gone the survivor can usually drop its own suffix, which is what leaves the file with a plain 'room_ao' again.
renamed = []
for image in bpy.data.images:
    target = canonical(image.name)
    if target != image.name and bpy.data.images.get(target) is None:
        image.name = target
        renamed.append(target)

print(f"-- dropped {len(dropped)} duplicate image(s): {sorted(dropped)}")
if renamed:
    print(f"-- un-suffixed {len(renamed)} image(s): {sorted(renamed)}")

# ---- 7. report what would ship that is not the shell ----------------------
# Not an action — a reminder. windows.001 is 4312 verts of window dressing parked in the opening, and exporting the 'model' collection as-is bakes a window into the shell GLB, where it collides with the catalogue window the player places. It also has to be hidden for any AO re-bake (trap 3 in scripts/bake_room_ao.py) or its shadow prints permanently into the reveal and every other window inherits it.
strays = sorted(o.name for o in model.objects if not o.name.startswith("Shell_"))
if strays:
    print(f"-- NOT part of the shell, exclude before exporting: {strays}")

print("-- done. Nothing has been saved; check the report above, then save the file.")
