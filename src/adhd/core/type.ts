//finished

// This is where the universal type definitions sit

// ------------------ 3D primitives --------------------
// postion: xyz
export type Vec3 = readonly [number, number, number];
// quanternion: xyzw
export type Quat = readonly [number, number, number, number];

// ------------------- asset source -------------------
// furniture model source: a bundled module, or a remote URL
export type AssetSrc = number | { uri: string };

// furniture list
export type FurnitureId = "DALFRED" | "LACK";

/** Visual style presets — swaps the table's look and the backdrop. */
export type FurnitureStyle = "realistic" | "cozy" | "cartoonish";

/** Lighting rig choice. "auto" = each style's natural default. */
export type LightingChoice = "auto" | "studio" | "warm" | "soft" | "golden";
// meta data - easy to load
export interface FurnitureMeta {
  id: FurnitureId;
  name: string;
  thumbnail: number; // furniture thumbnail
  difficulty: 1 | 2 | 3;
  partCount: number; // counted by unique partId (instances)
  stageCount: number;
  stepCount: number;
}
// real model+task data - load when chosen to assemble
export interface Furniture {
  meta: FurnitureMeta;
  model: AssetSrc; // one combined GLB (the "realistic" default)
  /** Optional per-style model overrides; falls back to `model`. */
  styleModels?: Partial<Record<FurnitureStyle, AssetSrc>>;
  parts: Record<string, PartDef>; // -> check PartDef in this script
  actions: readonly AssemblyAction[]; // -> check AssemblyAction[] in this script
  gates: Record<string, Gate>; // -> check Gate in this script
  thumbs: Record<string, number>; // thumbnail of all parts
  instructions: InstructionSet; // step text, for different profiles
  labels: LabelMap; // part display names, for different profiles
  xpPerStep: number;
  xpBonusOnComplete: number;
}

// tool list
export type ToolId = "allenkey" | "mallet" | "hammer" | "screwdriver" | "hand";

// -------------------- furniture parts --------------------
export type PartType = "structural" | "fastener"; // e.g. chair leg | screw

export interface PartPose {
  position: Vec3;
  rotation: Quat;
}

export interface PartDef {
  partId: string; // instance id:  'leg_1'   (unique — owns its pose)
  group: string; // BOM / interchange key:  'leg'   (all 4 legs share it)
  label?: string; // display name; supplied by the presentation layer (parts.ts), not the model
  meshName: string; // node name inside the combined furniture GLB
  type: PartType; // structural | fastener
  cluster: string; // the connected sub-assembly this part is part of, e.g. upper/lower part
  pose: PartPose; // pos & rot data
  attach?: string; // for fasteners - the part they are dependent on
  engageDir?: Vec3; // insertion axis; only fasteners have one
  placeOnDrop?: boolean; // snap on position alone (no twist-to-lock), e.g. a flat top you just set down
  tool?: ToolId;
}

// BOM: bill of materials
export interface BomEntry {
  group: string;
  label: string;
  count: number; // number of repetitive
  thumb?: number; // one representative thumbnail for this group
}

// ------------------- assembly actions ---------------------
// action types - related to task progression
export type ActionType =
  | "snapPart"
  | "insertFastener"
  | "tightenFastener"
  | "reorient"
  | "setAside"
  | "combine";

// assembly process
export interface AssemblyAction {
  actionId: string;
  type: ActionType;
  stage: number;
  partId?: string; // part needed for this step
  cluster?: string; // which cluster need to be focused
  tool?: ToolId;
  requires: readonly string[]; // a static list of steps that must be done
  gate?: string; // a dynamic rule computed over the whole state
}

export type Gate = (done: ReadonlySet<string>) => boolean;

// ---------------- instruction: for different user preferences -----------
export interface InstructionContent {
  text?: string; // standard wording
  simpleText?: string; // simplified wording
  minimalText?: string; // ultra-concise
  steps?: readonly string[]; // broken into micro-steps
  pictogram?: number; // image asset
  symbols?: readonly number[]; // AAC symbol sequence
  audioCue?: number; // audio asset
}

export type InstructionSet = Record<string /* actionId */, InstructionContent>;

// ---------------- labels: part display names per profile ----------
export type TextLevel = "standard" | "simple" | "minimal";
export interface LabelSet {
  standard: string;
  simple?: string; // shown at textLevel "simple"
  minimal?: string; // shown at textLevel "minimal"
  symbol?: number; // optional AAC/pictogram asset
}
export type LabelMap = Record<string /* group */, LabelSet>;