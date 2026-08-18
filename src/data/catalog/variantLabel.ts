// The player-facing name for a variation.
//
// The stored value is a PATH SEGMENT — lowercase, no spaces, because it is half of
// room/<source>/<id>/<variation>.glb. Showing it raw put "cozy" and "wooden" in the room's colour
// picker in the same voice as a filename. This is the one place that turns one into the other, so
// the picker, the inventory and anything else that names a finish agree.
//
// Unknown values fall through to Title Case rather than to a placeholder: a variation added to the
// DB tomorrow reads correctly without a code change, which is the point of the DB owning the list.

/** Names that Title Case alone would not produce. */
const SPECIAL: Record<string, string> = {
  // Not "colours" but LOOKS — the two stylised finishes the catalogue offers.
  cozy: "Cozy",
  cartoon: "Cartoon",
};

export function variationLabel(variation: string | null | undefined): string {
  if (!variation) return "Default";
  const known = SPECIAL[variation.toLowerCase()];
  if (known) return known;
  return variation.charAt(0).toUpperCase() + variation.slice(1).toLowerCase();
}