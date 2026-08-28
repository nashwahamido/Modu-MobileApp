# Furniture content — what to re-run when you change something

Everything in a furniture folder is either **authored by hand** or **generated from the GLB**. Generated files are committed on purpose: the app imports them, and a test compares each one against a fresh derivation, so a stale file fails by name instead of shipping.

Never hand-edit a `*.gen.ts`. Re-run its script.

## Per folder

| File | Source | Hand-edit? |
|---|---|---|
| `authored.ts` | you | **yes** — structure, actions, fastener rules, labels |
| `meta.ts`, `clusterVariants.ts` | you | **yes** |
| `index.ts` | you | **yes** — assembles the `Furniture` |
| `parts.gen.ts` | the GLB | no |
| `boxes.gen.ts` | the GLB + `parts.gen.ts` | no |
| `sweep.gen.ts` | the GLB + `authored.ts` | no |
| `thumbs.gen.ts` | rendered PNGs | no |

## If you change… run this

### A furniture GLB (any re-export from Blender)

This is the big one. Three scripts, in order — later ones read the output of earlier ones:

```bash
node src/game/helper-scripts/read-parts.mjs          # parts.gen.ts  (poses, mesh names, visualCenterOffset)
npx tsx src/game/helper-scripts/derive-boxes.mts     # boxes.gen.ts  (world bounds at baked pose)
npx tsx src/game/helper-scripts/derive-sweep.mts     # sweep.gen.ts  (exit-sweep blockers)
```

Then re-render thumbnails if the model's *look* changed (not needed for geometry-only edits):

```bash
node src/game/helper-scripts/render-thumbs-blender.mjs   # needs Blender; override with BLENDER=/path/to/blender
node src/game/helper-scripts/gen-dark-thumbs.mjs
node src/game/helper-scripts/gen-thumbs.mjs              # writes thumbs.gen.ts, wires in the dark variants
```

Note: several script headers say `npm run gen:thumbs` / `npm run render:thumbs:blender`. Those scripts are **not** in `package.json` — call the files directly as above.

**`derive-boxes.mts` can refuse to write.** If a part's box centre is more than 2mm from `pose + visualCenterOffset`, it prints the offending parts and exits `1` without touching the file. That gap means the mesh and `parts.gen.ts` disagree — usually `read-parts.mjs` wasn't re-run first, or the export moved geometry. Fix the cause; do not raise the tolerance.

### `authored.ts` — `STRUCTURE` (re-typings, `parkBackoff`, join arrays)

```bash
npx tsx src/game/helper-scripts/derive-sweep.mts
```

`sweep.gen.ts` depends on authored structure, not just the model. Nothing else needs regenerating.

### `authored.ts` — actions, fastener rules, labels, clusters

Nothing to regenerate. `assertValidFurniture` runs at import in dev and throws on an authoring mistake, so a bad edit surfaces the moment the app or the test suite loads the furniture.

### Adding a new furniture

Run the whole GLB list above, then `node src/game/helper-scripts/extract-structure.mjs` to draft `dev/authored.derived.ts` as a starting skeleton — review it, don't ship it as-is. (It also emits a review kit; see the script header for the `apply-review` / `verify-review` workflow.)

**Then add it to the tests that don't auto-discover.** `boxes.furniture.test.ts` and `jointFrames.furniture.test.ts` scan the models folder, so they pick a new furniture up for free. The rest carry a hardcoded corpus list and will silently skip it until you add it by hand:

- `core/model/structuralSweep.furniture.test.ts`
- `core/model/fastenerGeometry.furniture.test.ts`
- `content/furnitures/instructionSim.test.ts`

Same for the scripts: `read-parts.mjs` scans the models folder, but `derive-boxes.mts` and `derive-sweep.mts` have a hardcoded corpus at the top — a new furniture needs an import added there, or they simply won't generate for it.

## What catches you if you forget

`npm test` — all of these read the GLB directly and compare against what is checked in:

| Test | Fails when |
|---|---|
| `core/derive/boxes.furniture.test.ts` | `boxes.gen.ts` is stale, or a part is >2mm from `parts.gen.ts` |
| `core/model/structuralSweep.furniture.test.ts` | `sweep.gen.ts` is stale |
| `core/model/jointFrames.furniture.test.ts` | mesh names drifted from `parts.gen.ts`; joint anchors need hand-authoring |
| `core/model/fastenerGeometry.furniture.test.ts` | a fastener's derived axis/width no longer matches the played values |
| `content/furnitures/instructionSim.test.ts` | a step became unreachable or its hint went circular |

Also run `npm run typecheck`. Some failures in the suite predate any given change — check against a clean tree (`git stash -u`) before assuming a red test is yours.

## Why generated files are committed

The app imports them at build time, and Metro needs static imports. Committing them also makes the pin tests possible: the test recomputes from the GLB and diffs against the file, which is what turns "someone forgot to re-run the script" into a named failure. Do not add `*.gen.ts` to `.gitignore`.
