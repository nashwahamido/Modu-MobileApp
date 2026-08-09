import type { ProfileId } from "@/src/game/core/profile";

export interface TutorialPresentation {
  showChecklist: boolean;
  showMilestoneConfirmation: boolean;
  emphasizeTarget: boolean;
  showMomentumCompanion: boolean;
  showVisualDemo: boolean;
  reducedText: boolean;
}

const PRESENTATION_BY_PROFILE: Record<ProfileId, TutorialPresentation> = {
  control: {
    showChecklist: false,
    showMilestoneConfirmation: false,
    emphasizeTarget: false,
    showMomentumCompanion: false,
    showVisualDemo: false,
    reducedText: false,
  },
  visual: {
    showChecklist: false,
    showMilestoneConfirmation: false,
    emphasizeTarget: true,
    showMomentumCompanion: false,
    showVisualDemo: true,
    reducedText: true,
  },
  momentum: {
    showChecklist: false,
    showMilestoneConfirmation: false,
    emphasizeTarget: true,
    showMomentumCompanion: true,
    showVisualDemo: false,
    reducedText: false,
  },
  clearPath: {
    showChecklist: false,
    showMilestoneConfirmation: true,
    emphasizeTarget: true,
    showMomentumCompanion: false,
    showVisualDemo: false,
    reducedText: false,
  },
};

export function tutorialPresentationForProfile(
  profile: ProfileId,
): TutorialPresentation {
  return PRESENTATION_BY_PROFILE[profile];
}
