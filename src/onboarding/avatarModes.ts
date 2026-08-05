import type { ModeId } from "./questionnaire";

export type AvatarMode = {
  id: ModeId;
  color: string;
  title: string;
  avatarName: string;
  personality: string;
  explanation: string;
  bullets: string[];
};

export const avatarModes: AvatarMode[] = [
  {
    id: "visual",
    color: "#f5eee5",
    title: "Visual Mode",
    avatarName: "Lumi",
    personality: "Curious, Observant, Imaginative",
    explanation:
      "For users who may find text-heavy instructions tiring and prefer visual demonstrations.",
    bullets: [
      "Visual-first instructions",
      "Icon-based part matching",
      "Replay animation and 3D preview",
    ],
  },
  {
    id: "momentum",
    color: "#ffe08a",
    title: "Momentum Mode",
    avatarName: "Sparky",
    personality: "Enthusiastic, encouraging, optimistic",
    explanation:
      "For users who lose motivation when progress is unclear or after interruptions.",
    bullets: [
      "Clear progress and gentle reminders",
      "Small achievements with strong feedback",
    ],
  },
  {
    id: "clearPath",
    color: "#dff2e4",
    title: "Clear Path Mode",
    avatarName: "Pebble",
    personality: "Calm, organised, reliable",
    explanation:
      "For users who feel stressed when instructions are vague or part orientation is ambiguous.",
    bullets: [
      "Predictable workflow",
      "Current step highlight and precise part labels",
      "Placement cues and milestone confirmation",
    ],
  },
  {
    id: "control",
    color: "#d7c8ff",
    title: "Control Mode",
    avatarName: "Felix",
    personality: "Independent, adaptable, quick-witted",
    explanation: "For users whose support needs may change during the task.",
    bullets: [
      "Adjustable support level",
      "Hint, sound, text, and overlay controls",
      "flexible guidance control",
    ],
  },
];
