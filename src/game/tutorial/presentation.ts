import type { ProfileId } from "@/src/game/core/profile";

export interface TutorialPresentation {
  showChecklist: boolean;
  showMilestoneConfirmation: boolean;
  emphasizeTarget: boolean;
  showMomentumCompanion: boolean;
}

const PRESENTATION_BY_PROFILE: Record<ProfileId, TutorialPresentation> = {
  control: {
    showChecklist: false,
    showMilestoneConfirmation: false,
    emphasizeTarget: false,
    showMomentumCompanion: false,
  },
  visual: {
    showChecklist: false,
    showMilestoneConfirmation: false,
    emphasizeTarget: true,
    showMomentumCompanion: false,
  },
  momentum: {
    showChecklist: false,
    showMilestoneConfirmation: false,
    emphasizeTarget: true,
    showMomentumCompanion: true,
  },
  clearPath: {
    showChecklist: true,
    showMilestoneConfirmation: true,
    emphasizeTarget: true,
    showMomentumCompanion: false,
  },
};

export function tutorialPresentationForProfile(
  profile: ProfileId,
): TutorialPresentation {
  return PRESENTATION_BY_PROFILE[profile];
}
