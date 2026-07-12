// The shader-override layer: swaps a part's GLB material for a compiled Filament
// material, driven by the ACTIVE MODEL LOOK (`renderStyle`).
//
// The two ways a look can be built:
//   - swap the MODEL     (cozy, cartoon → LACK_cozy.glb / LACK_cartoon.glb, via
//                         furniture.styleModels — handled by AssemblyScene)
//   - swap the MATERIAL  (illustrated → ink.filamat — handled here)
// A look uses one or the other. `RenderStyle.toon` / `.outline` in core/type.ts were
// always the hook for this; `shader` replaces them with something the scene reads.
//
// Applied PER-ENTITY, not scene-wide: PartModel owns each entity and adds it to the
// scene, so a scene-level material apply is superseded by the components' own
// material effects.

import { useEffect, useState } from "react";
import { useBuffer, useFilamentContext } from "react-native-filament";
import type { Entity } from "react-native-filament";
import { useGameStore } from "@/src/game/core/store";
import { styleFor } from "@/src/game/core/presentation/labels";
import { DIR_KEY } from "./lighting";
import { MaterialParams, PartDef, RenderStyleId, Vec3 } from "@/src/game/core/type";

export type ShaderStyleId = "off" | "toon" | "ink";

/**
 * Which custom material each model look renders with.
 *
 * The looks split cleanly by mechanism:
 *   realistic / cozy / cartoon  → the GLB is the look (styleModels)
 *   toon / illustrated          → the MATERIAL is the look (this file)
 *
 * `cartoon` stays "off" ON PURPOSE: its look is a GLB swap (LACK_cartoon.glb), and a
 * material override would paint straight over those baked materials, making the GLB
 * pointless. A look swaps the model or the material — never both by accident.
 */
export const STYLE_SHADER: Record<RenderStyleId, ShaderStyleId> = {
  realistic: "off",
  cozy: "off",
  cartoon: "off",
  toon: "toon",
  illustrated: "ink",
};

/** Metal fasteners keep their own finish under every style. */
const METAL_GROUPS: readonly string[] = ["bolt115980"];

// ── ink palette (LINEAR, not sRGB — Filament parameters are linear) ──────────
/** The painted grain map. Multiplied by baseColor, so keep baseColor near white or the
 *  map's own colour gets tinted twice. */
const GRAIN_MAP = require("@/src/assets/textures/wood_grain.png");

/** Set false to fall back to the shader's procedural planks (no texture, no render-thread
 *  upload). The material supports both; this flips the `useTexture` uniform. */
const USE_TEXTURE = true;

/** Tint over the map. White = the map's own colours, which is the point. */
const INK_BASE: Vec3 = [1.0, 1.0, 1.0];
/** The wood's own colour when the procedural path is used instead (#d8ab6b pine). */
const INK_BASE_PROCEDURAL: Vec3 = [0.699, 0.399, 0.153];
/** Map repeats per METRE across the grain.
 *
 *  The cleaned map holds 32 whole planks, so planks-across-a-face = 32 · length · TILES.
 *  The LACK top is 0.55 m → 0.35 puts ~6 planks across it. A leg is 0.049 m → ~0.5 of a
 *  plank, i.e. a leg is one piece of timber, which is what a leg IS. */
const TEXTURE_TILES = 0.35;

/** Phase shift across the grain, in plank widths.
 *
 *  Every LACK part is centred on its object origin (leg centre = 0,0; top centre = 0,0)
 *  and the cleaned map's column 0 is a plank SEAM — so at phase 0 a seam lands exactly
 *  down the middle of every leg face and along the middle of the table top's edge band.
 *  Half a plank puts the part's centre mid-board instead, where solid timber belongs.
 *  The top face is ~6 planks wide, so it keeps its seams. */
const GRAIN_PHASE = 0.5;
/** The colour the wood turns in shadow — a HUE shift, not just darker. This is most
 *  of what makes the shading read as "drawn" rather than "3D with fewer colours". */
const INK_SHADE: Vec3 = [0.29, 0.15, 0.05];
/** Ink brown. Never pure black: black reads as CG, brown reads as drawn. */
const INK_LINE: Vec3 = [0.038, 0.021, 0.009];
/** A LIT edge is not dark — it is a bright rim (look at the top-front edges of the
 *  reference). Values >1 brighten, because the ink is applied with multiply blending. */
const INK_HIGHLIGHT: Vec3 = [1.45, 1.4, 1.3];

/** Direction TO the key light, world space — the negated rig direction. Which edges catch
 *  the light and go bright instead of dark. Derived from lighting.ts so the two cannot
 *  drift apart. */
const KEY_TO_LIGHT: Vec3 = [-DIR_KEY[0], -DIR_KEY[1], -DIR_KEY[2]];
const TOON_BASE: Vec3 = [0.5776, 0.2384, 0.0232]; // calendula gold #c8862a


/**
 * Object-space direction the wood grain RUNS — down a leg, along a table top.
 *
 * NOT guessed: read off the meshes' own object-space bounding boxes in LACK.glb.
 *   whole_tableTop  X=0.550  Y=0.550  Z=0.049  → Z is the thickness; grain runs in-plane
 *   whole_leg_*     X=0.049  Y=0.049  Z=0.400  → Z is the LENGTH; grain runs down it
 *
 * A leg's long axis is object Z, not Y. Getting this wrong is what wrapped the grain
 * AROUND the legs in rings instead of running down them.
 */
const GRAIN_AXIS: Record<string, Vec3> = {
  tableTop: [1, 0, 0],
  leg: [0, 0, 1],
};
const GRAIN_AXIS_DEFAULT: Vec3 = [0, 0, 1];

/** Planks per METRE across the grain, and grain strokes per METRE.
 *
 *  The LACK top is 0.55 m across, a leg 0.04 m. A leg is ONE piece of timber, so its
 *  plank scale is set low enough (2/m = half-metre planks) that no seam can ever cross
 *  it; the top gets 7/m ≈ 14 cm planks, so four run across it. Stroke density is
 *  per-metre and shared, or a leg would get half a stroke while the top got thirty. */
const PLANKS: Record<string, number> = { tableTop: 7, leg: 2 };
const PLANKS_DEFAULT = 3;
const GRAIN_STROKES = 55;

// `.filamat` is registered in metro.config.js assetExts and a require() resolves it to an
// asset id — exactly how the GLBs are pulled in by each furniture's index.ts. An ESM
// import would need a `declare module "*.filamat"` shim and would break that convention.
const SOURCES: Record<Exclude<ShaderStyleId, "off">, number> = {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  toon: require("@/src/assets/materials/toon.filamat"),
  // ink_v2, not ink: a NEW asset path can't be served from a stale Metro/dev-client
  // cache, and if it is missing Metro errors loudly. Filament SILENTLY IGNORES a
  // setParameter for a name a material doesn't have, so a new shaders.ts against an old
  // .filamat renders with no edges and no error — which is a miserable thing to debug.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ink: require("@/src/assets/materials/ink_v2.filamat"),
};

/**
 * Parameters for a part under a style.
 *
 * `override` is the furniture's own `styles[renderStyle].material[meshName | group]`,
 * so a near-black DALFRED can restate `baseColor` once and keep the rest of the ink
 * look — without that, "illustrated" would repaint every furniture pine.
 */
function paramsFor(
  style: Exclude<ShaderStyleId, "off">,
  def: PartDef,
  override?: MaterialParams,
): { float3: Record<string, Vec3>; float: Record<string, number> } {
  if (style === "toon") {
    return { float3: { baseColor: override?.baseColor ?? TOON_BASE }, float: {} };
  }
  return {
    float3: {
      baseColor:
        override?.baseColor ?? (USE_TEXTURE ? INK_BASE : INK_BASE_PROCEDURAL),
      shadeColor: INK_SHADE,
      inkColor: INK_LINE,
      highlightColor: INK_HIGHLIGHT,
      keyDir: KEY_TO_LIGHT,
      grainAxis: GRAIN_AXIS[def.group] ?? GRAIN_AXIS_DEFAULT,
    },
    float: {
      // wood — the texture path, and the procedural fallback's knobs
      useTexture: USE_TEXTURE ? 1 : 0,
      textureTiles: TEXTURE_TILES,
      grainPhase: GRAIN_PHASE,
      plankScale: PLANKS[def.group] ?? PLANKS_DEFAULT,
      grainScale: GRAIN_STROKES,
      grainStrength: 0.85,
      // cel ramp
      bands: 3,
      softness: 0.14,
      ambientLift: 0.42,
      // 1.0 is now NEUTRAL: the shader divides by PI like Filament's own Lambert, so
      // this look is exposed the same as every other against the same rig.
      lightScale: 1,
      // Shadows OFF for this look. A cel ramp is brutally sensitive to shadow-map noise:
      // any partial visibility lands the pixel in a different BAND, so acne that a smooth
      // material hides as a faint smudge becomes a hard dark patch across half the table
      // top. The ShadowPlane still grounds the model. Raise toward 1 if you want the legs
      // to cast onto the top and can live with the speckle.
      shadowStrength: 0,
      // Outline thickness in PIXELS — a real screen-space width, so it stays constant
      // whatever angle a face sits at, and a table top seen edge-on no longer inks over
      // entirely (which is what made the light look like it was dying).
      contourPixels: 1.4,
      // …but the pixel test alone also fires on CURVATURE, and the LACK meshes are
      // filleted (a leg carries 80 distinct normals, the top 814). Every rounded corner
      // drew a line inboard of the real silhouette: one down each leg, one along the
      // table top's edge band. This second gate requires the surface to be near edge-on
      // as well, which pins the ink to the corner itself.
      contourMaxFacing: 0.3,
      // The crease term is now redundant: it detected edges by CURVATURE, which is what
      // smeared lines inboard across the fillets. Edges are drawn from axis alignment
      // instead (below), which is exact for these box-with-fillet parts. Left at 0 — turn
      // it up only if a model with genuinely hard edges shows up.
      creaseThreshold: 0.6,
      creaseStrength: 0,
      lineDarkness: 1,

      // ── edge ink ──────────────────────────────────────────────────────────────────
      // A flat face's object-space normal is axis-aligned (alignment 1.0); a fillet's is
      // diagonal, bottoming out at 0.707. So the drawn edge is simply "alignment below a
      // threshold" — exact, no derivatives, no curvature guessing.
      //
      // Because the line's width is the FILLET's width in world space, it thickens as a
      // part comes nearer and thins as it recedes. That is the perspective weight
      // variation you get in a drawing, and it is why this does not read as one uniform
      // border. Narrow the gap (0.76 → 0.86) for a finer line, widen it for a bolder one.
      edgeStart: 0.72,
      edgeEnd: 0.9,
      edgeInk: 1,
      highlightStrength: 0.9,

      // Snap the shading normal to the part's nearest axis, so a rounded corner takes its
      // FACE's tone instead of sweeping a gradient between two faces. Without this, the
      // cel ramp smears a soft band across every fillet — which is what reads as a pair of
      // vague vertical stripes down each leg and a horizontal split along the table top's
      // edge band. Flat faces + crisp corners is what makes an illustration read as drawn.
      // Drop to 0 to see the difference; there is no in-between worth shipping.
      facetStrength: 1,
    },
  };
}

/**
 * The shader the scene should be using right now. The model look is the ONLY input —
 * the old `settings.toonShader` switch is gone, and with it the possibility of a
 * setting and a look disagreeing about what the table is made of.
 *
 * A furniture may override per look via `styles[renderStyle].shader` (e.g. a build
 * whose GLB already looks hand-drawn can opt out of the ink pass).
 */
export function useShaderStyle(): ShaderStyleId {
  const renderStyle = useGameStore((s) => s.renderStyle);
  const styles = useGameStore((s) => s.furniture?.styles);
  return styleFor(styles, renderStyle)?.shader ?? STYLE_SHADER[renderStyle];
}

/**
 * One Material per style, created ON THE RENDER THREAD.
 *
 * This is the whole reason the texture route is fiddly. Filament's driver lives on the
 * render thread, and `setDefaultTextureParameter` touches it — RNF's own single use of
 * that API sits inside a 'worklet' for exactly this reason. Called from a JS-thread
 * effect (which is where a per-part material hook necessarily runs) the texture object
 * is created but its pixels never reach the render thread's GL context: the surface
 * samples white, and the driver race kills the process about a second later.
 *
 * So: the Material AND its texture are built inside `workletContext.runAsync`, once, and
 * every part shares the result. A module-level PROMISE (not a value) is the cache, so
 * nine PartModels mounting in the same frame produce one material and one upload rather
 * than nine of each.
 *
 * MaterialInstances are still created on the JS thread below — those are CPU-side only,
 * which is why the toon path has been doing it safely all along.
 */
const materialPromises = new Map<string, Promise<any>>();

function ensureMaterial(
  style: Exclude<ShaderStyleId, "off">,
  engine: any,
  renderableManager: any,
  workletContext: any,
  buffer: any,
  grain: any,
): Promise<any> {
  const existing = materialPromises.get(style);
  if (existing) return existing;

  const needsTexture = style === "ink" && USE_TEXTURE;

  // runAsync returns a worklets-core THENABLE, not a real Promise: it has .then but no
  // .catch, and it is not safe to await repeatedly. Promise.resolve adopts it once and
  // hands back a genuine Promise, which is what makes it safe to cache here and await
  // from all nine parts.
  const promise = Promise.resolve(
    workletContext.runAsync(() => {
      "worklet";
      const material = engine.createMaterial(buffer);
      if (needsTexture) {
        // Sampler params live on the Material's DEFAULT instance, so every instance made
        // from it inherits the texture — one upload, nine parts. RNF binds with
        // WrapMode::REPEAT, which is what makes the triplanar tiling work.
        material.setDefaultTextureParameter(renderableManager, "grainMap", grain, "sRGB");
      }
      return material;
    }),
  );

  materialPromises.set(style, promise);
  return promise;
}

/**
 * Per-entity bookkeeping. Two jobs:
 *   - REUSE the MaterialInstances we create, so switching looks repeatedly in a
 *     45-minute session doesn't allocate a fresh instance per primitive every time
 *     (the old inline hook did, and never released them).
 *   - REMEMBER the GLB's own MaterialInstances, so returning to a shader-free look
 *     actually reverts instead of needing a reload.
 */
const entityCache = new WeakMap<
  object,
  { original: any[] | null; byStyle: Map<string, any[]> }
>();

function slotsFor(entity: Entity) {
  const key = entity as unknown as object;
  let slots = entityCache.get(key);
  if (!slots) {
    slots = { original: null, byStyle: new Map() };
    entityCache.set(key, slots);
  }
  return slots;
}

/**
 * Apply the current look's material to `entity`, or restore the GLB's own.
 *
 * Call AFTER a component's other material effects (applyThemeMaterial) so it wins.
 */
export function useShaderOverride(
  entity: Entity | null,
  def: PartDef,
  style: ShaderStyleId,
  override?: MaterialParams,
) {
  const { engine, renderableManager, workletContext } = useFilamentContext();

  // useBuffer can't be called conditionally; load whichever source is active and let
  // the effect decide whether to use it. ("off" still needs a source, so park on the
  // ink buffer — it is cached and never applied.)
  const buffer = useBuffer({
    source: style === "off" ? SOURCES.ink : SOURCES[style],
    releaseOnUnmount: false,
  });
  const grain = useBuffer({ source: GRAIN_MAP, releaseOnUnmount: false });

  // The material resolves ASYNCHRONOUSLY (it is built on the render thread), so this
  // state is what re-runs the apply-effect once it lands. Until then the part keeps its
  // GLB material — a visible frame or two of plain wood, never a black or white part.
  const [material, setMaterial] = useState<any>(null);
  useEffect(() => {
    if (style === "off" || !buffer) return;
    if (style === "ink" && USE_TEXTURE && !grain) return; // texture not loaded yet
    let live = true;
    ensureMaterial(style, engine, renderableManager, workletContext, buffer, grain)
      .then((m) => {
        if (live) setMaterial(m);
      })
      .catch((e) => {
        // A .filamat built by a matc from a different Filament version fails HERE.
        if (__DEV__) console.log(`[shader:${style}] material failed`, e);
      });
    return () => {
      live = false;
    };
  }, [style, engine, renderableManager, workletContext, buffer, grain]);

  useEffect(() => {
    if (!entity || !engine || !renderableManager) return;

    const slots = slotsFor(entity);
    const count = renderableManager.getPrimitiveCount(entity);

    // Snapshot the GLB's own instances once, before anything overwrites them.
    if (!slots.original) {
      slots.original = Array.from({ length: count }, (_, i) =>
        renderableManager.getMaterialInstanceAt(entity, i),
      );
    }

    const skip = style !== "off" && METAL_GROUPS.includes(def.group);

    // Shader-free look (or a group that opts out) → put the GLB's materials back.
    if (style === "off" || skip) {
      slots.original.forEach((mi, i) =>
        renderableManager.setMaterialInstanceAt(entity, i, mi),
      );
      return;
    }

    if (!material) return; // still being built on the render thread

    try {
      // Reuse this entity's instances for this style if we already made them.
      let instances = slots.byStyle.get(style);
      if (!instances) {
        const p = paramsFor(style, def, override);
        instances = Array.from({ length: count }, () => {
          const mi = material.createInstance();
          for (const [name, v] of Object.entries(p.float3)) {
            mi.setFloat3Parameter(name, v as [number, number, number]);
          }
          for (const [name, v] of Object.entries(p.float)) {
            mi.setFloatParameter(name, v);
          }
          return mi;
        });
        slots.byStyle.set(style, instances);
      }

      instances.forEach((mi, i) =>
        renderableManager.setMaterialInstanceAt(entity, i, mi),
      );
      if (__DEV__) console.log(`[shader:${style}] ${def.meshName}: ${count} prim(s)`);
    } catch (e) {
      // The part keeps its GLB material rather than disappearing.
      if (__DEV__) console.log(`[shader:${style}] failed ${def.meshName}`, e);
    }
    // `engine` is deliberately absent: this effect only creates MaterialInstances from
    // an already-built `material`. The engine belongs to the effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style, entity, material, renderableManager, def, override]);
}