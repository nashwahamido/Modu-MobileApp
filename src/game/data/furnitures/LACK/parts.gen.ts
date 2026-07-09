import { PartDef, PartId, RawPartDef } from "@/src/game/core/type";

const PARTS_RAW = {
  "tableTop": {"partId":"tableTop","group":"tableTop","meshName":"whole_tableTop","type":"structural","cluster":"whole","visualCenterOffset":[0,0,0],"pose":{"position":[0,0.4245,0],"rotation":[0.5,0.5,-0.5,0.5]}},
  "bolt115980_4": {"partId":"bolt115980_4","group":"bolt115980","meshName":"whole_bolt115980_4__tableTop&leg_4","type":"fastener","cluster":"whole","attached":["tableTop","leg_4"],"visualCenterOffset":[0,0,0],"engageDir":[0,-1,0],"pose":{"position":[-0.2485,0.4005,-0.2485],"rotation":[-0.49107,-0.508774,-0.508773,0.491069]}},
  "bolt115980_2": {"partId":"bolt115980_2","group":"bolt115980","meshName":"whole_bolt115980_2__tableTop&leg_2","type":"fastener","cluster":"whole","attached":["tableTop","leg_2"],"visualCenterOffset":[0,0,0],"engageDir":[0,-1,0],"pose":{"position":[0.2485,0.4005,0.2485],"rotation":[-0.433011,-0.559019,-0.559018,0.43301]}},
  "bolt115980_1": {"partId":"bolt115980_1","group":"bolt115980","meshName":"whole_bolt115980_1__tableTop&leg_1","type":"fastener","cluster":"whole","attached":["tableTop","leg_1"],"visualCenterOffset":[0,0,0],"engageDir":[0,-1,0],"pose":{"position":[0.2485,0.4005,-0.2485],"rotation":[-0.378155,-0.597495,-0.597494,0.378154]}},
  "leg_1": {"partId":"leg_1","group":"leg","meshName":"whole_leg_1","type":"structural","cluster":"whole","visualCenterOffset":[0,0.2,0],"pose":{"position":[0.2485,0,-0.2485],"rotation":[-0.5,0.5,0.5,0.5]}},
  "leg_4": {"partId":"leg_4","group":"leg","meshName":"whole_leg_4","type":"structural","cluster":"whole","visualCenterOffset":[0,0.2,0],"pose":{"position":[-0.2485,0,-0.2485],"rotation":[0,0.707107,0.707107,0]}},
  "leg_3": {"partId":"leg_3","group":"leg","meshName":"whole_leg_3","type":"structural","cluster":"whole","visualCenterOffset":[0,0.2,0],"pose":{"position":[-0.2485,0,0.2485],"rotation":[0,0.707107,0.707107,0]}},
  "leg_2": {"partId":"leg_2","group":"leg","meshName":"whole_leg_2","type":"structural","cluster":"whole","visualCenterOffset":[0,0.2,0],"pose":{"position":[0.2485,0,0.2485],"rotation":[0,0.707107,0.707107,0]}},
  "bolt115980_3": {"partId":"bolt115980_3","group":"bolt115980","meshName":"whole_bolt115980_3__tableTop&leg_3","type":"fastener","cluster":"whole","attached":["tableTop","leg_3"],"visualCenterOffset":[0,0,0],"engageDir":[0,-1,0],"pose":{"position":[-0.2485,0.4005,0.2485],"rotation":[-0.547693,-0.44725,-0.44725,0.547692]}},
} satisfies Record<string, Omit<RawPartDef, "tool">>;

export const PARTS = PARTS_RAW as unknown as Record<PartId, PartDef>;
export const ALL_PART_IDS = Object.keys(PARTS_RAW) as PartId[];
