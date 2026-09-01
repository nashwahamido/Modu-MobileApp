// The shader-override layer: swaps a part's GLB material for a compiled Filament material, driven by the ACTIVE MODEL LOOK (`renderStyle`).
//
// The two ways a look can be built:
//   - swap the MODEL     (cozy, cartoon → LACK_cozy.glb / LACK_cartoon.glb, via furniture.styleModels — handled by AssemblyScene)
//   - swap the MATERIAL  (illustrated → ink.filamat — handled here)
// A look uses one or the other. `RenderStyle.toon` / `.outline` in core/type.ts were always the hook for this; `shader` replaces them with something the scene reads.
//
// Applied PER-ENTITY, not scene-wide: PartModel owns each entity and adds it to the scene, so a scene-level material apply is superseded by the components' own material effects.

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useBuffer, useFilamentContext } from "react-native-filament";
import type { Entity } from "react-native-filament";
import { useGameStore } from "@/src/game/core/store";
import { usePrefsStore } from "@/src/game/core/prefsStore";
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
/** The metal map: brushed steel, gradient flattened so it tiles without banding. */
/** .tex, not .png — PNG bytes, but the extension keeps it out of aapt's drawable table so Filament can find it in a release APK. See metro.config.js. */
const METAL_MAP = require("@/src/assets/textures/metal.tex");

/** Steel, not wood. LINEAR — a light neutral grey the map is tinted by. */
const METAL_BASE: Vec3 = [0.52, 0.53, 0.56];
/** Repeats per metre. A screw is ~10 mm across, so the map has to be dense to show any
 *  brushing at all at that size. */
const METAL_TILES = 24;

/**
 * The colour each hardware part actually IS, read off the base model.
 *
 * WHY A TABLE RATHER THAN TWO BUCKETS. This shader only ever had "wood" or "one grey metal", so
 * every piece of hardware came out the same tone — and EKET's runner assembly is not one tone: the
 * frames are galvanised steel (light), the R-side carriage and frame are near-black, the stabiliser
 * rod is mid aluminium, the cams and knobs are black plastic. One grey made half of it wrong, and
 * two buckets only moved which half.
 *
 * These values are AVERAGED FROM THE AUTHORED MATERIALS in EKET.glb — the base colour factor where
 * there is one, the mean of the base colour texture where there is not — so the wooden and realistic
 * looks agree by construction rather than by me matching them by eye.
 *
 * EKET ONLY, deliberately. LACK, BEKVAM and DALFRED are signed off as they are, and their hardware
 * is a single tone each, so the default below is already right for them. The same table can be
 * extended per model if that ever changes.
 */
const METAL_TINT: Record<string, Vec3> = {
  // UNIFIED, not white. These are authored in the panels' own "IKEA BASIC WHITE Foil", which is
  // invisible on the white realistic cabinet and stark white on any other — so one half of a
  // mirrored runner pair looked like a different component from the other. They take the runner
  // system's own plastic instead (Rationell grey, 0.015), matching what the GLB pass now writes for
  // cozy and cartoon so all three restyled looks show the same mechanism.
  screw109041: [0.015, 0.016, 0.018],
  dowel145572: [0.015, 0.016, 0.018],
  runnerCarriageL: [0.015, 0.016, 0.018],
  runnerClip: [0.015, 0.016, 0.018],
  suspCover: [0.015, 0.016, 0.018],
  suspCap: [0.015, 0.016, 0.018],
  screw110519: [0.015, 0.016, 0.018],
  cam139434: [0, 0, 0],
  dowel139435: [0, 0, 0],
  runnerBracketL: [0.452, 0.468, 0.480],
  runnerBracketR: [0.452, 0.468, 0.480],
  runnerCarriageR: [0.015, 0.016, 0.018],
  runnerFrameL: [0.452, 0.468, 0.480],
  // MATCHES runnerFrameL, and must. Both frames carry the same two materials — galvanised steel for
  // the rail, Rationell grey for the plastic — but the two meshes list them in opposite order, so
  // reading "the first material" gave the left frame steel and the right frame black, and the pair
  // rendered as two different components. Every L/R pair in this table is deliberately one value.
  runnerFrameR: [0.452, 0.468, 0.480],
  runnerMiddleL: [0.452, 0.468, 0.480],
  runnerMiddleR: [0.452, 0.468, 0.480],
  screw100349: [0.866, 0.866, 0.866],
  stabilizerRod: [0.408, 0.408, 0.408],
  suspBracket: [0, 0, 0],
  suspKnob: [0, 0, 0],
};

/**
 * How dark a metal's shadow sits under its base.
 *
 * REPLACED a fixed METAL_SHADE constant. One shadow colour for every metal meant a black plastic cam
 * got the same mid-grey shadow as a galvanised rail, which is a large part of why the darker parts
 * read as washed out. 0.105 is the ratio that constant already had against METAL_BASE, so bare steel
 * is unchanged and everything else now shades in its own colour.
 *
 * Steel's shadow still goes COLD where wood's goes brown — that comes from the tint itself now
 * rather than from a separate constant.
 */
const METAL_SHADE_RATIO = 0.105;

/** Rendered with the METAL map, not the wood.
 *
 *  These used to be SKIPPED entirely, keeping whatever material the GLB shipped — which is
 *  why an unlisted group silently came out looking like pine. They are now shaded like
 *  everything else, just out of a different box. */
const METAL_GROUPS: readonly string[] = [
  // LACK
  "bolt115980",
  // DALFRED — the hardware.
  "screw100212",
  "screw105251",
  "screw105298",
  "screw108443",
  "cap107675",
  // DALFRED — the structural metal. Not fasteners, but not timber either: the foot ring, the pin that locates the seat, and the plate the seat bolts down onto.
  "ringRail",
  "supportPin",
  "seatPlate",
  // DALFRED — the pole. Its material is "IKEA BLACK no 7 metal Text", so it was always metal; it was simply never listed, and a chrome stool leg in pine grain is the most visible version of this bug.
  "pole",
  // BEKVAM — black anodised aluminium. NOTE what is NOT here: dowel101350 is "IKEA BIRCH no 4", a genuinely WOODEN dowel, and it must keep the wood map. Being a fastener is not the test; the material is.
  "screw105111",
  "screw105215",
  // EKET — EVERY piece of hardware, at her instruction: "make sure the hardware in eket is all metal
  // in all cases". This is the one model where the material name cannot decide it. Its runner
  // carriages and clips ship with the PANELS' white foil, and its cams and dowels with black
  // plastic, so a name test leaves them inheriting whatever the body becomes — which is what put
  // pine grain on the drawer runners and cream on the clips.
  //
  // The whole runner assembly, both handed pairs, and the suspension rail go in together: they are a
  // single mechanism, and half of it in steel with the other half in timber is worse than either.
  "screw100349",
  "cam139434",
  "dowel139435",
  "stabilizerRod",
  "runnerBracketL",
  "runnerBracketR",
  "runnerFrameL",
  "runnerFrameR",
  "runnerMiddleL",
  "runnerMiddleR",
  "runnerCarriageR",
  "suspBracket",
  "suspCap",
  "suspKnob",
  // The WHITE PLASTIC hardware. These wear the panels' white foil in the base model, and for one
  // round they were left out of this list on the theory that they should follow the cabinet — which
  // put WOOD GRAIN on a plastic drawer carriage. They are hardware; they are simply pale hardware,
  // and their tint below says so.
  "screw109041",
  "screw110519",
  "dowel145572",
  "runnerCarriageL",
  "runnerClip",
  "suspCover",
  "suspCap",
  // NOT here, and deliberately: the cabinet and the drawer box — backPanel, sidePanel*, topPanel,
  // bottomPanel, drawerFront/Back/Bottom and drawerSide*. Those are the parts the finish is FOR.
];

// NOTE: ringRail, supportPin and seatPlate still have entries in ROUND and CAP_AXIS below. Those are now dead for these parts — the metal branch in the shader returns before either is read. Left in place because they are correct descriptions of the geometry, and they come straight back into use the moment a part is moved back to wood.

// ── ink palette (LINEAR, not sRGB — Filament parameters are linear) ──────────
/** The painted grain map. Multiplied by baseColor, so keep baseColor near white or the
 *  map's own colour gets tinted twice. */
const GRAIN_MAP = require("@/src/assets/textures/wood_grain.tex");
/** The SIDE map: coarse 6-plank timber for the edge band and the legs. A table is made of
 *  two kinds of board — a panel for the top, solid stock for the legs — and using one map
 *  on everything is the tell that a thing was textured rather than built. */
const SIDE_MAP = require("@/src/assets/textures/wood_grain_side.tex");

/** Repeats per metre for the side map. 6 planks per tile at 1.4 → ~120 mm boards, wider
 *  than a 49 mm leg, so no seam can ever run down one. */
const SIDE_TILES = 1.4;
/** How much darker the timber runs than the panel. Partly true — edge grain drinks more
 *  stain — and partly so the top keeps reading as the surface you're working ON. */
const SIDE_DARKEN = 0.12;

/** The object-space axis whose faces get the PANEL map. From the meshes' own bounding
 *  boxes: the table top is X=0.550 Y=0.550 Z=0.049, so Z is the thickness — its top and
 *  underside are panel, its four edges are timber. A leg has NO cap: it is solid stock on
 *  every face, so a zero vector puts timber everywhere. */
const CAP_AXIS: Record<string, Vec3> = {
  // LACK
  tableTop: [0, 0, 1],
  leg: [0, 0, 0],
  // DALFRED — every round part's flat faces are its caps, so cap axis = round axis.
  seat: [0, 0, 1],
  seatPlate: [0, 0, 1],
  ringRail: [0, 0, 1],
  circleUpp: [0, 0, 1],
  circleDown: [0, 0, 1],
  supportPin: [0, 0, 1],
  pole: [0, 0, 1],
};
const CAP_AXIS_DEFAULT: Vec3 = [0, 0, 0];

/**
 * ROUND parts: symmetry axis, radius, and which way the grain runs on the rim.
 *
 * Triplanar is a BOX projection — it blends three planar samples by how squarely the normal
 * faces each axis. On a curved rim the normal sweeps through every direction, so the blend
 * sweeps with it and the grain smears and swirls. No threshold fixes that; a cylinder is
 * simply not three planes. These parts get projected in their own coordinates instead:
 * angle around the axis, distance along it.
 *
 * Axes and radii read off the meshes' own bounding boxes — all of DALFRED's round parts are
 * symmetric about object Z:
 *   seat        0.294 x 0.295 x 0.025   → disc,     r 0.147
 *   ringRail    0.334 x 0.334 x 0.018   → ring,     r 0.167
 *   seatPlate   0.150 x 0.150 x 0.029   → disc,     r 0.075
 *   circleDown  0.169 x 0.169 x 0.021   → disc,     r 0.085
 *   circleUpp   0.123 x 0.123 x 0.021   → disc,     r 0.062
 *   pole        0.032 x 0.032 x 0.284   → CYLINDER, r 0.016
 *   supportPin  0.080 x 0.062 x 0.100   → stub,     r 0.040
 *
 * DALFRED's LEGS are left alone: they are 0.035 x 0.028 x 0.603 — near-rectangular stock,
 * and triplanar already reads correctly on them.
 */
interface RoundPart {
  /** Object-space symmetry axis. */
  axis: Vec3;
  /** Metres. Needed so the map wraps an INTEGER number of times around, or the +PI/-PI
   *  wrap leaves a seam. */
  radius: number;
  /** true = grain wraps AROUND the rim (a disc's edge, like bent edge-banding).
   *  false = grain runs ALONG the axis — a pole's grain runs down its length; it does not
   *  spiral around it. */
  around: boolean;
}
const ROUND: Record<string, RoundPart> = {
  seat: { axis: [0, 0, 1], radius: 0.147, around: true },
  ringRail: { axis: [0, 0, 1], radius: 0.167, around: true },
  seatPlate: { axis: [0, 0, 1], radius: 0.075, around: true },
  circleDown: { axis: [0, 0, 1], radius: 0.085, around: true },
  circleUpp: { axis: [0, 0, 1], radius: 0.062, around: true },
  supportPin: { axis: [0, 0, 1], radius: 0.04, around: true },
  pole: { axis: [0, 0, 1], radius: 0.016, around: false },
};
const NOT_ROUND: Vec3 = [0, 0, 0];

/** Set false to fall back to the shader's procedural planks (no texture, no render-thread
 *  upload). The material supports both; this flips the `useTexture` uniform. */
const USE_TEXTURE = true;

/** Tint over the map. White = the map's own colours, which is the point. */
const INK_BASE: Vec3 = [1.0, 1.0, 1.0];
/** The wood's own colour when the procedural path is used instead (#d8ab6b pine). */
const INK_BASE_PROCEDURAL: Vec3 = [0.699, 0.399, 0.153];
/** How many planks the MAP itself contains.
 *
 *  16, in a 2048 px map → 128 px per plank. The original crop held 32 planks in 1024 px,
 *  i.e. 32 px each, and was then MAGNIFIED across the table — which is why the grain looked
 *  soft and stretched. Fewer planks per tile at a bigger budget is what buys the density.
 *
 *  The map is 2048 ACROSS the grain and only 1024 along it: the detail — seams, strokes —
 *  all runs across, while along the grain the wood is smooth. Halving the axis that carries
 *  no information halves the file (1.9 MB, not 3.4) and costs nothing visible. */
const PLANKS_PER_TILE = 16;

/** Planks across the LACK top (0.55 m). This is the number to turn if the grain looks too
 *  coarse or too fine — and turning it UP also sharpens the result, because the map then
 *  tiles more often per metre of surface. Nothing is traded away. */
const PLANKS_ACROSS_TOP = 10;

/** Map repeats per METRE across the grain, derived rather than guessed:
 *      planks across a face = PLANKS_PER_TILE · length · TILES  */
const TEXTURE_TILES = PLANKS_ACROSS_TOP / (PLANKS_PER_TILE * 0.55);

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
// ── the POSTERISED toon palette ─────────────────────────────────────────────
//
// FOUR AUTHORED TONES. Not one colour plus lighten/darken — that is exactly what makes a cel shader look cheap, and the reference proves why:
//
//   deep #15345d   hue 214°  sat 77%  val 37%
//   mid  #295e92   hue 210°  sat 72%  val 57%
//   base #4194c3   hue 202°  sat 67%  val 77%
//   lift #8ad2e7   hue 194°  sat 40%  val 91%
//
// The shadow does not merely darken: the hue ROTATES 202° → 214° toward navy and the
// SATURATION CLIMBS 67% → 77%. It gets more colourful as it gets darker. The highlight goes the other way — brighter AND far less saturated — and it cannot be reached by mixing the base toward white at all (that would need 22% white in red but 56% in blue).
//
// The wood palette below is that exact structure carried onto the pine hue: the same hue rotation, the same saturation climb, the same value spread. Copying the RELATIONSHIPS rather than the numbers is what keeps it looking painted instead of computed. HONEYCOMB. Base #E8D48C — hue 47°, sat 40%, val 91%.
//
// The reference's structure, mirrored for a warm hue. A BLUE deepens by rotating UP into navy; a YELLOW deepens by rotating DOWN into amber and brown — yellow's dark neighbour is not olive. So the hue rotation flips sign while its magnitude, the saturation climb and the value spread all stay:
//
//   deep #826540   hue 34°  sat 51%  val 51%   ← more saturated as it darkens mid  #B89B66   hue 39°  sat 45%  val 72% base #E8D48C   hue 47°  sat 40%  val 91% lift #FFFADC   hue 51°  sat 14%  val 100%  ← brighter AND far less saturated
const TOON_DEEP: Vec3 = [0.2271, 0.1315, 0.048]; //  #826540
const TOON_MID: Vec3 = [0.4851, 0.3335, 0.132]; //   #B89B66
const TOON_BASE: Vec3 = [0.8122, 0.6661, 0.2674]; // #E8D48C
const TOON_LIFT: Vec3 = [0.9996, 0.9549, 0.7237]; // #FFFADC

/** The glint. Near-white, faintly warm, so it doesn't read as a pasted-on sticker. */
const TOON_SPEC: Vec3 = [1.0, 0.96, 0.88];

/** The reference's OWN blue, if you want the vinyl-toy look rather than stylised wood.
 *  Drop these into paramsFor's float3 block and reload — no recompile. */
export const TOON_BLUE = {
  deep: [0.0041, 0.0303, 0.1087] as Vec3, // #15345d
  mid: [0.0179, 0.1113, 0.2932] as Vec3, //  #295e92
  base: [0.0494, 0.3021, 0.5542] as Vec3, // #4194c3
  lift: [0.259, 0.6524, 0.8046] as Vec3, //  #8ad2e7
};


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

// `.filamat` is registered in metro.config.js assetExts and a require() resolves it to an asset id — exactly how the GLBs are pulled in by each furniture's index.ts. An ESM
// import would need a `declare module "*.filamat"` shim and would break that convention.
const SOURCES: Record<Exclude<ShaderStyleId, "off">, number> = {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  toon: require("@/src/assets/materials/toon_v2.filamat"),
  // ink_v2, not ink: a NEW asset path can't be served from a stale Metro/dev-client cache, and if it is missing Metro errors loudly. Filament SILENTLY IGNORES a setParameter for a name a material doesn't have, so a new shaders.ts against an old .filamat renders with no edges and no error — which is a miserable thing to debug.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ink: require("@/src/assets/materials/ink_v5.filamat"),
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
    return {
      float3: {
        deepColor: TOON_DEEP,
        midColor: TOON_MID,
        baseColor: override?.baseColor ?? TOON_BASE,
        liftColor: TOON_LIFT,
        specColor: TOON_SPEC,
        // Three edges on N·L → FOUR flat tones (deep, mid, base, lift). Pushed low because a single key light leaves a lot of the model below 0.5, and the reference's darkest band is a large region, not a sliver.
        bandEdges: [0.18, 0.45, 0.78],
      },
      float: {
        // The glint: a TIGHT blob with a hard edge. specPower sets its size, specThreshold cuts it off — that cut is what makes it a flat shape rather than a soft highlight, and it is the whole reason the surface reads as glossy vinyl instead of matte plastic.
        specPower: 48,
        specThreshold: 0.35,
        specStrength: 0.9,
        lightScale: 1,
        // A hard ramp turns shadow-map noise into a hard-edged dark PATCH rather than a soft smudge, so shadows stay off by default here — same reason as the ink look.
        shadowStrength: 0,
      },
    };
  }
  const metal = METAL_GROUPS.includes(def.group);
  // THREE buckets, not two: wood, bare steel, and black steel. The third exists because EKET's
  // runners and screws are black in every authored finish, and one metal colour for all hardware
  // turned the whole drawer mechanism light grey.
  // The part's own colour where the model states one, the default steel otherwise.
  const tint = metal ? (METAL_TINT[def.group] ?? METAL_BASE) : null;

  return {
    float3: {
      baseColor: tint ?? (override?.baseColor ?? (USE_TEXTURE ? INK_BASE : INK_BASE_PROCEDURAL)),
      // Steel's shadow is COLD; wood's is warm. Swapping this one colour is most of what separates the two materials — more than the texture does.
      shadeColor: tint
        ? ([
            tint[0] * METAL_SHADE_RATIO,
            tint[1] * METAL_SHADE_RATIO,
            tint[2] * METAL_SHADE_RATIO,
          ] as Vec3)
        : INK_SHADE,
      inkColor: INK_LINE,
      highlightColor: INK_HIGHLIGHT,
      keyDir: KEY_TO_LIGHT,
      grainAxis: GRAIN_AXIS[def.group] ?? GRAIN_AXIS_DEFAULT,
      // Which faces are PANEL and which are TIMBER. Table top → its thickness axis, so the top and underside are panel and the four edges are timber. Leg → zero: solid stock on every face.
      capAxis: CAP_AXIS[def.group] ?? CAP_AXIS_DEFAULT,
      // A zero axis means "not round" — keep the box (triplanar) path.
      roundAxis: ROUND[def.group]?.axis ?? NOT_ROUND,
    },
    float: {
      // wood — the panel map, the timber map, and the procedural fallback's knobs
      useTexture: USE_TEXTURE ? 1 : 0,
      textureTiles: TEXTURE_TILES,
      grainPhase: GRAIN_PHASE,
      sideTiles: SIDE_TILES,
      sideDarken: SIDE_DARKEN,
      // metal
      isMetal: metal ? 1 : 0,
      metalTiles: METAL_TILES,
      // The glint. Cel shading throws Filament's specular away, so steel has to grow its own — without a highlight it is just grey plastic.
      metalSpec: metal ? 0.55 : 0,
      metalSpecPower: 28,
      roundRadius: ROUND[def.group]?.radius ?? 0,
      rimAround: ROUND[def.group]?.around ? 1 : 0,
      // A crisp changeover, so panel gives way to timber ON the rounded corner — which is exactly where a real edge-banded top changes material.
      capSharp: 8,
      plankScale: PLANKS[def.group] ?? PLANKS_DEFAULT,
      grainScale: GRAIN_STROKES,
      grainStrength: 0.85,
      // cel ramp
      bands: 3,
      softness: 0.14,
      ambientLift: 0.42,
      // 1.0 is now NEUTRAL: the shader divides by PI like Filament's own Lambert, so this look is exposed the same as every other against the same rig.
      lightScale: 1,
      // Shadows OFF for this look. A cel ramp is brutally sensitive to shadow-map noise: any partial visibility lands the pixel in a different BAND, so acne that a smooth material hides as a faint smudge becomes a hard dark patch across half the table top. The ShadowPlane still grounds the model. Raise toward 1 if you want the legs to cast onto the top and can live with the speckle.
      shadowStrength: 0,
      // ── ink: OFF ──────────────────────────────────────────────────────────────────
      //
      // lineDarkness 0 kills every ink term at once — contour, crease and edge — because they are all multiplied by it. The parameters below stay wired up for a model whose edges are big enough to carry a line; on LACK they are not.
      //
      // Why they had to go: the fillet on these parts is a 1 mm radius on a 49 mm leg, which is about 0.6 PIXELS on a phone. Every geometry-derived outline draws a line exactly as wide as the model's own edge, so the line is SUB-PIXEL — and a sub-pixel line cannot hold still. It flickers between pixels as the camera moves, which is precisely the shakiness you saw. No threshold fixes that; the only stable outline is one whose width comes from somewhere other than the geometry (an inverted hull), and that read as a sticker border on a model this soft-edged.
      //
      // The faceted shading below is what separates the faces now: each one is a single flat tone, so the corner reads as a clean tonal step instead of a drawn line.
      lineDarkness: 0,
      contourPixels: 1.4,
      contourMaxFacing: 0.3,
      creaseThreshold: 0.6,
      creaseStrength: 0,
      edgeStart: 0.72,
      edgeEnd: 0.9,
      edgeInk: 0,
      highlightStrength: 0,

      // Snap the shading normal to the part's nearest axis, so a rounded corner takes its FACE's tone instead of sweeping a gradient between two faces. Without this, the cel ramp smears a soft band across every fillet — which is what reads as a pair of vague vertical stripes down each leg and a horizontal split along the table top's edge band. Flat faces + crisp corners is what makes an illustration read as drawn. Drop to 0 to see the difference; there is no in-between worth shipping.
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
  const renderStyle = usePrefsStore((s) => s.renderStyle);
  const styles = useGameStore((s) => s.furniture?.styles);
  return styleFor(styles, renderStyle)?.shader ?? STYLE_SHADER[renderStyle];
}

/** The active look's material + texture buffers, loaded ONCE for the whole scene and shared by every entity via context. RNF's useBuffer has no cache — when each entity loaded its own copies, every part MOUNT re-fetched ~4 assets, and a pickup/snap (which remounts 3-4 entity components) froze the JS thread for seconds while filament kept drawing the half-transitioned scene. */
type LoadedBuffer = ReturnType<typeof useBuffer>;
interface ShaderAssets {
  buffer?: LoadedBuffer;
  grain?: LoadedBuffer;
  side?: LoadedBuffer;
  metal?: LoadedBuffer;
}
const ShaderAssetsCtx = createContext<ShaderAssets>({});

/** Only mounted for a shader look ("toon"/"ink") — hooks can't be conditional, but a component boundary can be. */
function ShaderAssetsLoader({
  style,
  children,
}: {
  style: Exclude<ShaderStyleId, "off">;
  children: ReactNode;
}) {
  const buffer = useBuffer({ source: SOURCES[style], releaseOnUnmount: false });
  const grain = useBuffer({ source: GRAIN_MAP, releaseOnUnmount: false });
  const side = useBuffer({ source: SIDE_MAP, releaseOnUnmount: false });
  const metal = useBuffer({ source: METAL_MAP, releaseOnUnmount: false });
  const value = useMemo(
    () => ({ buffer, grain, side, metal }),
    [buffer, grain, side, metal],
  );
  return (
    <ShaderAssetsCtx.Provider value={value}>{children}</ShaderAssetsCtx.Provider>
  );
}

/** Wrap the scene's PartModels in this. The "off" look (realistic/cozy/cartoon) renders the GLB's own materials and must not touch the asset loader at all — it gets the empty context. */
export function ShaderAssetsProvider({ children }: { children: ReactNode }) {
  const style = useShaderStyle();
  return style === "off" ? (
    <>{children}</>
  ) : (
    <ShaderAssetsLoader style={style}>{children}</ShaderAssetsLoader>
  );
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
// KEYED ON THE ENGINE, never module-global by style alone. A Material belongs to the Engine that built it, and engine.createMaterial's deleter captures a STRONG shared_ptr<EngineImpl> (RNFEngineImpl.cpp, createMaterial) — so a module-scope entry outlives every scene teardown and pins that engine forever, GPU context and all. The failure signature is an engine that never logs "Destroying material..." and never logs "Destroying scene...", and the cost is ~460 MB per login until the OS jetsams the app.
// The second bug the old keying carried: a re-login builds a NEW engine but the cache still answered with the OLD engine's Material, handing engine B geometry built by engine A.
// Same WeakMap-per-engine shape as textureCaches in room/scene/useSurfaceTextures.ts and entityCache below, and it drops each engine's materials along with the engine.
const materialPromises = new WeakMap<object, Map<string, Promise<any>>>();

function ensureMaterial(
  style: Exclude<ShaderStyleId, "off">,
  engine: any,
  renderableManager: any,
  workletContext: any,
  buffer: any,
  grain: any,
  side: any,
  metal: any,
): Promise<any> {
  let byStyle = materialPromises.get(engine);
  if (!byStyle) {
    byStyle = new Map();
    materialPromises.set(engine, byStyle);
  }
  const existing = byStyle.get(style);
  if (existing) return existing;

  const metalTex = metal;
  const needsTexture = style === "ink" && USE_TEXTURE;

  // runAsync returns a worklets-core THENABLE, not a real Promise: it has .then but no
  // .catch, and it is not safe to await repeatedly. Promise.resolve adopts it once and hands back a genuine Promise, which is what makes it safe to cache here and await from all nine parts.
  const promise = Promise.resolve(
    workletContext.runAsync(() => {
      "worklet";
      const material = engine.createMaterial(buffer);
      if (needsTexture) {
        // Sampler params live on the Material's DEFAULT instance, so every instance made from it inherits the texture — one upload, nine parts. RNF binds with WrapMode::REPEAT, which is what makes the triplanar tiling work.
        material.setDefaultTextureParameter(renderableManager, "grainMap", grain, "sRGB");
        material.setDefaultTextureParameter(renderableManager, "sideMap", side, "sRGB");
        material.setDefaultTextureParameter(renderableManager, "metalMap", metalTex, "sRGB");
      }
      return material;
    }),
  );

  byStyle.set(style, promise);
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

  // Shared scene-level buffers (ShaderAssetsProvider) — an entity mount must never load assets itself; per-entity useBuffer re-fetched everything on every mode-transition remount and froze the JS thread (the pickup/snap stall). Empty context under the "off" look, which never reads them.
  const { buffer, grain, side, metal: metalTex } = useContext(ShaderAssetsCtx);

  // The material resolves ASYNCHRONOUSLY (it is built on the render thread), so this state is what re-runs the apply-effect once it lands. Until then the part keeps its GLB material — a visible frame or two of plain wood, never a black or white part.
  const [material, setMaterial] = useState<any>(null);
  useEffect(() => {
    if (style === "off" || !buffer) return;
    // BOTH maps must be uploaded before any instance is built: an instance copies the material's defaults AT CREATION, so one made before a sampler is bound reads black forever.
    if (style === "ink" && USE_TEXTURE && (!grain || !side || !metalTex)) return;
    let live = true;
    ensureMaterial(
      style,
      engine,
      renderableManager,
      workletContext,
      buffer,
      grain,
      side,
      metalTex,
    )
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
  }, [style, engine, renderableManager, workletContext, buffer, grain, side, metalTex]);

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

    // Metal groups are no longer skipped: they render through the same material with the metal map and a cold shadow. Only a shader-free LOOK falls back to the GLB.
    if (style === "off") {
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
      if (__DEV__) {
        const kind = METAL_GROUPS.includes(def.group) ? "METAL" : "wood";
        console.log(
          `[shader:${style}] ${def.meshName} (${def.group}) → ${kind}, ${count} prim(s)`,
        );
      }
    } catch (e) {
      // The part keeps its GLB material rather than disappearing.
      if (__DEV__) console.log(`[shader:${style}] failed ${def.meshName}`, e);
    }
    // `engine` is deliberately absent: this effect only creates MaterialInstances from an already-built `material`. The engine belongs to the effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style, entity, material, renderableManager, def, override]);
}