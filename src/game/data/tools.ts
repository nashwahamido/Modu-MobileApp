import { AssemblyAction, Furniture, ToolId, ToolInfo, ToolMap } from "@/src/game/core/type";

export const TOOLS: Partial<ToolMap> = {
  hand: {
    label: "By hand",
    icon: {
      light: require("../../assets/thumbnails/tools/light/Hand.png"),
      dark: require("../../assets/thumbnails/tools/dark/Hand.png"),
    },
  },
  allenkey: {
    label: "Allen key",
    icon: {
      light: require("../../assets/thumbnails/tools/light/allenKey.png"),
      dark: require("../../assets/thumbnails/tools/dark/allenKey.png"),
    },
    asset: require("../../assets/models/tools/allenKey.glb"),
  },
  screwdriver: {
    label: "Screwdriver",
    icon: {
      light: require("../../assets/thumbnails/tools/light/Screwdriver.png"),
      dark: require("../../assets/thumbnails/tools/dark/Screwdriver.png"),
    },
    asset: require("../../assets/models/tools/Screwdriver.glb"),
  },
  mallet: {
    label: "Mallet",
    icon: {
      light: require("../../assets/thumbnails/tools/light/Mallet.png"),
      dark: require("../../assets/thumbnails/tools/dark/Mallet.png"),
    },
    asset: require("../../assets/models/tools/Mallet.glb"),
  },
};

export const toolsUsed = (
  actions: readonly AssemblyAction[],
): Partial<ToolMap> => {
  const out: Partial<ToolMap> = {};
  for (const a of actions)
    if (a.tool && TOOLS[a.tool]) out[a.tool] = TOOLS[a.tool];
  return out;
};

export const toolList = (f: Furniture): (ToolInfo & { id: ToolId })[] =>
  Object.entries(f.tools ?? {}).map(([id, t]) => ({ id: id as ToolId, ...t! }));
