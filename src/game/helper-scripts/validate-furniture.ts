// Standalone validation of a furniture's authored logic — no thumbnails/model needed.
//   node --import tsx src/game/helper-scripts/validate-furniture.ts <ID>
import { applyStructure, buildLiaisons } from "@/src/game/core/model/liaisons";
import { buildComponents } from "@/src/game/core/model/components";
import { composeFurnitureActions } from "@/src/game/core/composition/composeActions";
import { metaCounts } from "@/src/game/core/composition/metaCounts";
import { validateFurniture } from "@/src/game/core/composition/validateFurniture";
import { HARDWARE } from "@/src/game/data/hardware";
import { Furniture } from "@/src/game/core/type";

async function main() {
  const ID = process.argv[2];
  if (!ID) {
    console.error("usage: validate-furniture <ID>");
    process.exit(2);
  }

  const { PARTS, ALL_PART_IDS } = await import(`@/src/game/data/furnitures/${ID}/parts.gen`);
  const authored = await import(`@/src/game/data/furnitures/${ID}/authored`);
  const { AUTHORED_ACTIONS, FASTENER_RULES, STRUCTURE, CLUSTERS, META } = authored;
  const GATES = authored.GATES ?? {};

  const P = applyStructure(PARTS, STRUCTURE);
  const ACTIONS = composeFurnitureActions(AUTHORED_ACTIONS, FASTENER_RULES, P, HARDWARE);
  const LIAISONS = buildLiaisons(P);
  const COMPONENTS = authored.COMPONENTS;
  const COMPONENTS_IDX = buildComponents(COMPONENTS, P);

  const f = {
    meta: {
      id: ID, name: META.name, brand: META.brand, category: META.category,
      difficulty: META.difficulty, duration: META.duration, link: META.link,
      thumbnail: { light: 0, dark: 0 },
      ...metaCounts(ALL_PART_IDS, ACTIONS),
    },
    model: 0,
    parts: P,
    actions: ACTIONS,
    gates: GATES,
    liaisons: LIAISONS,
    components: COMPONENTS_IDX,
    clusters: CLUSTERS,
    thumbs: {},
    xpPerStep: 10,
    xpBonusOnComplete: 100,
  } as unknown as Furniture;

  const issues = validateFurniture(f);
  const errors = issues.filter((i) => i.level === "error");
  const warns = issues.filter((i) => i.level === "warn");
  console.log(`${ID} validation: ${errors.length} error(s), ${warns.length} warning(s)`);
  console.log(`  parts=${Object.keys(P).length} actions=${ACTIONS.length} stages=${new Set(ACTIONS.map(a=>a.stage)).size}`);
  for (const e of errors) console.log("  ERROR:", e.message);
  for (const w of warns) console.log("  warn :", w.message);
  process.exit(errors.length ? 1 : 0);
}
main();
