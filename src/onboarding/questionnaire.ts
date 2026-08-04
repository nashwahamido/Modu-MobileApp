export type Handedness = "left" | "right";
export type HintId = "voice" | "navigation" | null;
export type ModeId = "visual" | "momentum" | "clearPath" | "control";
export type ScoreMap = Record<ModeId, number>;

export type QuestionnaireQuestion = {
  prompt: string;
  options: string[];
};

export const questionnaireIntroText =
  "Hey! I'm Modu, your assembly assistant. Let's complete a quick questionnaire to find the avatar that fits you best.";
export const questionnaireHandednessPrompt =
  "First, are you left- or right-handed?";
export const questionnaireIntroVoiceText =
  `${questionnaireIntroText} ${questionnaireHandednessPrompt}`;

export const questions: QuestionnaireQuestion[] = [
  {
    prompt:
      "When you first open a brand new piece of furniture to build, you feel...",
    options: [
      "Overwhelmed by all the scattered screws, boards & instructions",
      "So excited that I will dismiss reading manual & start assembling",
      "Calm if guidance is thoroughly detailed",
    ],
  },
  {
    prompt:
      "If you step away from an assembly task, what happens when you return?",
    options: [
      "I lose track of the part I was holding or where I was supposed to put it",
      "I need to review the current manual step again before continuing",
      "I can pick up right where I left off without any real issue",
    ],
  },
  {
    prompt:
      "Look at the example of IKEA manual. What is your primary reaction?",
    options: [
      "The lines, numbers, text and arrows bleed together",
      "It is hard to tell if panel holes face the front or the back",
      "It is totally clear",
    ],
  },
  {
    prompt:
      "What kind of environment keeps you focused, relaxed, and motivated while gaming?",
    options: [
      "Frequent sound effects, celebratory pop-ups, effects, and rewards",
      "A clean, quiet, guided space",
      "A balance: fun rewards, clean flow, and the ability to hide instructions",
    ],
  },
  {
    prompt:
      'Imagine rotating a complex 3D shape, or instantly figuring out "left vs. right"...',
    options: [
      "I get spatially disoriented",
      "It takes me a second to process; comparing small parts can trick me",
      "I can mentally rotate and size up objects easily",
    ],
  },
];

export const scoreRules: ScoreMap[][] = [
  [
    { visual: 0, momentum: 1, clearPath: 2, control: 0 },
    { visual: 0, momentum: 2, clearPath: 1, control: 1 },
    { visual: 1, momentum: 0, clearPath: 2, control: 0 },
  ],
  [
    { visual: 0, momentum: 2, clearPath: 1, control: 0 },
    { visual: 0, momentum: 2, clearPath: 1, control: 0 },
    { visual: 0, momentum: 0, clearPath: 0, control: 2 },
  ],
  [
    { visual: 2, momentum: 0, clearPath: 0, control: 1 },
    { visual: 2, momentum: 0, clearPath: 1, control: 0 },
    { visual: 0, momentum: 0, clearPath: 1, control: 2 },
  ],
  [
    { visual: 0, momentum: 2, clearPath: 0, control: 0 },
    { visual: 0, momentum: 0, clearPath: 2, control: 1 },
    { visual: 0, momentum: 1, clearPath: 0, control: 2 },
  ],
  [
    { visual: 2, momentum: 0, clearPath: 1, control: 0 },
    { visual: 2, momentum: 0, clearPath: 0, control: 1 },
    { visual: 0, momentum: 0, clearPath: 0, control: 2 },
  ],
];

export const tieBreakPriority: ModeId[] = [
  "clearPath",
  "momentum",
  "visual",
  "control",
];

export const getRecommendedModes = (answers: string[]) => {
  const scores: ScoreMap = {
    visual: 0,
    momentum: 0,
    clearPath: 0,
    control: 0,
  };

  answers.forEach((answer, questionIndex) => {
    const optionIndex = questions[questionIndex]?.options.indexOf(answer) ?? -1;
    const rule = scoreRules[questionIndex]?.[optionIndex];
    if (!rule) {
      return;
    }
    scores.visual += rule.visual;
    scores.momentum += rule.momentum;
    scores["clearPath"] += rule["clearPath"];
    scores.control += rule.control;
  });

  return [...tieBreakPriority].sort((firstMode, secondMode) => {
    const scoreDifference = scores[secondMode] - scores[firstMode];
    if (scoreDifference !== 0) {
      return scoreDifference;
    }
    return (
      tieBreakPriority.indexOf(firstMode) - tieBreakPriority.indexOf(secondMode)
    );
  });
};