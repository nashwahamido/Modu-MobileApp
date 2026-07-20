// Generate per-furniture thumbnail maps from rendered PNG files.
//
// Run from the modi project root:
//   npm run gen:thumbs
//
// This writes src/game/data/furnitures/<ID>/thumbs.gen.ts with static require(...)
// calls. Metro needs those static requires, so keep this as a build-time script
// rather than trying to look up thumbnails dynamically in the app.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(SCRIPT_DIR, "..", "..");
const FURNITURES = path.join(SCRIPT_DIR, "..", "data", "furnitures");
const MODEL_ROOT = path.join(SRC, "assets", "models", "furnitures");
const THUMB_ROOT = path.join(SRC, "assets", "thumbnails");
const REQUIRE_ROOT = "../../../../assets/thumbnails";
const FASTENER_RE = /^(screw|bolt|cam|nut|dowel|barrel|peg|washer|rivet)/i;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const sortNatural = (items) => [...items].sort((a, b) => collator.compare(a, b));

// Read the PARTS map out of a parts.gen.ts. We pull the object literal and
// evaluate it as JS, which is valid for BOTH emitted formats — the single-line
// JSON style (quoted keys) and the pretty-printed style (unquoted keys, trailing
// commas). Values are plain data (numbers/strings/arrays), so there's nothing to
// execute.
function readPartsGen(id) {
  const file = path.join(FURNITURES, id, "parts.gen.ts");
  if (!fs.existsSync(file)) return [];

  const match = fs
    .readFileSync(file, "utf8")
    .match(/const PARTS_RAW\s*=\s*(\{[\s\S]*\})\s*satisfies/);
  if (!match) return [];
  try {
    const parts = new Function(`return (${match[1]})`)();
    return Object.values(parts);
  } catch (err) {
    console.warn(`${id}: could not parse parts.gen.ts — ${err.message}`);
    return [];
  }
}

function parsePartThumbBase(base) {
  const head = base.split("__")[0];
  const [cluster, group, maybeIndex] = head.split("_");
  return {
    base,
    cluster,
    group,
    index: /^\d+$/.test(maybeIndex ?? "") ? maybeIndex : undefined,
  };
}

function firstAttachedSuffix(part) {
  const first = part.attached?.[0];
  return first ? first.replaceAll("&", "_") : undefined;
}

function candidateBases(part) {
  const bases = [part.meshName];
  const head = part.meshName.split("__")[0];
  const suffix = firstAttachedSuffix(part);
  if (suffix) bases.push(`${head}_${suffix}`);

  const [, index] = part.partId.match(/_(\d+)$/) ?? [];
  if (index) bases.push(`${part.cluster}_${part.group}_${index}`);
  bases.push(`${part.cluster}_${part.group}`);

  return [...new Set(bases)];
}

function chooseThumbForPart(part, availableByBase, parsedThumbs) {
  for (const base of candidateBases(part)) {
    const direct = availableByBase.get(base);
    if (direct) return direct;
  }

  const [, index] = part.partId.match(/_(\d+)$/) ?? [];
  const prefix = `${part.cluster}_${part.group}`;
  const loose = parsedThumbs.find(
    (thumb) =>
      thumb.cluster === part.cluster &&
      thumb.group === part.group &&
      (!index || thumb.index === index) &&
      thumb.base.startsWith(prefix),
  );
  return loose?.file;
}

function representativeParts(parts) {
  const byGroup = new Map();
  for (const part of parts) {
    if (!byGroup.has(part.group)) byGroup.set(part.group, part);
  }
  return [...byGroup.values()];
}

function inferUnmatchedStructuralThumb(part, parsedThumbs, usedFiles, knownGroups) {
  if (FASTENER_RE.test(part.group)) return undefined;

  const candidates = parsedThumbs.filter(
    (thumb) =>
      thumb.cluster === part.cluster &&
      !usedFiles.has(thumb.file) &&
      !knownGroups.has(thumb.group) &&
      !FASTENER_RE.test(thumb.group),
  );
  return candidates.length === 1 ? candidates[0].file : undefined;
}

// Thumbnails live under assets/thumbnails/furnitures/<ID>/<theme>/ — the
// furniture preview at the theme root (<ID>.png) and part thumbs in parts/.
// A dark variant is the SAME filename under the dark/ folder; it's optional, so
// groups without one fall back to light at runtime (see pickThumb).
const thumbDir = (id, theme) => path.join(THUMB_ROOT, "furnitures", id, theme);
const partReq = (id, theme, file) =>
  `${REQUIRE_ROOT}/furnitures/${id}/${theme}/parts/${file}`;
const furnReq = (id, theme, file) =>
  `${REQUIRE_ROOT}/furnitures/${id}/${theme}/${file}`;
const clusterReq = (id, theme, file) =>
  `${REQUIRE_ROOT}/furnitures/${id}/${theme}/clusters/${file}`;

// Per-cluster previews: clusters/<cluster>.png, keyed by cluster id (the file's
// basename). Only multi-cluster furniture has these (the combine step).
function readClusterThumbs(id) {
  const lightDir = path.join(thumbDir(id, "light"), "clusters");
  if (!fs.existsSync(lightDir)) return {};
  const darkDir = path.join(thumbDir(id, "dark"), "clusters");
  const darkFiles = fs.existsSync(darkDir)
    ? new Set(fs.readdirSync(darkDir).filter((f) => f.endsWith(".png")))
    : new Set();
  const out = {};
  for (const file of fs.readdirSync(lightDir).filter((f) => f.endsWith(".png"))) {
    out[path.basename(file, ".png")] = { file, dark: darkFiles.has(file) };
  }
  return out;
}

function thumbSetLiteral(lightPath, darkPath) {
  const light = `require("${lightPath}")`;
  return darkPath
    ? `{ light: ${light}, dark: require("${darkPath}") }`
    : `{ light: ${light} }`;
}

function emit(id, thumbnailFile, thumbnailHasDark, thumbs, darkParts, clusterThumbs) {
  const entries = Object.entries(thumbs).sort(([a], [b]) => collator.compare(a, b));
  const body = entries
    .map(([group, file]) => {
      const literal = thumbSetLiteral(
        partReq(id, "light", file),
        darkParts.has(file) ? partReq(id, "dark", file) : undefined,
      );
      return `  ${JSON.stringify(group)}: ${literal},`;
    })
    .join("\n");
  const thumbnail = thumbSetLiteral(
    furnReq(id, "light", thumbnailFile),
    thumbnailHasDark ? furnReq(id, "dark", thumbnailFile) : undefined,
  );

  const clusterEntries = Object.entries(clusterThumbs).sort(([a], [b]) =>
    collator.compare(a, b),
  );
  const hasClusters = clusterEntries.length > 0;
  const clusterBody = clusterEntries
    .map(([cid, { file, dark }]) => {
      const literal = thumbSetLiteral(
        clusterReq(id, "light", file),
        dark ? clusterReq(id, "dark", file) : undefined,
      );
      return `  ${JSON.stringify(cid)}: ${literal},`;
    })
    .join("\n");

  const typeImports = hasClusters
    ? "ClusterThumbMap, ThumbMap, ThumbSet"
    : "ThumbMap, ThumbSet";
  const clusterExport = hasClusters
    ? `\nexport const clusterThumbs = {\n${clusterBody}\n} as ClusterThumbMap;\n`
    : "";

  const out = path.join(FURNITURES, id, "thumbs.gen.ts");
  fs.writeFileSync(
    out,
    `// GENERATED by scripts/gen-thumbs.mjs - do not edit by hand.
// Run: npm run gen:thumbs

import type { ${typeImports} } from "@/src/game/core/type";

export const thumbnail = ${thumbnail} satisfies ThumbSet;

export const thumbs = {
${body}
} as ThumbMap;
${clusterExport}`,
  );
  return out;
}

function generateForFurniture(id) {
  const parts = readPartsGen(id);
  const lightParts = path.join(thumbDir(id, "light"), "parts");
  if (!parts.length || !fs.existsSync(lightParts)) return;

  // Thumbnail bases come from the rendered PNGs themselves. (The Blender renderer
  // used to also emit a per-part GLB purely as a name index; that's gone now, so
  // enumerate the images directly. Older furniture whose parts/ GLBs still exist
  // is unaffected — the PNG basenames match the GLB basenames one-to-one.)
  const partThumbBases = sortNatural(fs.readdirSync(lightParts))
    .filter((file) => file.endsWith(".png"))
    .map((file) => path.basename(file, ".png"));

  const darkPartsDir = path.join(thumbDir(id, "dark"), "parts");
  const darkParts = fs.existsSync(darkPartsDir)
    ? new Set(fs.readdirSync(darkPartsDir).filter((file) => file.endsWith(".png")))
    : new Set();

  const availableByBase = new Map();
  const parsedThumbs = [];
  for (const base of partThumbBases) {
    const file = `${base}.png`;
    availableByBase.set(base, file);
    parsedThumbs.push({ ...parsePartThumbBase(base), file });
  }

  const thumbs = {};
  const usedFiles = new Set();
  const knownGroups = new Set(parts.map((part) => part.group));
  const unmatched = [];

  for (const part of representativeParts(parts)) {
    const file = chooseThumbForPart(part, availableByBase, parsedThumbs);
    if (file) {
      thumbs[part.group] = file;
      usedFiles.add(file);
    } else {
      unmatched.push(part);
    }
  }

  for (const part of unmatched) {
    const file = inferUnmatchedStructuralThumb(part, parsedThumbs, usedFiles, knownGroups);
    if (!file) continue;
    thumbs[part.group] = file;
    usedFiles.add(file);
    console.warn(`${id}: inferred ${part.group} -> ${file}`);
  }

  const thumbnailFile = `${id}.png`;
  if (!fs.existsSync(path.join(thumbDir(id, "light"), thumbnailFile))) {
    console.warn(`${id}: skipped, missing furniture thumbnail light/${thumbnailFile}`);
    return;
  }
  const thumbnailHasDark = fs.existsSync(path.join(thumbDir(id, "dark"), thumbnailFile));

  const clusterThumbs = readClusterThumbs(id);
  const out = emit(id, thumbnailFile, thumbnailHasDark, thumbs, darkParts, clusterThumbs);
  console.log(
    `${id}: wrote ${Object.keys(thumbs).length} thumb mappings` +
      `${Object.keys(clusterThumbs).length ? ` + ${Object.keys(clusterThumbs).length} cluster previews` : ""} -> ${out}`,
  );
}

for (const id of sortNatural(fs.readdirSync(MODEL_ROOT))) {
  if (!fs.statSync(path.join(MODEL_ROOT, id)).isDirectory()) continue;
  generateForFurniture(id);
}
