import type { ProfileId } from "@/src/game/core/profile";

export interface TutorialPresentation {
  showChecklist: boolean;
  showMilestoneConfirmation: boolean;
  emphasizeTarget: boolean;
}

const PRESENTATION_BY_PROFILE: Record<ProfileId, TutorialPresentation> = {
  control: {
    showChecklist: false,
    showMilestoneConfirmation: false,
    emphasizeTarget: false,
  },
  visual: {
    showChecklist: false,
    showMilestoneConfirmation: false,
    emphasizeTarget: true,
  },
  momentum: {
    showChecklist: false,
    showMilestoneConfirmation: true,
    emphasizeTarget: true,
  },
  clearPath: {
    showChecklist: true,
    showMilestoneConfirmation: true,
    emphasizeTarget: true,
  },
};

export function tutorialPresentationForProfile(
  profile: ProfileId,
): TutorialPresentation {
  return PRESENTATION_BY_PROFILE[profile];
}
