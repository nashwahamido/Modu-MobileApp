// the player-facing name for a variation

const SPECIAL: Record<string, string> = {
  cozy: "Cozy",
  cartoon: "Cartoon",
};

export function variationLabel(variation: string | null | undefined): string {
  if (!variation) return "Default";
  const known = SPECIAL[variation.toLowerCase()];
  if (known) return known;
  return variation.charAt(0).toUpperCase() + variation.slice(1).toLowerCase();
}
