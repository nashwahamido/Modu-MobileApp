// tools/processGLB/lib/answer.mjs
import readline from "node:readline/promises";

export function resolveAnswers(questions, answers = {}) {
  const out = new Map();
  for (const q of questions) {
    const key = answers[q.id] ?? q.default;
    const opt = q.options.find((o) => o.key === key) ?? q.options.find((o) => o.key === q.default);
    let value = opt?.value;
    if (value === "__custom__") value = answers[`${q.id}:custom`] ?? opt.label;
    out.set(q.id, value);
  }
  return out;
}

/** Interactive numbered-choice loop. Enter = default. Writes nothing; returns answers object. */
export async function askInteractive(questions, existing = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answers = { ...existing };
  let i = 0;
  for (const q of questions) {
    i++;
    console.log(`\n[${i}/${questions.length}] (${q.topic}) ${q.prompt}`);
    for (const o of q.options) console.log(`   ${o.key}) ${o.label}${o.key === q.default ? "   [default]" : ""}`);
    const raw = (await rl.question("> ")).trim().toLowerCase();
    const key = raw || q.default;
    answers[q.id] = key;
    const opt = q.options.find((o) => o.key === key);
    if (opt?.value === "__custom__")
      answers[`${q.id}:custom`] = (await rl.question("  custom value > ")).trim();
  }
  rl.close();
  return answers;
}
