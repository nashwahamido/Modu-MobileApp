import type { ComponentIndex } from "@/src/game/core/model/components";

export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];

export interface PartPose {
  position: Vec3;
  rotation: Quat;
}

export type AssetSrc = number | { uri: string };

declare const __idBrand: unique symbol;
type Brand<K extends string> = { readonly [__idBrand]: K };
export type PartId = string & Brand<"PartId">;
export type GroupId = string & Brand<"GroupId">;
export type ActionId = string & Brand<"ActionId">;
export type ClusterId = string & Brand<"ClusterId">;
export type ComponentId = string & Brand<"ComponentId">;
export type LiaisonId = string & Brand<"LiaisonId">;

export type FurnitureId = string & Brand<"FurnitureId">;
export type BrandId = "IKEA" | "Others";
export type ToolId = "allenkey" | "mallet" | "hammer" | "screwdriver" | "hand";

export type ThemeId = "light" | "dark" | "high_contrast";
export type Handedness = "left" | "right";
export type RenderStyleId =
  | "realistic"
  | "cozy"
  | "cartoon"
  | "toon"
  | "illustrated";
export type BackdropId = "grid" | "clear" | "calm" | "craft" | "garden";

export type AssemblyMode = "free" | "guide" | "strict";
export type TextLevel = "standard" | "simple";

export interface BrandInfo {
  name: string;
  logo: number;
}
export interface ThumbSet {
  light: AssetSrc;
  dark?: AssetSrc;
  high_contrast?: AssetSrc;
}
export type ThumbMap = Record<GroupId, ThumbSet>;
export type ClusterThumbMap = Record<ClusterId, ThumbSet>;
export interface ToolInfo {
  label: string;
  icon: ThumbSet;
  asset?: AssetSrc;
}
export type ToolMap = Record<ToolId, ToolInfo>;

export type PartType = "structural" | "fastener";

export interface PartCore {
  partId: PartId;
  group: GroupId;
  meshName: string;
  type: PartType;
  cluster: ClusterId;
  pose: PartPose;
  visualCenterOffset?: Vec3;
  toolAnchor?: Vec3; // World-space offset from pose.position to the TOOL's contact point for this part's tighten (ToolModel)
  tool?: ToolId;

  noVisibilityGate?: boolean; //no visibility gate
}

// ------ for structral parts
export type JoinKind = "slide" | "screw" | "press" | "snap" | "hookAndSlot" | "hinge";

export type JoinArray = "pressJoins" | "slideJoins" | "screwJoins";

interface KindFacts {
  array: JoinArray | null; // the PartDef array whose targets lower to this kind; null when the kind has no flat form
  playable: boolean; // the engine can drive it today
  pressLike: boolean; // behaves as a press wherever code asks "is this a press edge"
  travel: "normal" | "shear" | null; // how the mover crosses the contact: along its normal, or shearing along the seam
}

// ONE row per kind, so every set below is DERIVED and a new kind cannot be half-added: `satisfies` refuses a missing row and the interface refuses a missing column. hookAndSlot absent from the travel column is exactly how a keyhole silently derived as a shear until 2026-09-02.
export const KIND_FACTS = {
  press: { array: "pressJoins", playable: true, pressLike: true, travel: "normal" },
  slide: { array: "slideJoins", playable: true, pressLike: false, travel: "shear" },
  screw: { array: "screwJoins", playable: true, pressLike: false, travel: "normal" },
  snap: { array: null, playable: true, pressLike: false, travel: "normal" },
  hookAndSlot: { array: null, playable: true, pressLike: true, travel: "normal" },
  hinge: { array: null, playable: false, pressLike: false, travel: null },
} as const satisfies Record<JoinKind, KindFacts>;

const kindsWhere = (p: (f: KindFacts) => boolean): ReadonlySet<JoinKind> =>
  new Set((Object.entries(KIND_FACTS) as [JoinKind, KindFacts][]).filter(([, f]) => p(f)).map(([k]) => k));

// The kinds that behave as a press in terms of deriving edges
export const PRESS_LIKE = kindsWhere((f) => f.pressLike);

// Each flat join array and the kind its targets lower to — the mapping Γ, the validator and the geometry deriver each used to spell out for themselves
export const JOIN_ARRAYS = (Object.entries(KIND_FACTS) as [JoinKind, KindFacts][])
  .filter((e): e is [JoinKind, KindFacts & { array: JoinArray }] => e[1].array !== null)
  .map(([kind, f]) => [f.array, kind] as const);

export interface StructuralFields {
  pressJoins?: readonly PartId[];
  slideJoins?: readonly PartId[];
  screwJoins?: readonly PartId[];
  seed?: boolean;
  unstable?: boolean;
  placeDir?: Vec3; // for slide/press: the parked state; also for visibility check
  parkBackoff?: number;

  stageOffset?: Vec3; // for staged part only

  lockDir?: Vec3; // Unit direction of the keyhole LOCK travel
  lockTravel?: number; // Meters of the lockDir travel; defaults to engagement.LOCK_TRAVEL_M.

  dropOn?: boolean; //paired with snap
  jointAnchor?: Vec3;
}

// -------- for fasteners
export type FastenerRole = "connector" | "securer" | "cap" | "extra";

// connector-only ordering facts
export interface FastenerPreload {
  completesOn: "insert" | "tighten";
  counterpartMountsBy: "press" | "screw";
}

// for fasteners that requires more than 2 steps
export interface FastenerLifecycle {
  drop?: { stage: number };
  insert?: { retract?: number; proud?: number };
}

//Validated and lowered at build time (derive/fasteners.ts); expanded into actions at runtime (composition/composeActions.ts)
export type FastenerDef =
  | {
      home: "liaison";
      role: "connector";
      preload: FastenerPreload;
      lifecycle?: FastenerLifecycle;
    }
  | { home: "liaison"; role: "securer"; lifecycle?: FastenerLifecycle }
  | { home: { extraOf: GroupId }; lifecycle?: FastenerLifecycle }
  | { home: "part"; lifecycle?: FastenerLifecycle };

export type FastenerEntry = FastenerDef & { tool?: ToolId };

export type FastenerMap = Record<GroupId, FastenerEntry>;

export interface FastenerFields {
  fastenerRole?: FastenerRole;
  preload?: FastenerPreload; //resent when `fastenerRole` is "connector"
  screwMover?: PartId;
  attached?: readonly PartId[];
  engageDir?: Vec3;
  headOffset?: Vec3;
  insertRetract?: number;
  insertStage?: number;
  insertProud?: number;
}
export interface PartDef extends PartCore, StructuralFields, FastenerFields {}

export interface OrientedBox {
  center: Vec3;
  axes: [Vec3, Vec3, Vec3];
  half: Vec3;
}

/** A part's world-space axis-aligned bounds at its BAKED pose. Harvested from Filament at model load; the unit the joint derivation works in. `obb` is optional so every min/max consumer (joint frames, hold reach) keeps working unchanged. */
export interface PartBox {
  min: Vec3;
  max: Vec3;
  obb?: OrientedBox;
}

/** Where two parts actually meet, derived per liaison at baked pose. `anchor` is the shared world contact point; the per-endpoint offsets are what the drag uses as hold/aim points, each clamped into its own part's bounds. */
export interface JointFrame {
  liaison: LiaisonId;
  anchor: Vec3; //the shared world contact point
  offsetA: Vec3;
  offsetB: Vec3;
  /** How the anchor was found: a direct box overlap, or via a fastener bridging an air gap. */
  via: "direct" | "bridge";
  /** Unit direction the contact FACES, from part A's surface toward part B — the thin axis of the direct overlap slab (a contact is a thin sheet, and its normal is the slab's smallest dimension), or the center-to-center line for a bridged joint. Facing is what visibility gating needs: a socket whose facing points away from the camera is on the far side of its own part, invisible no matter what occludes it. */
  facingA: Vec3;
}

export type RawPartDef = Omit<
  PartDef,
  | "partId"
  | "group"
  | "cluster"
  | "attached"
  | "pressJoins"
  | "slideJoins"
  | "screwJoins"
> & {
  partId: string;
  group: string;
  cluster: string;
  attached?: readonly string[];
  pressJoins?: readonly string[];
  slideJoins?: readonly string[];
  screwJoins?: readonly string[];
};

export interface Liaison {
  id: LiaisonId;
  a: PartId;
  b: PartId;
  kind?: JoinKind;
  mover?: PartId;
}
export type LiaisonMap = Record<LiaisonId, Liaison>;

// Exit-sweep blockers per structural part, per cardinal direction
export type SweepDirKey = "+x" | "-x" | "+y" | "-y" | "+z" | "-z";
export type SweepMap = Record<PartId, Partial<Record<SweepDirKey, readonly PartId[]>>>;

export type JointGeometry = Record<PartId, { placeDir?: Vec3; lockDir?: Vec3 }>;

export interface ClusterCombine {
  kind: "slide" | "screw";
  onto: readonly ClusterId[];
  dir: Vec3;
  back?: number; // How far off its seat this cluster parks before the drive gesture; defaults to SLIDE_BACKOFF_M
}

export interface ClusterDef {
  id: ClusterId;
  label: string;
  requires?: readonly ClusterId[];
  seed?: boolean;
  combine?: ClusterCombine;
}

export type ActionType =
  | "stagePart"
  | "placePart"
  | "placeFastener"
  | "insertFastener"
  | "tightenFastener"
  | "reorient"
  | "setAside"
  | "combineClusters"
  | "verify";

// How a tighten/drive looks. Resolved from HARDWARE.motion ?? the kind default.
export type DriveMotion = "spin" | "turn" | "strike" | "press" | "drawTurn";

export interface AssemblyAction {
  actionId: ActionId;
  type: ActionType;
  stage: number;
  order: number;
  partId?: PartId;
  cluster?: ClusterId;
  tool?: ToolId;
  motion?: DriveMotion;
  requires: readonly ActionId[];
  requiresAny?: readonly ActionId[];
  gate?: string;
}

export type Gate = (done: ReadonlySet<ActionId>) => boolean;

export type DraftAction = Omit<AssemblyAction, "order">;

export interface InstructionContent {
  text?: string;
  simpleText?: string;
  steps?: readonly string[];
}

export type InstructionSet = Record<ActionId, InstructionContent>;

export interface LabelSet {
  standard: string;
  simple?: string;
  audio?: number;
}
export type LabelMap = Record<GroupId, LabelSet>;

export interface PushOpenGroup {
  level: string;
  ratio: number;
  parts: readonly PartId[];
}
export interface PushOpenSpec {
  axis: Vec3;
  distance: number; //full open
  popDistance?: number; // How far the push-latch spring ejects the drawer on a press
  beatActionId?: string;
  testActionIds?: Readonly<Record<string, string>>;
  groups: readonly PushOpenGroup[];
}

//A set of bodies the player handles as one object
export interface ComponentDef {
  id: ComponentId;
  label: LabelSet;
  bodies: readonly PartId[]; //Every body the gesture places, INCLUDING the lead. Must be ≥2
  lead: PartId; // The body whose place action the gesture drives; siblings ride its completion.
  thumb?: ThumbSet;
}
export type ComponentMap = Record<ComponentId, ComponentDef>;

export interface MaterialParams {
  baseColor?: Vec3;
  emissive?: Vec3;
  metallic?: number;
  roughness?: number;
  baseColorMap?: AssetSrc;
  materialId?: string;
}
export interface FurnitureMeta {
  id: FurnitureId;
  thumbnail: ThumbSet;
  variantThumbnails?: Record<string, ThumbSet>;
  mode?: AssemblyMode; // override avatar mode; can be changed
  partCount: number;
  stageCount: number;
  stepCount: number;
  clusterCount: number;
}
export interface Furniture {
  meta: FurnitureMeta;
  model: AssetSrc;
  parts: Record<PartId, PartDef>;
  actions: readonly AssemblyAction[];
  gates?: Record<string, Gate>;
  liaisons?: LiaisonMap;
  clusters?: Record<ClusterId, ClusterDef>;
  thumbs: ThumbMap;
  clusterThumbs?: ClusterThumbMap;
  clusterVariantThumbs?: Record<string, ClusterThumbMap>;
  styleModels?: Partial<Record<RenderStyleId, AssetSrc>>;
  shadow?: AssetSrc;
  tools?: Partial<ToolMap>;
  instructions: InstructionSet;
  labels: LabelMap;
  pushOpen?: PushOpenSpec;
  sweep?: SweepMap;
  components?: ComponentIndex;
  xpPerStep: number;
  xpBonusOnComplete: number;
}