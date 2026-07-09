// finished

// This is the script for fastener actions
import { AssemblyAction, ToolId } from "@/src/adhd/core/type";

// for fasteners
export const pair = (
  partId: string,
  tool: ToolId,
  requires: readonly string[],
  stage: number,
): AssemblyAction[] => {
  const insertId: string = `insert_${partId}`;
  return [
    // insert action
    {
      actionId: insertId,
      type: "insertFastener",
      stage,
      partId,
      requires,
    },
    // tighten action
    {
      actionId: `tighten_${partId}`,
      type: "tightenFastener",
      stage,
      partId,
      tool,
      requires: [insertId], //requires that insert action is done
    },
  ];
};
