import { PartId, ToolId } from './parts';

export type Stage = 1 | 2 | 3 | 4;

export type GateId = never;

export type ActionType = 'snapPart' | 'insertFastener' | 'tightenFastener' | 'reorient' | 'combine';

export interface AssemblyAction {
  id: string;
  type: ActionType;
  stage: Stage;
  /** Part being placed/inserted/tightened (absent for reorient/combine beats). */
  partId?: PartId;
  tool?: ToolId;
  /** All listed action ids must be complete. */
  requires: readonly string[];
  /** Named dynamic rule evaluated by availability.ts. */
  gate?: GateId;
  objective: string;
}

const cabinetBuild: AssemblyAction[] = [
  {
    id: 'place_bottom_panel',
    type: 'snapPart',
    stage: 1,
    partId: 'bottom_panel',
    requires: [],
    objective: 'Place the bottom panel on the workbench',
  },
  {
    id: 'attach_left_side_panel',
    type: 'snapPart',
    stage: 1,
    partId: 'left_side_panel',
    requires: ['place_bottom_panel'],
    objective: 'Attach the left side panel',
  },
  {
    id: 'attach_right_side_panel',
    type: 'snapPart',
    stage: 1,
    partId: 'right_side_panel',
    requires: ['attach_left_side_panel'],
    objective: 'Attach the right side panel',
  },
  {
    id: 'slide_back_panel',
    type: 'snapPart',
    stage: 1,
    partId: 'back_panel',
    requires: ['attach_right_side_panel'],
    objective: 'Slide the back panel into place',
  },
  {
    id: 'place_top_panel',
    type: 'snapPart',
    stage: 1,
    partId: 'top_panel',
    requires: ['slide_back_panel'],
    objective: 'Place the top panel on the cabinet',
  },
  {
    id: 'insert_connector_1',
    type: 'insertFastener',
    stage: 1,
    partId: 'connector_1',
    requires: ['place_top_panel'],
    objective: 'Insert the cabinet connector by hand',
  },
  {
    id: 'tighten_connector_1',
    type: 'tightenFastener',
    stage: 1,
    partId: 'connector_1',
    tool: 'screwdriver',
    requires: ['insert_connector_1'],
    objective: 'Tighten the connector with the screwdriver',
  },
  {
    id: 'finishing_checks',
    type: 'reorient',
    stage: 2,
    requires: ['tighten_connector_1'],
    objective: 'Rotate the cabinet and check the finished build',
  },
];

export const ACTIONS: readonly AssemblyAction[] = cabinetBuild;
export const ACTION_BY_ID = new Map(ACTIONS.map((a) => [a.id, a]));
