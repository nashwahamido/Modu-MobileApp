export const VOICEOVER_BUCKET = "Voiceover";

const ROOT = "onboarding";

const EXT = ".mp3";

const oneBased = (index: number): number => index + 1;

export function introPath(): string {
  return `${ROOT}/Intro-hey${EXT}`;
}

export function promptPath(index: number): string {
  const q = oneBased(index);
  return `${ROOT}/Q${q}/Q${q}${EXT}`;
}

export function optionPath(index: number, optionIndex: number): string {
  const q = oneBased(index);
  return `${ROOT}/Q${q}/Q${q}-Opt${oneBased(optionIndex)}${EXT}`;
}

const AVATARS_ROOT = "avatars";

export function avatarPath(avatarName: string): string {
  return `${AVATARS_ROOT}/${avatarName}${EXT}`;
}