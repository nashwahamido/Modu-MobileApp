#!/usr/bin/env node
// tools/processGLB/processGLB.mjs — pipeline: inspect → propose → answer → apply → verify → install
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseGlb } from "./lib/gltf.mjs";
import { buildInventory } from "./lib/inspect.mjs";
import { buildProposal, buildQuestions } from "./lib/propose.mjs";
import { askInteractive, resolveAnswers } from "./lib/answer.mjs";
import { buildOps } from "./lib/apply.mjs";
import { verifyGlb } from "./lib/verify.mjs";
import { emitAuthored, emitMetaTs, emitIndexTs, emitThumbsTs, placeholderPng,
         patchFurnitureId, patchFurnituresTs } from "./lib/install.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(ROOT, "..", "..");
const workDir = (name) => path.join(ROOT, "work", name);
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const writeJson = (p, v) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(v, null, 2) + "\n");
};
const FASTENER_PREFIXES = Object.keys(
  readJson(path.join(REPO, "src", "game", "core", "model", "fastener-kinds.json")).prefixes,
);

const [cmd, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith("--")));
const args = rest.filter((a) => !a.startsWith("--"));

const commands = {
  inspect(glb) {
    const name = args[1] ?? path.basename(glb).replace(/\.glb$/i, "");
    const { json, bin } = parseGlb(glb);
    const inv = buildInventory(json, bin, path.resolve(glb));
    writeJson(path.join(workDir(name), "inventory.json"), inv);
    console.log(`${name}: ${inv.count} mesh nodes → work/${name}/inventory.json`);
  },
  propose(name) {
    const inv = readJson(path.join(workDir(name), "inventory.json"));
    const articles = readJson(path.join(ROOT, "articles.json"));
    const proposal = buildProposal(inv, articles, FASTENER_PREFIXES);
    const questions = buildQuestions(proposal, inv);
    writeJson(path.join(workDir(name), "proposal.json"), proposal);
    writeJson(path.join(workDir(name), "questions.json"), questions);
    console.log(
      `${name}: ${proposal.groups.length} groups, ${proposal.clusters.length} cluster(s), ` +
      `${proposal.unparent.length} to un-parent, ${proposal.reorient.length} to re-orient, ` +
      `${questions.length} question(s) → work/${name}/questions.json`,
    );
  },
  async answer(name) {
    const questions = readJson(path.join(workDir(name), "questions.json"));
    const ansPath = path.join(workDir(name), "answers.json");
    const existing = fs.existsSync(ansPath) ? readJson(ansPath) : {};
    const answers = flags.has("--accept-defaults")
      ? existing
      : await askInteractive(questions, existing);
    writeJson(ansPath, answers);
    console.log(`${name}: answers saved (${Object.keys(answers).length} explicit, rest default).`);
  },
  apply(name) {
    const wd = workDir(name);
    const inv = readJson(path.join(wd, "inventory.json"));
    const proposal = readJson(path.join(wd, "proposal.json"));
    const questions = readJson(path.join(wd, "questions.json"));
    const answers = fs.existsSync(path.join(wd, "answers.json")) ? readJson(path.join(wd, "answers.json")) : {};
    const resolved = resolveAnswers(questions, answers);
    const { ops, report } = buildOps(inv, proposal, resolved, FASTENER_PREFIXES);
    for (const w of report.warnings) console.warn("  warn:", w);
    const opsPath = path.join(wd, "ops.json");
    writeJson(opsPath, ops);
    const out = path.join(wd, "out", `${name.toUpperCase().replace(/[^A-Z0-9]/g, "")}.glb`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const blender = findBlender();
    console.log(`running ${blender} -b -P worker.py …`);
    const r = spawnSync(blender, ["-b", "-P", path.join(ROOT, "worker.py"), "--", opsPath, inv.source, out],
      { stdio: "inherit" });
    if (r.error) console.error(r.error.message);
    if (r.status !== 0) { console.error("worker failed"); process.exit(r.status ?? 1); }
    console.log(`${name}: wrote ${out}`);
  },
  verify(name) {
    const outDir = path.join(workDir(name), "out");
    const glb = path.join(outDir, fs.readdirSync(outDir).find((f) => f.endsWith(".glb")));
    const { errors, warnings } = verifyGlb(glb, FASTENER_PREFIXES);
    for (const w of warnings) console.warn("  warn:", w);
    for (const e of errors) console.error("  ERROR:", e);
    console.log(`${name}: verify ${errors.length ? "FAILED" : "PASSED"} (${errors.length} error(s))`);
    if (errors.length) process.exit(1);
  },
  install(name) {
    const idFlag = rest[rest.indexOf("--id") + 1];
    const ID = (idFlag && !idFlag.startsWith("--") ? idFlag : name).toUpperCase().replace(/[^A-Z0-9]/g, "");
    const outDir = path.join(workDir(name), "out");
    const glb = path.join(outDir, fs.readdirSync(outDir).find((f) => f.endsWith(".glb")));
    const dataDir = path.join(REPO, "src", "game", "data", "furnitures", ID);
    if (fs.existsSync(dataDir) && !flags.has("--force")) {
      console.error(`${ID} already exists — pass --force to overwrite scaffold files`);
      process.exit(1);
    }
    // 1 ─ assets
    const modelDir = path.join(REPO, "src", "assets", "models", "furnitures", ID);
    fs.mkdirSync(modelDir, { recursive: true });
    fs.copyFileSync(glb, path.join(modelDir, `${ID}.glb`));
    const thumbPng = path.join(REPO, "src", "assets", "thumbnails", "furnitures", ID, "light", `${ID}.png`);
    fs.mkdirSync(path.dirname(thumbPng), { recursive: true });
    if (!fs.existsSync(thumbPng)) fs.writeFileSync(thumbPng, placeholderPng());
    // 2 ─ generated facts + draft
    for (const script of ["read-parts.mjs", "extract-structure.mjs"]) {
      const r = spawnSync(process.execPath, [path.join(REPO, "src", "game", "helper-scripts", script)],
        { stdio: "inherit", cwd: REPO });
      if (r.error) console.error(r.error.message);
      if (r.status !== 0) process.exit(r.status ?? 1);
    }
    const draftPath = path.join(dataDir, "dev", "draft.gen.json");
    let draft;
    try { draft = readJson(draftPath); }
    catch { console.error(`missing ${draftPath} — did extract-structure run?`); process.exit(1); }
    // 3 ─ scaffold data files (never overwrite an existing authored.ts without --force)
    const write = (file, content) => {
      const p = path.join(dataDir, file);
      if (fs.existsSync(p) && !flags.has("--force")) return console.log(`  keep ${file}`);
      fs.writeFileSync(p, content);
      console.log(`  wrote ${file}`);
    };
    write("authored.ts", emitAuthored(draft, { brand: "IKEA", category: "Other", link: "" }));
    write("thumbs.gen.ts", emitThumbsTs(ID));
    write("meta.ts", emitMetaTs(ID));
    write("index.ts", emitIndexTs(ID));
    // 4 ─ register
    const typePath = path.join(REPO, "src", "game", "core", "type.ts");
    const furnPath = path.join(REPO, "src", "game", "data", "furnitures", "furnitures.ts");
    try { fs.writeFileSync(typePath, patchFurnitureId(fs.readFileSync(typePath, "utf8"), ID)); }
    catch (e) { console.log(`  type.ts: ${e.message}`); }
    try { fs.writeFileSync(furnPath, patchFurnituresTs(fs.readFileSync(furnPath, "utf8"), ID)); }
    catch (e) { console.log(`  furnitures.ts: ${e.message}`); }
    // 5 ─ hardware paste-block for unseen articles
    const hw = fs.readFileSync(path.join(REPO, "src", "game", "data", "hardware.ts"), "utf8");
    const unseen = draft.rules.map((r) => r.group).filter((g) => !hw.includes(`${g}:`) && !hw.includes(`${g} :`));
    if (unseen.length) {
      console.log(`\nAdd to src/game/data/hardware.ts (before "} satisfies"):`);
      for (const g of unseen)
        console.log(`  ${g}: { tool: "screwdriver", label: { standard: "${g}" } },`);
    }
    // 6 ─ gates
    for (const script of ["validate-furniture.ts", "engine-test.ts"]) {
      const r = spawnSync(process.execPath, ["--import", "tsx",
        path.join(REPO, "src", "game", "helper-scripts", script), ID], { stdio: "inherit", cwd: REPO });
      if (r.error) console.error(r.error.message);
      console.log(`  ${script}: ${r.status === 0 ? "PASS" : "NEEDS WORK (expected for a fresh draft)"}`);
    }
    console.log(`\n${ID} installed. Refine ${path.relative(REPO, dataDir)}\\authored.ts until both gates pass.`);
  },
};

function findBlender() {
  if (process.env.BLENDER) return process.env.BLENDER;
  if (process.platform === "win32") {
    for (const base of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]].filter(Boolean)) {
      const dir = path.join(base, "Blender Foundation");
      if (!fs.existsSync(dir)) continue;
      for (const sub of fs.readdirSync(dir).sort().reverse()) {
        const exe = path.join(dir, sub, "blender.exe");
        if (fs.existsSync(exe)) return exe;
      }
    }
  }
  if (process.platform === "darwin") return "/Applications/Blender.app/Contents/MacOS/Blender";
  return "blender";
}

const fn = Object.hasOwn(commands, cmd) ? commands[cmd] : undefined;
if (!fn) {
  console.log("usage: processGLB <inspect|propose|answer|apply|verify|install> …");
  process.exit(2);
}
await fn(...args);
