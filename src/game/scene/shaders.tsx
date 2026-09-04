import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useBuffer, useFilamentContext } from "react-native-filament";
import type { Entity } from "react-native-filament";
import { usePrefsStore } from "@/src/game/core/prefsStore";
import { DIR_KEY } from "./lighting";
import { MaterialParams, PartDef, RenderStyleId, Vec3 } from "@/src/game/core/type";

export type ShaderStyleId = "off" | "toon" | "ink";

export const STYLE_SHADER: Record<RenderStyleId, ShaderStyleId> = {
  realistic: "off",
  cozy: "off",
  cartoon: "off",
  toon: "toon",
  illustrated: "ink",
};

const METAL_MAP = require("@/src/assets/textures/metal.tex");

const METAL_BASE: Vec3 = [0.52, 0.53, 0.56];
const METAL_TILES = 24;

const METAL_TINT: Record<string, Vec3> = {
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
  runnerFrameR: [0.452, 0.468, 0.480],
  runnerMiddleL: [0.452, 0.468, 0.480],
  runnerMiddleR: [0.452, 0.468, 0.480],
  screw100349: [0.866, 0.866, 0.866],
  stabilizerRod: [0.408, 0.408, 0.408],
  suspBracket: [0, 0, 0],
  suspKnob: [0, 0, 0],
};

const METAL_SHADE_RATIO = 0.105;

const METAL_GROUPS: readonly string[] = [
  "bolt115980",
  "screw100212",
  "screw105251",
  "screw105298",
  "screw108443",
  "cap107675",
  "ringRail",
  "supportPin",
  "seatPlate",
  "pole",
  "screw105111",
  "screw105215",
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
  "screw109041",
  "screw110519",
  "dowel145572",
  "runnerCarriageL",
  "runnerClip",
  "suspCover",
  "suspCap",
];

const GRAIN_MAP = require("@/src/assets/textures/wood_grain.tex");
const SIDE_MAP = require("@/src/assets/textures/wood_grain_side.tex");

const SIDE_TILES = 1.4;
const SIDE_DARKEN = 0.12;

const CAP_AXIS: Record<string, Vec3> = {
  tableTop: [0, 0, 1],
  leg: [0, 0, 0],
  seat: [0, 0, 1],
  seatPlate: [0, 0, 1],
  ringRail: [0, 0, 1],
  circleUpp: [0, 0, 1],
  circleDown: [0, 0, 1],
  supportPin: [0, 0, 1],
  pole: [0, 0, 1],
};
const CAP_AXIS_DEFAULT: Vec3 = [0, 0, 0];

interface RoundPart {
  axis: Vec3;
  radius: number;
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

const USE_TEXTURE = true;

const INK_BASE: Vec3 = [1.0, 1.0, 1.0];
const INK_BASE_PROCEDURAL: Vec3 = [0.699, 0.399, 0.153];
const PLANKS_PER_TILE = 16;

const PLANKS_ACROSS_TOP = 10;

const TEXTURE_TILES = PLANKS_ACROSS_TOP / (PLANKS_PER_TILE * 0.55);

const GRAIN_PHASE = 0.5;
const INK_SHADE: Vec3 = [0.29, 0.15, 0.05];
const INK_LINE: Vec3 = [0.038, 0.021, 0.009];
const INK_HIGHLIGHT: Vec3 = [1.45, 1.4, 1.3];

const KEY_TO_LIGHT: Vec3 = [-DIR_KEY[0], -DIR_KEY[1], -DIR_KEY[2]];
const TOON_DEEP: Vec3 = [0.2271, 0.1315, 0.048]; //  #826540
const TOON_MID: Vec3 = [0.4851, 0.3335, 0.132]; //   #B89B66
const TOON_BASE: Vec3 = [0.8122, 0.6661, 0.2674]; // #E8D48C
const TOON_LIFT: Vec3 = [0.9996, 0.9549, 0.7237]; // #FFFADC

const TOON_SPEC: Vec3 = [1.0, 0.96, 0.88];

export const TOON_BLUE = {
  deep: [0.0041, 0.0303, 0.1087] as Vec3, // #15345d
  mid: [0.0179, 0.1113, 0.2932] as Vec3, //  #295e92
  base: [0.0494, 0.3021, 0.5542] as Vec3, // #4194c3
  lift: [0.259, 0.6524, 0.8046] as Vec3, //  #8ad2e7
};

const GRAIN_AXIS: Record<string, Vec3> = {
  tableTop: [1, 0, 0],
  leg: [0, 0, 1],
};
const GRAIN_AXIS_DEFAULT: Vec3 = [0, 0, 1];

const PLANKS: Record<string, number> = { tableTop: 7, leg: 2 };
const PLANKS_DEFAULT = 3;
const GRAIN_STROKES = 55;

const SOURCES: Record<Exclude<ShaderStyleId, "off">, number> = {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  toon: require("@/src/assets/materials/toon_v2.filamat"),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ink: require("@/src/assets/materials/ink_v5.filamat"),
};

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
        bandEdges: [0.18, 0.45, 0.78],
      },
      float: {
        specPower: 48,
        specThreshold: 0.35,
        specStrength: 0.9,
        lightScale: 1,
        shadowStrength: 0,
      },
    };
  }
  const metal = METAL_GROUPS.includes(def.group);
  const tint = metal ? (METAL_TINT[def.group] ?? METAL_BASE) : null;

  return {
    float3: {
      baseColor: tint ?? (override?.baseColor ?? (USE_TEXTURE ? INK_BASE : INK_BASE_PROCEDURAL)),
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
      capAxis: CAP_AXIS[def.group] ?? CAP_AXIS_DEFAULT,
      roundAxis: ROUND[def.group]?.axis ?? NOT_ROUND,
    },
    float: {
      useTexture: USE_TEXTURE ? 1 : 0,
      textureTiles: TEXTURE_TILES,
      grainPhase: GRAIN_PHASE,
      sideTiles: SIDE_TILES,
      sideDarken: SIDE_DARKEN,
      isMetal: metal ? 1 : 0,
      metalTiles: METAL_TILES,
      metalSpec: metal ? 0.55 : 0,
      metalSpecPower: 28,
      roundRadius: ROUND[def.group]?.radius ?? 0,
      rimAround: ROUND[def.group]?.around ? 1 : 0,
      capSharp: 8,
      plankScale: PLANKS[def.group] ?? PLANKS_DEFAULT,
      grainScale: GRAIN_STROKES,
      grainStrength: 0.85,
      bands: 3,
      softness: 0.14,
      ambientLift: 0.42,
      lightScale: 1,
      shadowStrength: 0,
      lineDarkness: 0,
      contourPixels: 1.4,
      contourMaxFacing: 0.3,
      creaseThreshold: 0.6,
      creaseStrength: 0,
      edgeStart: 0.72,
      edgeEnd: 0.9,
      edgeInk: 0,
      highlightStrength: 0,

      facetStrength: 1,
    },
  };
}

export function useShaderStyle(): ShaderStyleId {
  return STYLE_SHADER[usePrefsStore((s) => s.renderStyle)];
}

type LoadedBuffer = ReturnType<typeof useBuffer>;
interface ShaderAssets {
  buffer?: LoadedBuffer;
  grain?: LoadedBuffer;
  side?: LoadedBuffer;
  metal?: LoadedBuffer;
}
const ShaderAssetsCtx = createContext<ShaderAssets>({});

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

export function ShaderAssetsProvider({ children }: { children: ReactNode }) {
  const style = useShaderStyle();
  return style === "off" ? (
    <>{children}</>
  ) : (
    <ShaderAssetsLoader style={style}>{children}</ShaderAssetsLoader>
  );
}

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

  const promise = Promise.resolve(
    workletContext.runAsync(() => {
      "worklet";
      const material = engine.createMaterial(buffer);
      if (needsTexture) {
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

export function useShaderOverride(
  entity: Entity | null,
  def: PartDef,
  style: ShaderStyleId,
  override?: MaterialParams,
) {
  const { engine, renderableManager, workletContext } = useFilamentContext();

  const { buffer, grain, side, metal: metalTex } = useContext(ShaderAssetsCtx);

  const [material, setMaterial] = useState<any>(null);
  useEffect(() => {
    if (style === "off" || !buffer) return;
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

    if (!slots.original) {
      slots.original = Array.from({ length: count }, (_, i) =>
        renderableManager.getMaterialInstanceAt(entity, i),
      );
    }

    if (style === "off") {
      slots.original.forEach((mi, i) =>
        renderableManager.setMaterialInstanceAt(entity, i, mi),
      );
      return;
    }

    if (!material) return; // still being built on the render thread

    try {
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
      if (__DEV__) console.log(`[shader:${style}] failed ${def.meshName}`, e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style, entity, material, renderableManager, def, override]);
}