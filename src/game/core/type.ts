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
export type LiaisonId = string & Brand<"LiaisonId">;

export type FurnitureId = "DALFRED" | "LACK" | "MALM";
export type BrandId = "IKEA" | "Others";
export type ToolId = "allenkey" | "mallet" | "hammer" | "screwdriver" | "hand";

export type FurnitureCategory =
  | "Table & Chair"
  | "Shelf & Cabinet"
  | "Bed"
  | "Other";

export type ThemeId = "light" | "dark" | "high_contrast";
/** How the furniture is rendered. Two mechanisms, one axis:
 *    realistic | cozy | cartoon   → the GLB is the look (Furniture.styleModels)
 *    toon | illustrated           → the MATERIAL is the look (scene/shaders.ts) */
export type RenderStyleId =
  | "realistic"
  | "cozy"
  | "cartoon"
  | "toon"
  | "illustrated";
export type BackdropId = "studio" | "clear" | "cozy" | "cartoon";

export type AssemblyMode = "free" | "guide" | "strict";
export type TextLevel = "standard" | "simple";

export interface BrandInfo {
  name: string;
  logo: number;
}
export interface ThumbSet {
  light: number;
  dark?: number;
  high_contrast?: number;
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

export type JoinKind = "slide" | "screw" | "press";

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
  tool?: ToolId;
}
export interface StructuralFields {
  directJoins?: readonly PartId[];
  slideJoins?: readonly PartId[];
  screwJoins?: readonly PartId[];
  seed?: boolean;
  unstable?: boolean;
  placeDir?: Vec3;
}
export interface FastenerFields {
  fastenerKind?: FastenerKind;
  screwMover?: PartId;
  attached?: readonly PartId[];
  engageDir?: Vec3;
}
export interface PartDef extends PartCore, StructuralFields, FastenerFields {}

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

export interface ClusterDef {
  id: ClusterId;
  label: string;
  requires?: readonly ClusterId[];
}

export type ActionType =
  | "placePart"
  | "insertFastener"
  | "tightenFastener"
  | "reorient"
  | "setAside"
  | "combineClusters"
  | "verify";

export type DriveMotion = "spin" | "turn" | "strike";

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

export type AudioClip = AssetSrc;
export type AudioMap = Record<ActionId, AudioClip>;

export interface LabelSet {
  standard: string;
  simple?: string;
  audio?: number;
}
export type LabelMap = Record<GroupId, LabelSet>;

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

export interface FurnitureMeta {
  id: FurnitureId;
  name: string;
  thumbnail: ThumbSet;
  brand: BrandId;
  category: FurnitureCategory;
  difficulty: 1 | 2 | 3;
  partCount: number;
  duration: number;
  stageCount: number;
  stepCount: number;
  link?: string;
  /** No GLB yet: playable in the engine-test harness, hidden from the 3D picker. */
  engineOnly?: boolean;
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
  audio?: AudioMap;
  styles?: StyleSet;
  styleModels?: Partial<Record<RenderStyleId, AssetSrc>>;
  shadow?: AssetSrc;
  tools?: Partial<ToolMap>;
  instructions: InstructionSet;
  labels: LabelMap;
  xpPerStep: number;
  xpBonusOnComplete: number;
}