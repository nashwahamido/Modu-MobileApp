# `src/game/core`

The rules of a build, with no React and no Filament in them. Everything here answers one of three
questions: what a furniture IS, what the player may do next, and what survives when they leave.

The developer notes that used to sit in the source as paragraph-long comments live here. The code keeps
one short line per field; when you need the reasoning behind a field, this is the file.

| root file | what it holds |
| --- | --- |
| `type.ts` | The vocabulary every other file is written in: ids, `PartDef`, `AssemblyAction`, `Furniture`. |
| `ids.ts` | The string → branded-id casts, and the one place an `actionId` is spelled. |
| `store.ts` | The live build: what is completed, what is held, what the hints say. |
| `buildSave.ts` | The only bridge between that store and a persistable `BuildSave`. |
| `accessibility.ts` | The settings TYPES. |
| `profile.ts` | Their default values, and the profiles (Helping Modes) that override them. |
| `prefsStore.ts` | Display preferences — the look of the app and the room. |

| folder | what lives here |
| --- | --- |
| `composition/` | Turning an authored recipe into a `Furniture`: `composeActions`, `sequence`, `composeLabels`, `metaCounts`, `validateFurniture`. |
| `derive/` | Build-time derivation from the GLB: `analyze`, `boxes`, `glb`. Runs in helper scripts, not on device. |
| `evaluation/` | What is legal right now: `availability`, `blockReason`, `clusters`, `clusterCombine`, `engagement`, `stability`, `trayCard`. |
| `geometry/` | The maths a gesture needs: `fit`, `math`, `obb`, `fastenerPose`, `staging`. |
| `model/` | Derived structure over the parts: `joints`, `liaisons`, `jointFrames`, `components`, `fasteners`, `sweep`, `staging`. |
| `presentation/` | Words and pictures: `instructions`, `hintText`, `labels`, `objective`, `finish`. |
| `scene/` | `targets` — where the 3D layer is told to look. |

## Where a preference lives

There are three homes, and the difference is not cosmetic.

**`settings` (game store, typed in `accessibility.ts`)** — accessibility choices. They gate assembly
through `mode`, and they have their own persistence: `applyProfile` rewrites every default whenever the
player changes avatar, so the store remembers WHICH KEYS the player has touched rather than the whole
object, and lays only those back over the new profile's defaults. `hydrateSettings` restores the touched
set once at app start; the loading gate then calls `applyProfile`, which needs it already populated.
Anything else in a saved blob is a default from an older release, and the current default is the better
answer. A key that has been retired is dropped on the way in (`RETIRED_SETTINGS`).

**`prefsStore.ts`** — the look of the app and the room. Nothing here takes part in an assembly
transition: no field is read or written by `completeAction`, the drag path, or any evaluation pass, which
is exactly why it is a separate store. Splitting it out makes ONE question answerable in one place — what
survives a relaunch. Today the answer is "nothing": every field is session state, matching the behaviour
these had while they lived in `store.ts`.

**Its own axis (`theme`, `renderStyle`, `handedness`)** — a fact about the player rather than a
preference a profile has an opinion about. `handedness` is the load-bearing case: stored in `settings` it
would reset every time the player changed avatar, because `applyProfile` replaces that object wholesale.

### The defaults, and why

- **`roomTimeOfDay: "afternoon"`** — the longest warm pool of the day, and the look the room was tuned
  against. Chosen, not clock-driven: every preset is authored to enter through walls the camera can see.
- **`theme: "light"`** — the palette was designed against the dark reference, but light survives a bright
  room, a projector, and a participant's own screen brightness, none of which a study controls. All three
  themes are the same product in different light, so switching costs nothing but the setting.
- **`handedness: "right"`** — the HUD was authored right-handed, and every screenshot, spotlight offset
  and tuned margin assumes it. A left-hander gets the mirror from onboarding's first question; nobody
  gets it by accident.
- **`roomAvatarVisible: true`** — the companion is much of what makes the room read as lived-in rather
  than as a showroom, so a player has to choose to be without it.
- **`music: true`, `soundEffects: true`** — effects are expected in a game and, unlike narration, do not
  talk over anything; the build is a long quiet task and the track is what makes it feel like a place
  rather than a form. Profiles that need a quiet build turn them off explicitly.

### Two things about the room avatar

Turning it off **unmounts** it rather than hiding it, and that is the point: the component owns a GLB with
three textures (~12 MB of VRAM after `scripts/compress-avatar-glb.mjs`), a Filament animator over a
skinned mesh, and a per-frame rAF loop whose pathfinder is the most expensive thing the room can do in a
single frame. Parking it out of sight would keep every one of those. WHICH avatar it is stays
`roomAvatarKindForProfile`'s business; the setting only says whether it is there at all.

It is also **not persisted**, which matches `roomBackground` and `roomTimeOfDay` beside it rather than
being an oversight — but it is the weakest fit of the three. A background is a look a player re-picks for
fun; "I don't want the companion" is a decision they expect to stick, so this is the one that will read
as a bug when it comes back on at launch. Persisting it means an AsyncStorage pair in `prefsStore`, never
the game store's `settings` — `applyProfile` replaces that wholesale on every avatar change, the very
event most likely to accompany this choice.

## What a save restores

`buildSave.ts` is the only place that maps between the live store and a persisted `BuildSave`, so the two
shapes cannot drift. `applyBuild` runs AFTER `loadFurniture` (which resets progress), and touches
progress fields only — never the furniture itself.

**The save's `mode` always wins, including over the furniture's `meta.mode`.** That field is only ever the
mode a build OPENS in, and a save means this build has been opened before. So a furniture's pin is seen
on the first entry and never again, which is the intent: a starting nudge, not a property of the
furniture. Break the `loadFurniture` → `applyBuild` ordering and the nudge turns into a lock.

**The section focus is derived, not persisted.** The save schema has no column for it and never needs
one: a resumed mid-build lands in the cluster its next available action lives in, instead of the section
chooser asking a question the save already answers. `loadFurniture` nulls `activeCluster` just before, so
a fresh or combine-stage build keeps the chooser exactly as it was.

## Profiles

A profile is a set of default-value overrides picked during onboarding — the player can still change any
single setting later. Add one by adding an entry to `PROFILE_DEFAULTS`, plus `PROFILE_MODE` if it pins an
assembly mode. Profiles may later drive which settings the quick panel shows; keep that in the UI, keyed
on `ProfileId`. Spec features not yet in the engine are tracked in MERGE_PLAN (profile gaps).

`snapDistance` is the snap ACCEPTANCE radius in meters: how far from the matched socket a release still
counts as placed, and where the magnet reaches full strength. Consumers clamp it to ≤ 0.2, below LACK's
0.25 m half-spacing. The targeting and hysteresis constants are deliberately NOT settings — they are the
anti-jumping machinery and stay fixed.

| profile | snapDistance | why |
| --- | --- | --- |
| `control` | 0.14 | Baseline. The magnet reaches no further than the default; this profile asks for the most precision. |
| `visual` | 0.18 | Aiming is done by feel here, so the magnet takes over sooner. |
| `momentum` | 0.18 | Quick, low-effort placement — a near-miss should still seat. |
| `clearPath` | 0.20 | The most forgiving fit, at the geometry-safe cap (`SNAP_DIST_MAX`) — one step at a time, so a socket is rarely contested. |

## Authoring a part

Most of `PartDef` is plain data. These are the fields whose PRESENCE changes how a step behaves:

- **`stageOffset`** — the world offset from the assembled pose to a SUB-ASSEMBLY rest pose. Presence is
  what makes a part staged: a `stagePart` beat is generated ahead of its placement, hardware may be
  fitted while it rests out there, and a second gesture carries the finished sub-assembly home
  (`model/staging.ts`).
- **`lockDir`** — the keyhole LOCK travel: the short second shove after a press-fit's bolts enter their
  slots (EKET side ↔ top: press in along `placeDir`, then push down). Presence makes the press
  TWO-PHASE — the part parks backed off along BOTH legs, the taps close the `placeDir` leg to the hooked
  pose, then a short drag along `lockDir` seats it and commits (`HookPressControl`). `lockTravel` is the
  distance; it defaults to `engagement.LOCK_TRAVEL_M`.
- **`insertStage`** — opt-in to the 3-phase fastener lifecycle: the meters the fastener sits fully
  outside its hole when first dropped. Presence splits it into `placeFastener` (drag → stage) +
  `insertFastener` (press → loose) + `tightenFastener` (tool → flush). Absent means the classic 2-phase
  drag-to-loose + tighten.
- **`insertProud`** — how far the LOOSE pose sits proud of flush; defaults to `LOOSE_OFFSET_M`. `0` means
  the insert lands FLUSH and the tighten happens in place, for a cam that drops fully into its housing
  and only TURNS (EKET's rear cams and pins, whose 2 cm default poked out past the cabinet rear).
- **`insertRetract`** — the opposite: meters the fastener sits RETRACTED into its carrier at insert. Its
  `drawTurn` tighten then draws it back out to flush while turning (the EKET stabiliser-rod dowels:
  pressed into the rod, then drawn into the slider hole and quarter-turned to lock).
- **`dropOn`** — force a plain snap even when a press/screw partner is already placed; the part clicks
  home at drop with no drive gesture (EKET's suspension cover pushes over its bracket in the same motion
  that places it).
- **`parkBackoff`** — override the engagement default for this part's staging, because small fittings
  park a few centimetres off their seat rather than at the panel-scale backoff.

Three fields exist only because a node origin is in the wrong place:

- **`toolAnchor`** — where the TOOL actually works, when that is not the part origin (EKET suspension
  bracket: origin on the plate, screw hole at the boss ~1 cm over). Overrides `headOffset` outright.
- **`headOffset`** (generated) — the centre of a fastener's HEAD FACE, the mesh's local −Z bbox face.
  `ToolModel` projects it onto the live tool axis so the driver contacts the head instead of hovering
  `TIP_GAP` off the part ORIGIN — which only looked right when a screw's half-length happened to equal
  the old 12 mm gap. Projecting rather than using the raw point keeps it harmless where an authored
  `engageDir` redirects the axis away from the mesh frame (EKET cams).
- **`jointAnchor`** — an authored override for the drag hold/aim anchor. It replaces the part's RESOLVED
  anchor (what the multi-joint centroid produces), not any single frame: authoring is per-part while
  frames are per-liaison. None authored today — all four shipped furnitures derive cleanly.

## Generated geometry

Nothing in this group is hand-authored. All of it is optional on `Furniture`, and every consumer has a
fallback, so a furniture can ship before its derivation does.

- **`boxes`** (`boxes.gen.ts`, from `helper-scripts/derive-boxes`) — each part's world AABB at its baked
  pose; the unit the joint derivation works in. Absent, the drag falls back to the visual-centre clamp.
- **`PartBox.obb`** — the same box in the part's OWN frame. Tight where the world-aligned min/max is a
  slab of air: every splay in these GLBs lives in the node rotation, not the vertices (a DALFRED leg is a
  35 mm stick inside a 192 mm AABB), so the visibility gate measures sightlines and burial against this
  when present. AABB ⊇ OBB ⊇ mesh — still conservative, just far less wasteful.
- **`JointFrame`** — where two parts actually meet, per liaison at baked pose. `anchor` is the shared
  contact point; the per-endpoint offsets are the drag's hold and aim points, each clamped into its own
  part's bounds. `facingA` is the direction the contact FACES: the thin axis of the overlap slab, since a
  contact is a sheet and its normal is the slab's smallest dimension — or the centre-to-centre line when
  a fastener bridges an air gap. Facing is what visibility gating needs; a socket facing away from the
  camera is on the far side of its own part, invisible whatever occludes it.
- **`sweep`** (`helper-scripts/derive-sweep.mts`) — per part, per cardinal direction, the parts
  obstructing its exit corridor within its bounded park travel. Cluster-scoped, the mover eroded 4 mm for
  clearance, fasteners excluded because their sequencing is the home lane. A missing key means the
  corridor is clear. `engagement.travelAxis` consumes it for parts with no authored `placeDir`: an entry
  travel `t` is order-viable when every already-placed blocker of the reverse corridor `−t` is one of the
  part's own joint partners.

## Ids

Ids are branded (`PartId`, `GroupId`, …) so one can never be passed where another is meant. Cast through
`ids.ts` and nowhere else.

A part-tied action's id is `<prefix>_<partId>`, and the prefix IS the type: `stage`, `place`, `drop`,
`insert`, `tighten`. `PICKUP_TYPES` is the subset the player lifts — a tighten is done in place, so it is
not one, and `stagePart` is, because taking a sub-assembly carrier out of the box is the same gesture as
placing it with a different resting target. `liaisonId` sorts its two parts so a liaison has one id
whichever end asks for it.

## Artwork fallbacks

`meta.variantThumbnails` and `clusterVariantThumbs` are keyed by the `item_variants` `variation` string,
finish first. A missing finish — or a finish missing one cluster — falls back to the plain tile and to
`clusterThumbs` respectively (`presentation/finish.ts`). That is deliberate: a variation declared in the
table before its artwork ships degrades to the plain tile rather than a broken image, and cluster art can
land one stage at a time.

## Open questions

- The axes marked `dev-setting` (`releaseBehavior`, `snapDistance`) are still being settled — float vs
  auto-return in particular.
- `furnitureForProfile` returns the same furniture for every profile today.
