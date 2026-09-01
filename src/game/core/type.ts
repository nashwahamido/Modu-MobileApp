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
/** Which hand drives the build. NOT an accessibility SETTING: applyProfile replaces the settings object wholesale, so a handedness stored there would reset every time the player changed avatar. It sits beside theme and renderStyle as its own axis, for the same reason those do — it is a fact about the player, not a preference the profile has an opinion about. */
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

/** ONE vocabulary for joins, shared by `Liaison.kind` and the authoring union in model/joints.ts — `JoinKind` and a separate `JointKind` differed by one letter and meant overlapping things. Γ carries only `press`/`slide`/`screw` today; the rest are sayable so the authoring shape and the graph cannot drift apart, and each arrives in Γ as its lowering teaches it to (model/joints.ts). */
export type JoinKind = "slide" | "screw" | "press" | "snap" | "hookAndSlot" | "hinge";

/** The kinds that behave as a press wherever code asks "is this a press edge" — they all lower onto a press edge today, so a filter written as `kind === "press"` means THIS set and breaks silently once a keyhole states its own kind. `snap` is deliberately absent: no live edge carries it, and the fastener-secured edges about to be classified `snap` are `undefined` today, so excluding it is what keeps those filters seeing exactly the edges they see now. */
export const PRESS_LIKE: ReadonlySet<JoinKind> = new Set<JoinKind>(["press", "hookAndSlot"]);

export type FastenerKind = "threaded" | "pin" | "cam" | "secured";

export interface PartCore {
  partId: PartId;
  group: GroupId;
  meshName: string;
  type: PartType;
  cluster: ClusterId;
  pose: PartPose;
  /** World-space offset from pose.position to the mesh bounds center. */
  visualCenterOffset?: Vec3;
  /** World-space offset from pose.position to the TOOL's contact point for this part's tighten (ToolModel) — for when the node origin is not where the tool works (EKET suspension bracket: the origin sits on the plate, the screw hole at the circular boss ~1cm over). */
  toolAnchor?: Vec3;
  tool?: ToolId;
  /** Exempt this part's sockets from the drag's sightline visibility gate — they stay matchable from any angle the in-frame test allows. The escape hatch for a socket the gate's boxes over-block: the rule measures against AABB∩OBB, which is always fatter than the mesh, and where a part seats into a shallow face-on hole a millimetre of box fat is the whole threshold. Per part, never global — the gate is what stops a snap being earned against a hole the player cannot see. */
  noVisibilityGate?: boolean;
}
export interface StructuralFields {
  directJoins?: readonly PartId[];
  slideJoins?: readonly PartId[];
  screwJoins?: readonly PartId[];
  seed?: boolean;
  unstable?: boolean;
  placeDir?: Vec3;
  /** Park distance (m) for this part's slide/press staging, overriding the engagement defaults — small fittings park a few cm off their seat, not the panel-scale backoff. */
  parkBackoff?: number;
  /** World-space offset (m) from this part's assembled pose to its SUB-ASSEMBLY rest pose. Presence of this field is what makes a part staged: a `stagePart` beat is generated ahead of its placement, hardware attached to it may be fitted while it rests out there, and a second placement gesture carries the finished sub-assembly home (see model/staging.ts). */
  stageOffset?: Vec3;
  /** Unit direction of the keyhole LOCK travel — the short second shove after a press-fit's bolts enter their slots (EKET side↔top: press in along placeDir, then push down). Presence makes the press placement TWO-PHASE: the part parks backed off along BOTH legs, the press taps close the placeDir leg to the hooked pose, then a short drag along lockDir seats it and commits (HookPressControl). */
  lockDir?: Vec3;
  /** Meters of the lockDir travel; defaults to engagement.LOCK_TRAVEL_M. */
  lockTravel?: number;
  /** Force a plain snap placement even when a press/screw partner is already placed — the part just clicks home at drop with no drive gesture (EKET's suspension cover pushes over its bracket in the same motion that places it). */
  dropOn?: boolean;
  /** Authored override for this part's drag hold/aim anchor, world-space at baked pose. Replaces the part's RESOLVED anchor outright (the value the multi-joint centroid would produce), not any individual frame — authoring is per-part while frames are per-liaison. None authored today: all four shipped furnitures derive cleanly. */
  jointAnchor?: Vec3;
}
export interface FastenerFields {
  fastenerKind?: FastenerKind;
  screwMover?: PartId;
  attached?: readonly PartId[];
  engageDir?: Vec3;
  /** GENERATED world-space offset from pose.position to the centre of the HEAD FACE (the mesh's local −Z bbox face — the loose/head side the extractor derives engageDir from). ToolModel projects it onto the live tool axis so the tool contacts the head instead of hovering TIP_GAP off the part ORIGIN — which only looked right when a screw's half-length happened to equal the old 12mm gap (EKET ~24mm screws) and buried the driver 12–18mm into BEKVÄM's 47.5/60mm shafts. Projection (not the raw point) keeps it harmless where an authored engageDir override redirects the axis away from the mesh frame (EKET cams); an authored `toolAnchor` overrides it outright. */
  headOffset?: Vec3;
  /** Meters this fastener sits RETRACTED into its carrier at insert (−engageDir), instead of the default proud loose pose (+engageDir). Its `drawTurn` tighten then DRAWS it back OUT to flush while turning — the EKET stabiliser-rod dowels: pressed into the rod, then drawn into the slider hole and quarter-turned to lock. */
  insertRetract?: number;
  /** Opt-in to the 3-phase fastener lifecycle: meters the fastener sits at its STAGE pose (fully outside the hole, +engageDir) when first dropped from the tray. Presence splits the fastener into placeFastener (drag → stage) + insertFastener (PRESS gesture → loose) + tightenFastener (tool → flush). Absent ⇒ the classic 2-phase drag-to-loose insert + tighten. */
  insertStage?: number;
  /** Meters the LOOSE pose sits proud of flush (+engageDir); defaults to the global LOOSE_OFFSET_M. 0 = the insert lands FLUSH and the tighten happens in place — a cam lock drops fully into its housing and only TURNS (EKET's rear cams + pins, whose 2cm default proud poked out past the cabinet rear). */
  insertProud?: number;
}
export interface PartDef extends PartCore, StructuralFields, FastenerFields {}

/** The same box kept in the part's OWN frame: `axes` are the frame's unit directions in world space, `half` the half-extents along them, `center` in world. Tight where the world-aligned min/max is a slab of air — every splay in these GLBs lives in the node rotation, not the vertices (DALFRED leg: a 35mm stick whose AABB is a 192mm slab; BEKVAM leg: a 22mm plank in a 64mm AABB) — so the visibility gate measures sightlines and burial against this when present. AABB ⊇ OBB ⊇ mesh: still conservative, just far less wasteful. */
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
  anchor: Vec3;
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

export interface Liaison {
  id: LiaisonId;
  a: PartId;
  b: PartId;
  kind?: JoinKind;
  mover?: PartId;
}
export type LiaisonMap = Record<LiaisonId, Liaison>;

/** Exit-sweep blockers per structural part, per cardinal direction — GENERATED per furniture (helper-scripts/derive-sweep.mts) from final-pose geometry: the parts whose bodies obstruct this part's exit corridor along the key direction within its bounded park travel (cluster-scoped; the mover is eroded 4mm for fit clearance; fasteners excluded — their sequencing is the home lane). A missing key means the corridor is clear. Consumed by engagement.travelAxis for parts with NO authored placeDir: an entry travel `t` is order-viable when every already-placed blocker of the reverse corridor `-t` is one of the part's own joint partners. */
export type SweepDirKey = "+x" | "-x" | "+y" | "-y" | "+z" | "-z";
export type SweepMap = Record<PartId, Partial<Record<SweepDirKey, readonly PartId[]>>>;

/** Travel vectors DERIVED from the contact geometry at baked pose — GENERATED per furniture (helper-scripts/derive-joints.mts, math in model/jointGeometry.ts) so a direction is a fact about the mesh instead of a hand-typed vector that a re-export silently invalidates. Vectors ONLY, never join arrays: derivation answers "which way", never "who joins whom", so it can never fabricate a Γ edge. A part is absent when the derivation was undetermined — an absent key means whatever the part authors stands, so nothing changes. Consumed under the authored overlay by applyStructure, and only for parts a JOINTS entry names. */
export type JointGeometry = Record<PartId, { placeDir?: Vec3; lockDir?: Vec3 }>;

export interface ClusterDef {
  id: ClusterId;
  label: string;
  requires?: readonly ClusterId[];
  /** The combine root: seats first and joins nothing. Exactly one cluster per furniture may carry it. A cluster that slideJoins another is never a seed. */
  seed?: boolean;
  /** Clusters this one slides onto at combine time — the cluster-level counterpart of a part's slideJoins. */
  slideJoins?: readonly ClusterId[];
  /** Unit direction this cluster TRAVELS as it seats (authored; a runner's axis is not derivable from poses). */
  placeDir?: Vec3;
  /** How far off its seat this cluster parks before the drive gesture; defaults to SLIDE_BACKOFF_M. */
  parkBackoff?: number;
  /** How the drive gesture seats a slide-joined cluster: absent = a straight glide (SlideControl); "screw" = it threads in — the dial spins the whole cluster about placeDir as it sinks (DALFRED's seat screwing onto the base). */
  driveMotion?: "screw";
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

/** How a tighten/drive LOOKS. Resolved from HARDWARE.motion ?? the kind default. `press` is a SINGLE bare-hand push that seats the fastener in one go (EKET's rear cam locks + pins — TapControl's one-tap variant). `drawTurn` is a single tighten beat that DRAWS the fastener out along its axis into the receiver then quarter-turns it to lock (EKET stabiliser-rod dowels). */
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

/** One rigid group of a telescoping mechanism and how far it travels, as a fraction of the full pull-out (frame 0 — omitted; middle ½; carriage, clip and the drawer box 1). Levels animate one after another. */
export interface PushOpenGroup {
  level: string;
  ratio: number;
  parts: readonly PartId[];
}
/** The telescoping drawer motion: which parts telescope, along which world axis, how far. `testActionIds` gives each level its own interactive test beat (the player drags the drawer out and home); `beatActionId` instead plays the whole open/close as a passive tween on that one beat's swipe — author one or the other. */
export interface PushOpenSpec {
  axis: Vec3;
  /** Full open travel of the drawer, in meters. */
  distance: number;
  /** How far the push-latch spring ejects the drawer on a press, in meters (the test beat's tap-to-pop). */
  popDistance?: number;
  beatActionId?: string;
  /** level → the actionId of that level's drag-out-to-test beat. */
  testActionIds?: Readonly<Record<string, string>>;
  groups: readonly PushOpenGroup[];
}

/** A set of bodies the player handles as ONE object: one tray card, one drag, one placement gesture. The bodies keep their own actions, poses and engagements — a component is a PRESENTATION unit, not a physical one. */
export interface ComponentDef {
  id: ComponentId;
  label: LabelSet;
  /** Every body the gesture places, INCLUDING the lead. Must be ≥2. */
  bodies: readonly PartId[];
  /** The body whose place action the gesture drives; siblings ride its completion. */
  lead: PartId;
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
export interface RenderStyle {
  /** Custom Filament material this look renders with. The DEFAULT per look lives in
   *  scene/shaders.ts (STYLE_SHADER); set this only to override for one furniture —
   *  e.g. a build whose GLB already looks hand-drawn opting out of the ink pass. */
  shader?: "off" | "toon" | "ink";
  material?: Record<string, MaterialParams>;
}
export type StyleSet = Partial<Record<RenderStyleId, RenderStyle>>;

// What the BUNDLE knows about a furniture: its id, its artwork, and the counts derived from the recipe. Everything a human authors — name, brand, type, duration, link — lives in item_build and is read through the catalogue store, so it can be edited without shipping a build.
export interface FurnitureMeta {
  id: FurnitureId;
  thumbnail: ThumbSet;
  /** Catalogue art per finish, keyed by the item_variants `variation` string. Absent, or a key with
   *  no art, means the catalogue shows no finish arrow for this furniture — so a variation declared
   *  in the table before its artwork ships degrades to the plain tile rather than a broken image. */
  variantThumbnails?: Record<string, ThumbSet>;
  /** Assembly mode this furniture STARTS in, overriding the player's profile mode (PROFILE_MODE) when the build is loaded. A DEFAULT only: the player can still switch mode in the settings panel, and their switch survives — it is autosaved with the build and restored by applyBuild, which runs after loadFurniture. Absent = the player's own mode, unchanged. */
  mode?: AssemblyMode;
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
  /** Sub-assembly art per finish, keyed exactly like `meta.variantThumbnails` — finish first, then
   *  cluster. Hand-authored, so it lives beside the model rather than in the generated thumbs file.
   *  A missing finish, or a finish missing one cluster, falls back to `clusterThumbs` for that
   *  cluster alone (see presentation/finish.ts), so art can ship one stage at a time. */
  clusterVariantThumbs?: Record<string, ClusterThumbMap>;
  styles?: StyleSet;
  styleModels?: Partial<Record<RenderStyleId, AssetSrc>>;
  shadow?: AssetSrc;
  tools?: Partial<ToolMap>;
  instructions: InstructionSet;
  labels: LabelMap;
  /** Telescoping drawer beat (EKET); absent = the finishing beat stays symbolic. */
  pushOpen?: PushOpenSpec;
  /** Generated exit-sweep blocker data (see SweepMap); absent = travelAxis keeps its centroid heuristic unchecked. */
  sweep?: SweepMap;
  /** Derived body→component lookups (see model/components.ts); absent = no multi-body components. */
  components?: ComponentIndex;
  xpPerStep: number;
  xpBonusOnComplete: number;
}