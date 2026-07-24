import type { ModeId } from "./questionnaire";

export type AvatarMode = {
  id: ModeId;
  color: string;
  title: string;
  avatarName: string;
  personality: string;
  slogan: string;
  explanation: string;
  bullets: string[];
};

export const avatarModes: AvatarMode[] = [
  {
    id: "visual",
    color: "#f5eee5",
    title: "Visual Mode",
    avatarName: "Lumi",
    personality: "Clear, Gentle, and Visual-first",
    slogan: "I will show you everything!",
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
    personality: "Energetic but Easily Scattered",
    slogan: "Keep me moving with small wins and clear progress!",
    explanation:
      "For users who lose motivation when progress is unclear or after interruptions.",
    bullets: [
      "One visible action at a time",
      "Clear progress and gentle reminders",
      "Small achievements with strong feedback",
    ],
  },
  {
    id: "clearPath",
    color: "#dff2e4",
    title: "Clear Path Mode",
    avatarName: "Ciara",
    personality: "Calm, Precise, and Reassuring",
    slogan: "Show the next step clearly, then we can make it.",
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
    personality: "Independent but Adaptable",
    slogan: "I am in control of how much help I need.",
    explanation: "For users whose support needs may change during the task.",
    bullets: [
      "Adjustable support level",
      "Hint, sound, text, and overlay controls",
      "Pause and resume with flexible guidance",
    ],
  },
];
