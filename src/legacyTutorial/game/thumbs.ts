import type { PartId, ToolId } from './parts';

/**
 * Prototype thumbnails for the simplified EKET onboarding task.
 * These currently reuse the EKET product image as a placeholder; the 3D parts
 * themselves are separate GLBs.
 */
export const THUMBS: Record<PartId | ToolId, number> = {
  bottom_panel: require('../assets/thumbnails/eket/EKET_bottom_panel.jpg'),
  left_side_panel: require('../assets/thumbnails/eket/EKET_left_side_panel.jpg'),
  right_side_panel: require('../assets/thumbnails/eket/EKET_right_side_panel.jpg'),
  back_panel: require('../assets/thumbnails/eket/EKET_back_panel.jpg'),
  top_panel: require('../assets/thumbnails/eket/EKET_top_panel.jpg'),
  connector_1: require('../assets/thumbnails/eket/EKET_connector_1.jpg'),
  hexkey: require('../assets/thumbnails/Hexkey.png'),
  screwdriver: require('../assets/thumbnails/Screwdriver.png'),
  mallet: require('../assets/thumbnails/Mallet.png'),
};
