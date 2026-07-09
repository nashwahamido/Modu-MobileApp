import { useEffect, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import {
  Camera,
  EnvironmentalLight,
  FilamentView,
  Light,
  ModelRenderer,
  useBuffer,
  useCameraManipulator,
  useFilamentContext,
  useModel,
} from "react-native-filament";
import { useGameStore } from "@/src/adhd/core/store";
import { FOCAL_LENGTH_MM } from "./cameraConfig";
import { getLightRig, IBL_INTENSITY } from "./lighting";
import type { OffsetDriver } from "./offsetDriver";
import { PartModel } from "./PartModel";
import { ToolModel } from "./ToolModel";
import { SceneState } from "./useSceneState";

export type OrbitManipulator = ReturnType<typeof useCameraManipulator>;

// Real cast shadow: an invisible ground plane + a compiled shadow-catcher
// material (shadingModel:unlit, shadowMultiplier:true, transparent). The plane
// receives the table's shadow from the directional key light and shows ONLY the
// shadow (transparent elsewhere), so it reads as a real shadow on the floor/
// backdrop rather than a fake blob stuck under the table.
const SHADOW_PLANE_MODEL = require("@/src/adhd/assets/models/furniture-models/LACK/shadow_plane.glb");
const SHADOW_CATCHER_MAT = require("@/src/adhd/assets/materials/shadow_catcher.filamat");

// Stable IBL source. MUST be a module constant, not an inline `{ uri }` object:
// an inline object is a new reference every render, which makes EnvironmentalLight
// reload the environment buffer each time and can race into "FilamentBuffer has
// already been manually released" during rapid re-renders.
const IBL_SOURCE = { uri: "RNF_default_env_ibl.ktx" };
// Assembly floor (leg feet) is at pose y≈0; drop a hair below to avoid z-fight.
const SHADOW_FLOOR_Y = -0.004;
// Near-straight-down light direction for the contact shadow. The small x/z tilt
// lets the shadow peek out just past the table edge (toward back-left, matching
// the key light) instead of hiding perfectly underneath.
const SHADOW_CASTER_DIR: [number, number, number] = [-0.1, -1, -0.12];

// Custom Filament toon (cel) shader — a compiled .filamat (material version 68,
// matching react-native-filament's Filament build). Applied at runtime to the
// tabletop + legs when the Toon test toggle is on, replacing their PBR wood
// material with banded diffuse shading in the calendula colour. Bolts and the
// outline hull are left untouched.
const TOON_MATERIAL_SRC = require("@/src/adhd/assets/materials/toon.filamat");
// calendula gold (#c8862a) in linear space for the shader's baseColor param.
const CALENDULA: [number, number, number] = [0.5776, 0.2384, 0.0232];
// Parts to toon-shade: everything except the metal fasteners.
const TOON_SKIP_GROUP = "screw115980";

function ShadowCatcher() {
  const model = useModel(SHADOW_PLANE_MODEL);
  const { transformManager, renderableManager, engine } = useFilamentContext();
  const worldShift = useGameStore((s) => s.worldShift);
  const matBuffer = useBuffer({
    source: SHADOW_CATCHER_MAT,
    releaseOnUnmount: false,
  });
  const material = useMemo(() => {
    if (!engine || !matBuffer) return null;
    try {
      return engine.createMaterial(matBuffer);
    } catch (e) {
      if (__DEV__) console.log("[shadow] createMaterial failed", e);
      return null;
    }
  }, [engine, matBuffer]);
  const applied = useRef(false);

  // Apply the shadow-catcher material + make the plane a shadow receiver (once).
  useEffect(() => {
    if (applied.current || model.state !== "loaded" || !material) return;
    const entity =
      model.asset.getFirstEntityByName("shadow_catcher") ?? model.rootEntity;
    try {
      const prims = renderableManager.getPrimitiveCount(entity);
      for (let i = 0; i < prims; i++) {
        renderableManager.setMaterialInstanceAt(entity, i, material.createInstance());
      }
      renderableManager.setReceiveShadow(entity, true);
      renderableManager.setCastShadow(entity, false);
      applied.current = true;
      if (__DEV__) console.log("[shadow] catcher ready");
    } catch (e) {
      if (__DEV__) console.log("[shadow] apply failed", e);
    }
  }, [model, material, renderableManager]);

  // Sit on the floor, following the table-top drop offset.
  useEffect(() => {
    if (model.state !== "loaded") return;
    transformManager.setEntityPosition(
      model.rootEntity,
      [worldShift[0], SHADOW_FLOOR_Y + worldShift[1], worldShift[2]],
      false,
    );
  }, [model, transformManager, worldShift]);

  if (model.state !== "loaded") return null;
  return <ModelRenderer model={model} />;
}

interface Props {
  cameraManipulator: OrbitManipulator;
  sceneState: SceneState;
  heldDriver: OffsetDriver;
  sinkDriver: OffsetDriver;
}

/** The 3D workbench: camera, lights, and every part rendered by its game-state mode. */
export function AssemblyScene({
  cameraManipulator,
  sceneState,
  heldDriver,
  sinkDriver,
}: Props) {
  const furniture = useGameStore((s) => s.furniture);
  const style = useGameStore((s) => s.settings.style);
  // One combined GLB for the whole furniture. instanceCount=2: instance 0 is
  // the "world" copy parts live in (flush/loose/held); instance 1 is a free
  // ghost copy reused for socket hints, since a single mesh can't be in two
  // places (held + its empty socket) at once otherwise. The model is chosen by
  // the active visual style (falls back to the realistic default).
  const model = useModel(
    furniture?.styleModels?.[style] ?? furniture?.model ?? 0,
    { instanceCount: 2, addToScene: false },
  );

  const { modes, heldAction, activeTighten } = sceneState;

  const { engine, renderableManager } = useFilamentContext();
  const darkMode = useGameStore((s) => s.settings.darkMode);
  const lightingPreset = useGameStore((s) => s.settings.lightingPreset);
  const toonShader = useGameStore((s) => s.settings.toonShader);
  const rig = getLightRig(style, darkMode, lightingPreset);

  // ── Custom toon material (test) ───────────────────────────────────────────
  // Load the compiled .filamat, build one instance in the calendula colour, and
  // swap it onto the tabletop + leg entities once the model is loaded. Runs only
  // when the Toon toggle is on; toggling it remounts the scene (see the key in
  // GameScreen), so there's nothing to undo here — a fresh model loads with or
  // without the swap.
  const toonBuffer = useBuffer({
    source: TOON_MATERIAL_SRC,
    releaseOnUnmount: false,
  });
  // Hold the Material itself (not just an instance) so it isn't garbage-collected
  // — a collected Material releases its native resource and anything drawn with
  // its instances renders invisible.
  const toonMaterial = useMemo(() => {
    if (!toonShader || !engine || !toonBuffer) return null;
    try {
      return engine.createMaterial(toonBuffer);
    } catch (e) {
      if (__DEV__) console.log("[toon] createMaterial failed", e);
      return null;
    }
  }, [toonShader, engine, toonBuffer]);

  // Keep created instances referenced (same GC reason).
  const toonInstances = useRef<unknown[]>([]);
  const toonApplied = useRef(false);
  useEffect(() => {
    // Apply exactly once per mount. `useModel` returns a new object every render,
    // so depending on `model` (not `model.state`) would re-run this every frame
    // and leak a material instance per part each time → native OOM crash.
    if (toonApplied.current) return;
    if (!toonMaterial || model.state !== "loaded" || !furniture) return;
    const asset = model.asset; // narrowed to the loaded variant here
    const created: unknown[] = [];
    for (const id of Object.keys(furniture.parts)) {
      const def = furniture.parts[id];
      if (def.group === TOON_SKIP_GROUP) continue; // bolts stay metal
      const entity = asset.getFirstEntityByName(def.meshName);
      if (!entity) {
        if (__DEV__) console.log(`[toon] ${def.meshName}: entity NOT found`);
        continue;
      }
      const prims = renderableManager.getPrimitiveCount(entity);
      if (__DEV__) console.log(`[toon] ${def.meshName}: prims=${prims}`);
      for (let i = 0; i < prims; i++) {
        try {
          const inst = toonMaterial.createInstance(); // one per primitive
          inst.setFloat3Parameter("baseColor", CALENDULA);
          renderableManager.setMaterialInstanceAt(entity, i, inst);
          created.push(inst);
        } catch (e) {
          if (__DEV__) console.log(`[toon] apply failed ${def.meshName}#${i}`, e);
        }
      }
    }
    if (__DEV__) console.log(`[toon] applied ${created.length} instance(s)`);
    toonInstances.current = created;
    toonApplied.current = true;
  }, [toonMaterial, model.state, furniture, renderableManager]);

  // Ensure the table parts cast shadows onto the shadow-catcher plane (once).
  const castApplied = useRef(false);
  useEffect(() => {
    if (castApplied.current || model.state !== "loaded" || !furniture) return;
    const asset = model.asset;
    for (const id of Object.keys(furniture.parts)) {
      const entity = asset.getFirstEntityByName(furniture.parts[id].meshName);
      if (!entity) continue;
      try {
        renderableManager.setCastShadow(entity, true);
      } catch {
        // ignore
      }
    }
    castApplied.current = true;
  }, [model.state, furniture, renderableManager]);

  // TEMP diagnostic: confirms the LACK model loads and its meshes resolve.
  useEffect(() => {
    console.log("[LACK] model.state =", model.state);
    if (model.state === "loaded") {
      try {
        const ents = model.asset.getInstance().getEntities();
        const top = model.asset.getFirstEntityByName("whole_tableTop");
        console.log("[LACK] entities:", ents.length, "| whole_tableTop found:", !!top);
      } catch (e) {
        console.log("[LACK] asset introspection error:", String(e));
      }
    }
  }, [model.state]);

  if (!furniture) return null;

  return (
    <View style={styles.filament}>
    <FilamentView style={styles.filament}>
      <Camera
        cameraManipulator={cameraManipulator}
        focalLengthInMillimeters={FOCAL_LENGTH_MM}
      />
      <EnvironmentalLight
        source={IBL_SOURCE}
        intensity={IBL_INTENSITY}
      />
      <Light
        type="directional"
        colorKelvin={rig.key.colorKelvin}
        intensity={rig.key.intensity}
        direction={rig.key.direction}
      />
      <Light
        type="directional"
        colorKelvin={rig.fill.colorKelvin}
        intensity={rig.fill.intensity}
        direction={rig.fill.direction}
      />
      <Light
        type="directional"
        colorKelvin={rig.rim.colorKelvin}
        intensity={rig.rim.intensity}
        direction={rig.rim.direction}
      />
      {/* Dedicated near-overhead shadow caster — decoupled from the key light so
          the cast shadow sits directly under the table (contact shadow) without
          flattening the side-lit shading. Low intensity: it only needs to exist
          to render the shadow map; darkness is set by the catcher material. */}
      <Light
        type="directional"
        colorKelvin={5_000}
        intensity={8_000}
        direction={SHADOW_CASTER_DIR}
        castShadows
      />
      {modes.tableTop === "flush" || modes.tableTop === "loose" ? (
        <ShadowCatcher />
      ) : null}
      {Object.keys(furniture.parts).map((id) => (
        <PartModel
          key={id}
          def={furniture.parts[id]}
          mode={modes[id] ?? "hidden"}
          model={model}
          heldDriver={heldDriver}
          sinkDriver={sinkDriver}
          tightening={activeTighten?.partId === id}
          ghostAtLoosePose={heldAction?.type === "insertFastener"}
        />
      ))}
      {activeTighten?.tool && activeTighten.partId ? (
        <ToolModel key={activeTighten.actionId} action={activeTighten} />
      ) : null}
    </FilamentView>
    </View>
  );
}

const styles = StyleSheet.create({
  filament: { flex: 1 },
});