// The vocabulary every other core file is written in: ids, part definitions, actions, and the furniture bundle that carries them. See README for the fields whose presence changes how a step behaves.

import type { ComponentIndex } from "@/src/game/core/model/components";

// --------------- math
export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];

export interface PartPose {
  position: Vec3;
  rotation: Quat;
}

export type AssetSrc = number | { uri: string };

// --------------- ids
// Branded, so one id can never be passed where another is meant. Cast through ids.ts.
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

// --------------- look axes (each independent of the others)
export type ThemeId = "light" | "dark" | "high_contrast";
/** Which hand drives the build. NOT an accessibility setting — see README. */
export type Handedness = "left" | "right";
/** How the furniture is rendered. Two mechanisms, one axis:
 *    realistic | cozy | cartoon   → the GLB is the look (Furniture.styleModels)
 *    toon | illustrated           → the MATERIAL is the look (scene/shaders.ts) */
export type RenderStyleId =
  | "realistic"
  | "cozy"
  | "cartoon"
  | "toon"
  | "illustrated";
export type BackdropId = "grid" | "clear" | "calm" | "craft" | "garden";

// --------------- how the task is gated
export type AssemblyMode = "free" | "guide" | "strict";
export type TextLevel = "standard" | "simple";

// --------------- catalogue / HUD furniture
export interface BrandInfo {
  name: string;
  logo: number;
}
// One image per theme; only `light` is required, the others fall back to it.
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
  asset?: AssetSrc; // the 3D model, for when the tool is shown working
}
export type ToolMap = Record<ToolId, ToolInfo>;

// --------------- parts
export type PartType = "structural" | "fastener";

// How a placement is DRIVEN once the part is parked at its seat.
export type JoinKind = "slide" | "screw" | "press";

export type FastenerKind = "threaded" | "pin" | "cam" | "secured";

// What every part has, fastener or not.
export interface PartCore {
  partId: PartId;
  group: GroupId; // the tray card parts share — identical legs are one card
  meshName: string; // the node in the GLB
  type: PartType;
  cluster: ClusterId;
  pose: PartPose; // the assembled (baked) pose; everything else derives from it
  visualCenterOffset?: Vec3; // pose.position → the mesh bounds centre, world-space
  toolAnchor?: Vec3; // pose.position → where the TOOL works, when that is not the origin
  tool?: ToolId;
}

export interface StructuralFields {
  directJoins?: readonly PartId[]; // parts this one simply touches
  slideJoins?: readonly PartId[]; // parts it must glide into
  screwJoins?: readonly PartId[]; // parts it threads into
  seed?: boolean; // seats first and joins nothing
  unstable?: boolean; // cannot stand until a partner holds it
  placeDir?: Vec3; // authored travel direction, overriding the derived one
  parkBackoff?: number; // park distance (m), overriding the engagement default
  stageOffset?: Vec3; // assembled pose → SUB-ASSEMBLY rest pose; presence makes the part staged
  lockDir?: Vec3; // keyhole LOCK travel; presence makes the press two-phase
  lockTravel?: number; // meters of that travel; defaults to LOCK_TRAVEL_M
  dropOn?: boolean; // force a plain snap, no drive gesture
  jointAnchor?: Vec3; // authored override for the drag hold/aim anchor. None authored today
}

export interface FastenerFields {
  fastenerKind?: FastenerKind;
  screwMover?: PartId; // the part that TURNS, if it is not the fastener
  attached?: readonly PartId[]; // what this fastener holds together
  engageDir?: Vec3; // unit direction it travels as it goes in
  headOffset?: Vec3; // GENERATED: pose.position → the centre of the head face
  insertRetract?: number; // meters it sits RETRACTED into its carrier at insert
  insertStage?: number; // opt-in to the 3-phase lifecycle: meters it waits outside the hole
  insertProud?: number; // meters the LOOSE pose sits proud of flush; 0 = insert lands flush
}
export interface PartDef extends PartCore, StructuralFields, FastenerFields {}

// --------------- derived geometry (generated, never authored — all optional, all with a fallback)
// The same box in the part's OWN frame: `axes` are the frame's unit directions in world space.
export interface OrientedBox {
  center: Vec3;
  axes: [Vec3, Vec3, Vec3];
  half: Vec3;
}

// A part's world AABB at its BAKED pose, from boxes.gen.ts (derive-boxes).
export interface PartBox {
  min: Vec3;
  max: Vec3;
  obb?: OrientedBox; // optional, so every min/max consumer keeps working
}

// Where two parts actually meet, derived per liaison at baked pose.
export interface JointFrame {
  liaison: LiaisonId;
  anchor: Vec3; // the shared world contact point
  offsetA: Vec3; // the drag's hold/aim point on A, clamped into A's bounds
  offsetB: Vec3;
  via: "direct" | "bridge"; // a box overlap, or a fastener across an air gap
  facingA: Vec3; // the direction the contact FACES, from A toward B — what visibility gating needs
}

// The authored shape, before ids.ts brands the strings.
export type RawPartDef = Omit<
  PartDef,
  | "partId"
  | "group"
  | "cluster"
  | "attached"
  | "directJoins"
  | "slideJoins"
  | "screwJoins"
> & {
  partId: string;
  group: string;
  cluster: string;
  attached?: readonly string[];
  directJoins?: readonly string[];
  slideJoins?: readonly string[];
  screwJoins?: readonly string[];
};

// --------------- liaisons: one connection between two parts
export interface Liaison {
  id: LiaisonId;
  a: PartId;
  b: PartId;
  kind?: JoinKind;
  mover?: PartId; // which end travels; the other is held
}
export type LiaisonMap = Record<LiaisonId, Liaison>;

// GENERATED exit-sweep blockers: who obstructs a part's exit corridor along each direction. A missing key means clear. Consumed by engagement.travelAxis — see README.
export type SweepDirKey = "+x" | "-x" | "+y" | "-y" | "+z" | "-z";
export type SweepMap = Record<PartId, Partial<Record<SweepDirKey, readonly PartId[]>>>;

// --------------- clusters: the sub-assemblies a build is split into
export interface ClusterDef {
  id: ClusterId;
  label: string;
  requires?: readonly ClusterId[];
  seed?: boolean; // the combine root: seats first, joins nothing. One per furniture
  slideJoins?: readonly ClusterId[]; // clusters this one slides onto at combine time
  placeDir?: Vec3; // the direction it TRAVELS as it seats. Authored: not derivable from poses
  parkBackoff?: number; // how far off its seat it parks; defaults to SLIDE_BACKOFF_M
  driveMotion?: "screw"; // absent = a straight glide; "screw" = it threads in, spinning about placeDir
}

// --------------- actions: one beat of the build each
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

/** How a tighten/drive LOOKS, from HARDWARE.motion ?? the kind default. `press` is one bare-hand push that seats the fastener outright; `drawTurn` draws it out along its axis into the receiver, then quarter-turns it to lock. */
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
  requires: readonly ActionId[]; // every one must be done
  requiresAny?: readonly ActionId[]; // any one will do
  gate?: string; // a named predicate in Furniture.gates, for what those two cannot say
}

export type Gate = (done: ReadonlySet<ActionId>) => boolean;

// `order` is assigned when the recipe is built, so authoring never has to count.
export type DraftAction = Omit<AssemblyAction, "order">;

// --------------- words shown to the player
export interface InstructionContent {
  text?: string;
  simpleText?: string; // used when settings.textLevel is "simple"
  steps?: readonly string[];
}

export type InstructionSet = Record<ActionId, InstructionContent>;

export interface LabelSet {
  standard: string;
  simple?: string;
  audio?: number; // the spoken clip for this label
}
export type LabelMap = Record<GroupId, LabelSet>;

// --------------- the drawer beat (EKET)
// One rigid group of the telescope and how far it travels, as a fraction of the full pull-out. Levels animate one after another.
export interface PushOpenGroup {
  level: string;
  ratio: number;
  parts: readonly PartId[];
}
// Which parts telescope, along which world axis, how far.
export interface PushOpenSpec {
  axis: Vec3;
  distance: number; // full open travel, in meters
  popDistance?: number; // how far the push-latch spring ejects it on a press
  beatActionId?: string; // plays the whole open/close as a passive tween on one beat
  testActionIds?: Readonly<Record<string, string>>; // level → its own drag-out-to-test beat. Author this or beatActionId, not both
  groups: readonly PushOpenGroup[];
}

// --------------- components: several bodies the player handles as one
// One tray card, one drag, one gesture. The bodies keep their own actions and poses — a component is a PRESENTATION unit, not a physical one.
export interface ComponentDef {
  id: ComponentId;
  label: LabelSet;
  bodies: readonly PartId[]; // every body the gesture places, INCLUDING the lead. Must be ≥2
  lead: PartId; // the body whose place action the gesture drives; siblings ride its completion
  thumb?: ThumbSet;
}
export type ComponentMap = Record<ComponentId, ComponentDef>;

// --------------- materials
export interface MaterialParams {
  baseColor?: Vec3;
  emissive?: Vec3;
  metallic?: number;
  roughness?: number;
  baseColorMap?: AssetSrc;
  materialId?: string;
}
export interface RenderStyle {
  shader?: "off" | "toon" | "ink"; // per-furniture override; the default per look is STYLE_SHADER in scene/shaders.ts
  material?: Record<string, MaterialParams>;
}
export type StyleSet = Partial<Record<RenderStyleId, RenderStyle>>;

// --------------- the furniture bundle
// What the BUNDLE knows: its id, its artwork, and counts derived from the recipe. Everything a human authors — name, brand, type, duration, link — lives in item_build and is read through the catalogue store.
export interface FurnitureMeta {
  id: FurnitureId;
  thumbnail: ThumbSet;
  variantThumbnails?: Record<string, ThumbSet>; // catalogue art per finish, keyed by the item_variants `variation`; missing art degrades to the plain tile
  mode?: AssemblyMode; // the mode this build OPENS in, outranking PROFILE_MODE. A default only — a save beats it (README)
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
  clusterVariantThumbs?: Record<string, ClusterThumbMap>; // sub-assembly art per finish; falls back per cluster, so art can ship one stage at a time
  styles?: StyleSet;
  styleModels?: Partial<Record<RenderStyleId, AssetSrc>>; // the looks that are a whole other GLB
  shadow?: AssetSrc;
  tools?: Partial<ToolMap>;
  instructions: InstructionSet;
  labels: LabelMap;
  pushOpen?: PushOpenSpec; // absent = the finishing beat stays symbolic
  sweep?: SweepMap; // absent = travelAxis keeps its centroid heuristic unchecked
  boxes?: Record<PartId, PartBox>; // absent = the drag falls back to the visual-centre clamp
  components?: ComponentIndex; // absent = no multi-body components
  xpPerStep: number;
  xpBonusOnComplete: number;
}
