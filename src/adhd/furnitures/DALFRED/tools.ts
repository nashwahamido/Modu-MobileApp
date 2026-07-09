// LACK is hand-assembly — no tools — so this map is empty and the build needs
// no tool-model GLBs. To wire up DALFRED later, add allenkey / screwdriver /
// mallet entries here, each loading its GLB from assets/models/tool-models.
import { AssetSrc, ToolId } from "@/src/adhd/core/type";

export const TOOLS: Partial<Record<ToolId, { label: string; asset: AssetSrc }>> = {};
