import { create } from 'zustand';
import type { TutorialTargetId } from './steps';

export interface TutorialFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TutorialTargetState {
  frames: Partial<Record<TutorialTargetId, TutorialFrame>>;
  nodes: Partial<Record<TutorialTargetId, number>>;
  setFrame: (id: TutorialTargetId, frame: TutorialFrame) => void;
  setNode: (id: TutorialTargetId, node: number) => void;
  clearFrame: (id: TutorialTargetId) => void;
}

export const useTutorialTargets = create<TutorialTargetState>()((set) => ({
  frames: {},
  nodes: {},
  setFrame: (id, frame) =>
    set((state) => {
      const previous = state.frames[id];
      if (
        previous &&
        Math.abs(previous.x - frame.x) < 0.5 &&
        Math.abs(previous.y - frame.y) < 0.5 &&
        Math.abs(previous.width - frame.width) < 0.5 &&
        Math.abs(previous.height - frame.height) < 0.5
      ) {
        return state;
      }
      return { frames: { ...state.frames, [id]: frame } };
    }),
  setNode: (id, node) =>
    set((state) => (state.nodes[id] === node ? state : { nodes: { ...state.nodes, [id]: node } })),
  clearFrame: (id) =>
    set((state) => {
      const frames = { ...state.frames };
      const nodes = { ...state.nodes };
      delete frames[id];
      delete nodes[id];
      return { frames, nodes };
    }),
}));
