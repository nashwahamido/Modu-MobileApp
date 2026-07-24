import type { ImageSourcePropType } from "react-native";
import { create } from "zustand";

export interface TaskRewardItem {
  id: string;
  name: string;
}

const taskFurnitureImages: Record<string, ImageSourcePropType> = {
  LACK: require("../assets/thumbnails/furnitures/LACK/light/LACK.png"),
  DALFRED: require("../assets/thumbnails/furnitures/DALFRED/light/DALFRED.png"),
};

export function getTaskFurnitureImage(itemId: string): ImageSourcePropType | undefined {
  return taskFurnitureImages[itemId];
}

interface TaskRewardInventoryState {
  items: TaskRewardItem[];
  guideItemId: string | null;
  grant: (item: TaskRewardItem) => void;
  startInventoryGuide: (itemId: string) => void;
  finishInventoryGuide: () => void;
}

/**
 * Session-level rewards earned from completed assembly tasks.
 *
 * Store purchases still use the data repository. Task rewards live separately until
 * the backend exposes an inventory-grant endpoint, which keeps this prototype flow
 * from changing the existing purchase contract.
 */
export const useTaskRewardInventory = create<TaskRewardInventoryState>()((set) => ({
  items: [],
  guideItemId: null,
  grant: (item) =>
    set((state) => ({
      items: state.items.some((owned) => owned.id === item.id)
        ? state.items
        : [item, ...state.items],
    })),
  startInventoryGuide: (itemId) => set({ guideItemId: itemId }),
  finishInventoryGuide: () => set({ guideItemId: null }),
}));
