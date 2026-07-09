import { PartDef, PartId } from "@/src/game/core/type";

const pose = { position: [0, 0, 0] as const, rotation: [0, 0, 0, 1] as const };

const structural = (partId: string, group: string, cluster: string) => ({
  partId,
  group,
  type: "structural" as const,
  cluster,
  meshName: `${cluster}_${partId}`,
  pose,
});

const fastener = (
  partId: string,
  group: string,
  cluster: string,
  attached: [string, string],
) => ({
  partId,
  group,
  type: "fastener" as const,
  attached,
  cluster,
  meshName: `${cluster}_${partId}__${attached[0]}&${attached[1]}`,
  pose,
});

const drawer = (d: number) => {
  const c = `drawer${d}`;
  const id = (n: string) => `${n}_${d}`;
  return {
    [id("front")]: structural(id("front"), "front", c),
    [id("sideL")]: structural(id("sideL"), "side", c),
    [id("sideR")]: structural(id("sideR"), "side", c),
    [id("back")]: structural(id("back"), "back", c),
    [id("bottom")]: structural(id("bottom"), "bottom", c),
    [id("railL")]: structural(id("railL"), "rail148601", c),
    [id("railR")]: structural(id("railR"), "rail148601", c),
    [id("crossRail")]: structural(id("crossRail"), "rail123833", c),
    [id("camBoltL1")]: fastener(id("camBoltL1"), "camBolt118331", c, [id("front"), id("sideL")]),
    [id("camBoltL2")]: fastener(id("camBoltL2"), "camBolt118331", c, [id("front"), id("sideL")]),
    [id("camBoltR1")]: fastener(id("camBoltR1"), "camBolt118331", c, [id("front"), id("sideR")]),
    [id("camBoltR2")]: fastener(id("camBoltR2"), "camBolt118331", c, [id("front"), id("sideR")]),
    [id("backScrewL")]: fastener(id("backScrewL"), "screw110519", c, [id("back"), id("sideL")]),
    [id("backScrewR")]: fastener(id("backScrewR"), "screw110519", c, [id("back"), id("sideR")]),
    [id("bottomScrew")]: fastener(id("bottomScrew"), "screw115339", c, [id("bottom"), id("back")]),
    [id("railScrewL")]: fastener(id("railScrewL"), "screw100365", c, [id("railL"), id("sideL")]),
    [id("railScrewR")]: fastener(id("railScrewR"), "screw100365", c, [id("railR"), id("sideR")]),
    [id("crossScrew")]: fastener(id("crossScrew"), "screw105344", c, [id("crossRail"), id("bottom")]),
  };
};

const PARTS_RAW = { ...drawer(1), ...drawer(2) };

export const PARTS = PARTS_RAW as unknown as Record<PartId, PartDef>;
export const ALL_PART_IDS = Object.keys(PARTS_RAW) as PartId[];
