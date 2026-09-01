# `src/game/core`

The rules of a build, with no React and no Filament in them. Everything here answers one of three
questions: what a furniture IS, what the player may do next, and what survives when they leave.

| root file | what it holds |
| --- | --- |
| `type.ts` | The vocabulary every other file is written in: ids, `PartDef`, `AssemblyAction`, `Furniture`. |
| `ids.ts` | The string → branded-id casts, and the one place an `actionId` is spelled. |
| `store.ts` | The live build: what is completed, what is held, what the hints say. |
| `buildSave.ts` | The only bridge between that store and a persistable `BuildSave`. |
| `accessibility.ts` | The settings TYPES. |
| `profile.ts` | Their default values, and the profiles (Helping Modes) that override them. |
| `prefsStore.ts` | Display preferences — the look of the app and the room. Nothing here takes part in an assembly transition. |

| folder | what lives here |
| --- | --- |
| `composition/` | Turning an authored recipe into a `Furniture`: `composeActions`, `sequence`, `composeLabels`, `metaCounts`, `validateFurniture`. |
| `derive/` | BUILD-TIME derivation from the GLB: `analyze`, `glb`, `jointGeometry`. Runs in helper scripts, never on device. |
| `evaluation/` | What is legal right now: `availability`, `blockReason`, `clusters`, `clusterCombine`, `engagement`, `stability`, `trayCard`. |
| `geometry/` | The maths a gesture needs: `fit`, `math`, `obb`, `fastenerPose`, `staging`. |
| `model/` | Derived structure over the parts — see below. |
| `presentation/` | Words and pictures: `instructions`, `hintText`, `labels`, `objective`, `finish`. |
| `scene/` | `targets` — where the 3D layer is told to look. |

## `model/` — the structure a build is reasoned over

Nine files, and they fall into four jobs.

**The hub.** `liaisons.ts` does two things and is the most depended-on file in `core` (23 runtime
importers). `applyStructure` lays the authored overlay over the generated mesh facts to produce the
`PartDef`s everything else reads; `buildLiaisons` derives **Γ**, the joint graph. The frontier helpers
legality asks — `isSlider`, `andFrontierTargets`, `crossClusterThreads`, `isReachable` — live here too.

**Authoring seams.** How a human states something, lowered to what the runtime consumes. `joints.ts`
holds the `JOINTS` shape and `lowerJoints`, which rewrites joint entities into the flat per-part fields
the engine already reads. `fasteners.ts` is the same idea for hardware: a def declares a group's HOME
(liaison + role, part, or extra-of), lowered to the `FastenerKind` whose runtime defaults implement it.
Both are seams on purpose — the flat form stays the single runtime truth, so a furniture may use either
form, or both mid-migration, and nothing downstream learns the difference.

**Geometry over the parts.** `jointFrames.ts` finds where two parts actually MEET — a contact anchor and
facing per liaison, from the boxes at baked pose. It is why the drag holds a part by its joint and aims
at the partner's, rather than at a pose-derived centre. `sweep.ts` answers which parts obstruct a part's
travel along each cardinal direction: it generates `sweep.gen.ts` offline, and at runtime chooses an
entry direction for a part whose corridor is occupied.

**Build intent.** `components.ts` — several bodies the player handles as ONE object: one tray card, one
drag, one placement. `staging.ts` — a part lifted out of the assembly to be fitted with hardware and
then carried home (`stageOffset`). `geometryCheck.ts` — coarse plausibility warnings on the joint graph;
warnings only, never errors, because it can only ever be a heuristic.

## Where a joint's direction comes from

A joint has three separable facts, and only one of them is a human's to state.

- **Who joins whom** — the hardware's `attached` pairs where a fastener makes the joint, the `JOINTS`
  entry where nothing does.
- **What kind of join** — stated, always. It is what selects the travel axis: a press comes in ACROSS the
  contact face, a slide moves ALONG it.
- **Which way it travels** — DERIVED, in `derive/jointGeometry.ts`, from the contact slab between the two
  parts, and written to each furniture's `joints.gen.ts`. Authored only as an override when the mesh
  cannot answer.

`structure.gen.ts` is the composed result — the authored `STRUCTURE` with `JOINTS` already lowered into
it, which is what `applyStructure` spreads over the mesh facts. Review THAT to see a joint's
consequences; it is the one artifact that used to exist only in memory at load time.

Regenerate both after any model re-export or authoring change, in this order — the joint derivation
consumes the sweep's blocker data:

```
npx tsx src/game/helper-scripts/derive-sweep.mts
npx tsx src/game/helper-scripts/derive-joints.mts --write
```

`derivedJoints.furniture.test.ts` fails, named, when either generated file is stale.

## Where a preference lives

Three homes, and the difference is not cosmetic.

**`settings` (game store, typed in `accessibility.ts`)** — accessibility choices. They gate assembly
through `mode`, and they have their own persistence: `applyProfile` rewrites every default whenever the
player changes avatar, so the store remembers WHICH KEYS the player has touched rather than the whole
object, and lays only those back over the new profile's defaults.

**`prefsStore.ts`** — the look of the app and the room. No field is read or written by `completeAction`,
the drag path, or any evaluation pass, which is exactly why it is a separate store. It makes ONE question
answerable in one place — what survives a relaunch. Today the answer is "nothing": every field is session
state, matching the behaviour these had while they lived in `store.ts`.

**Its own axis (`theme`, `renderStyle`, `handedness`)** — a fact about the player rather than a
preference a profile has an opinion about. `handedness` is the load-bearing case: stored in `settings` it
would reset every time the player changed avatar, because `applyProfile` replaces that object wholesale.
