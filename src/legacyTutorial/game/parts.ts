import { PART_POSES, PosedPartId, PartPose } from './poses.gen';

export type ToolId = 'hexkey' | 'screwdriver' | 'mallet';
export type PartKind = 'structural' | 'fastener';
export type PartId = PosedPartId;

export interface PartDef {
  id: PartId;
  label: string;
  asset: number; // RN bundled asset module
  kind: PartKind;
  pose: PartPose;
  /** Tool that secures this part (fasteners and tool-secured structurals). */
  tool?: ToolId;
}

const A = {
  bottom_panel: require('../assets/models/furniture-models/EKET/components/EKET_bottom_panel.glb'),
  left_side_panel: require('../assets/models/furniture-models/EKET/components/EKET_left_side_panel.glb'),
  right_side_panel: require('../assets/models/furniture-models/EKET/components/EKET_right_side_panel.glb'),
  back_panel: require('../assets/models/furniture-models/EKET/components/EKET_back_panel.glb'),
  top_panel: require('../assets/models/furniture-models/EKET/components/EKET_top_panel.glb'),
  connector_1: require('../assets/models/furniture-models/EKET/components/EKET_connector_1.glb'),
} satisfies Record<PartId, number>;

function def(id: PartId, label: string, kind: PartKind, tool?: ToolId): PartDef {
  return { id, label, kind, tool, asset: A[id], pose: PART_POSES[id] };
}

export const PARTS: Record<PartId, PartDef> = {
  bottom_panel: def('bottom_panel', 'Bottom panel', 'structural'),
  left_side_panel: def('left_side_panel', 'Left side panel', 'structural'),
  right_side_panel: def('right_side_panel', 'Right side panel', 'structural'),
  back_panel: def('back_panel', 'Back panel', 'structural'),
  top_panel: def('top_panel', 'Top panel', 'structural'),
  connector_1: def('connector_1', 'Cabinet connector', 'fastener', 'screwdriver'),
};

export const ALL_PART_IDS = Object.keys(PARTS) as PartId[];

export const TOOLS: Record<ToolId, { label: string; asset: number }> = {
  hexkey: { label: 'Hex key', asset: require('../assets/models/tool-models/Hexkey.glb') },
  screwdriver: { label: 'Screwdriver', asset: require('../assets/models/tool-models/Screwdriver.glb') },
  mallet: { label: 'Mallet', asset: require('../assets/models/tool-models/Mallet.glb') },
};
