// the player-facing name for a variation — the stored value is a PATH SEGMENT, so showing it raw reads as a filename
// the ONE place that turns one into the other, so the picker and the inventory agree
// an unknown value falls through to Title Case, so a variation added to the DB tomorrow reads correctly with no code change

// names Title Case alone would not produce
const SPECIAL: Record<string, string> = {
  // not "colours" but LOOKS — the two stylised finishes the catalogue offers
  cozy: "Cozy",
  cartoon: "Cartoon",
};

export function variationLabel(variation: string | null | undefined): string {
  if (!variation) return "Default";
  const known = SPECIAL[variation.toLowerCase()];
  if (known) return known;
  return variation.charAt(0).toUpperCase() + variation.slice(1).toLowerCase();
}