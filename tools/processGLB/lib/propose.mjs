const EPS = 0.004; // contact epsilon, meters (matches extract-structure.mjs)

const camel = (raw) =>
  raw.replace(/\d{5,8}/g, " ").replace(/[^a-zA-Z0-9]+/g, " ").trim().split(/\s+/)
    .map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()))
    .join("") || "part";

const gapBetween = (a, b) => {
  let g = -Infinity;
  for (let i = 0; i < 3; i++)
    g = Math.max(g, a.worldMin[i] - b.worldMax[i], b.worldMin[i] - a.worldMax[i]);
  return g;
};

// strip trailing instance markers (".001", "_02", " 3", etc.) to merge geometry-fallback
// groups for repeated instances of the same part.
const stripInstance = (name) =>
  name.replace(/(\.\d{1,3})+$/, "").replace(/[\s_.-]*\d{1,4}$/, "");

export function buildProposal(inv, articles, fastenerPrefixes) {
  const nodes = inv.nodes;
  // 1 ─ group by article, else by quantized geometry (instances of one part)
  const keyOf = (n) =>
    n.article ? `a:${n.article}` :
    `g:${n.vertexCount}:${n.localDims.map((d) => Math.round(d * 200)).join("x")}:${camel(stripInstance(n.name))}`;
  const byKey = new Map();
  for (const n of nodes) (byKey.get(keyOf(n)) ?? byKey.set(keyOf(n), []).get(keyOf(n))).push(n);

  const groups = [...byKey.entries()].map(([key, ns]) => {
    const art = ns[0].article && articles[ns[0].article];
    const small = Math.max(...ns[0].worldDims) < 0.08;
    const elongated = ns[0].aspect >= 1.6;
    const type = art?.type ?? (small && elongated ? "fastener" : "structural");
    const kind = art?.kind ?? null;
    let suggestedGroup = art?.group ?? camel(stripInstance(ns[0].name));
    if (!art && type === "fastener" && !fastenerPrefixes.some((p) => suggestedGroup.startsWith(p)))
      suggestedGroup = `screw${ns[0].article ?? ""}`;
    return {
      key, article: ns[0].article, nodes: ns.map((n) => n.name),
      suggestedGroup, type, kind,
      confidence: art ? "high" : type === "fastener" ? "low" : "med",
    };
  });
  const groupOf = new Map();
  for (const g of groups) for (const nm of g.nodes) groupOf.set(nm, g);

  const structural = nodes.filter((n) => groupOf.get(n.name).type === "structural");
  const fasteners = nodes.filter((n) => groupOf.get(n.name).type === "fastener");

  // 2 ─ joints: expand the fastener bbox along its WORLD shaft, rank structural overlap volume
  const joints = fasteners.map((f) => {
    const ax = "XYZ".indexOf(f.worldShaftAxis);
    const grow = f.worldDims[ax] / 2 + 0.008;
    const min = [...f.worldMin], max = [...f.worldMax];
    min[ax] -= grow; max[ax] += grow;
    const cands = structural
      .map((s) => {
        let vol = 1;
        for (let i = 0; i < 3; i++) {
          const o = Math.min(max[i], s.worldMax[i]) - Math.max(min[i], s.worldMin[i]);
          if (o <= 0) return null;
          vol *= o;
        }
        return [s.name, +vol.toExponential(2)];
      })
      .filter(Boolean)
      .sort((a, b) => b[1] - a[1]);
    const endpoints = cands.slice(0, 2).map((c) => c[0]);
    const ambiguous = cands.length > 2 && cands[2][1] > cands[1][1] * 0.7;
    return { fastener: f.name, endpoints, candidates: cands.slice(0, 4),
      confidence: endpoints.length === 2 && !ambiguous ? "high" : "low" };
  });

  // 3 ─ clusters: union-find over structural contact
  const parent = new Map(structural.map((n) => [n.name, n.name]));
  const find = (x) => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x))), parent.get(x)));
  for (let i = 0; i < structural.length; i++)
    for (let j = i + 1; j < structural.length; j++)
      if (gapBetween(structural[i], structural[j]) <= EPS)
        parent.set(find(structural[i].name), find(structural[j].name));
  const comps = new Map();
  for (const n of structural)
    (comps.get(find(n.name)) ?? comps.set(find(n.name), new Set()).get(find(n.name)))
      .add(groupOf.get(n.name).key);
  const clusters = [...comps.values()].map((set, i) => ({
    id: `cluster${String.fromCharCode(65 + i)}`, groups: [...set],
  }));
  // fasteners follow their first endpoint's cluster at apply time.

  // 4 ─ mechanical fixes
  const unparent = nodes.filter((n) => n.parent != null).map((n) => n.name);
  const reorient = fasteners
    .filter((f) => f.shaftAxisLocal !== "Y" || f.headSign !== 1 || f.aspect < 2)
    .map((f) => ({ node: f.name, shaft: f.shaftAxisLocal, sign: f.headSign,
      confidence: f.aspect >= 2 ? "high" : "low" }));

  return { groups, clusters, unparent, reorient, joints };
}

export function buildQuestions(proposal, inv) {
  const qs = [];
  const byName = new Map(inv.nodes.map((n) => [n.name, n]));
  for (const c of proposal.clusters)
    qs.push({ id: `cluster:${c.id}`, topic: "cluster name",
      prompt: `Name the assembly cluster containing: ${c.groups.slice(0, 6).join(", ")}${c.groups.length > 6 ? "…" : ""}`,
      refs: c.groups, options: [
        { key: "a", label: c.id, value: c.id },
        { key: "b", label: "whole (single-cluster furniture)", value: "whole" },
        { key: "c", label: "type a custom name", value: "__custom__" },
      ], default: "a" });
  for (const g of proposal.groups) {
    if (!g.article)
      qs.push({ id: `group:${g.key}`, topic: "group name",
        prompt: `Group name for ${g.nodes.length}x "${g.nodes[0]}" (${g.type})`,
        refs: g.nodes, options: [
          { key: "a", label: g.suggestedGroup, value: g.suggestedGroup },
          { key: "b", label: "type a custom name", value: "__custom__" },
        ], default: "a" });
    if (!g.article && g.type === "fastener")
      qs.push({ id: `type:${g.key}`, topic: "part type",
        prompt: `Is "${g.nodes[0]}" a fastener (screw/bolt/cam/dowel) or a structural part?`,
        refs: g.nodes, options: [
          { key: "a", label: "fastener", value: "fastener" },
          { key: "b", label: "structural", value: "structural" },
        ], default: "a" });
    if (g.type === "fastener" && !g.kind)
      qs.push({ id: `kind:${g.key}`, topic: "fastener kind",
        prompt: `When does the joint made by "${g.nodes[0]}" lock? (decides prefix + game mechanic)`,
        refs: g.nodes, options: [
          { key: "a", label: "screw — secures an existing joint (no lock)", value: "secured" },
          { key: "b", label: "bolt — threaded; joint locks once one side is placed", value: "threaded" },
          { key: "c", label: "cam — turn to lock after both sides placed", value: "cam" },
          { key: "d", label: "dowel/pin — preloaded, counterpart drops on", value: "pin" },
        ], default: "a" });
  }
  for (const r of proposal.reorient.filter((r) => r.confidence === "low")) {
    const n = byName.get(r.node);
    qs.push({ id: `head:${r.node}`, topic: "fastener head end",
      prompt: `"${r.node}": which end is the HEAD (the side it drives in from)? shaft=${r.shaft}, world pos ${n.worldPos.join(", ")}`,
      refs: [r.node], options: [
        { key: "a", label: `+${r.shaft} end`, value: 1 },
        { key: "b", label: `-${r.shaft} end`, value: -1 },
      ], default: r.sign === 1 ? "a" : "b" });
  }
  for (const j of proposal.joints.filter((j) => j.confidence === "low")) {
    const cands = j.candidates.slice(0, 3);
    const pairs = [[0, 1, "a"], [0, 2, "b"], [1, 2, "c"]]
      .filter(([i, k]) => cands[i] && cands[k])
      .map(([i, k, key]) => ({ key, label: `${cands[i][0]} & ${cands[k][0]}`, value: [cands[i][0], cands[k][0]] }));
    const options = pairs.concat([
      cands.length >= 1
        ? { key: "d", label: "single endpoint (cap/securer)", value: [cands[0][0]] }
        : { key: "d", label: "no reachable endpoint (leave unnamed)", value: [] },
    ]);
    qs.push({ id: `joint:${j.fastener}`, topic: "joint endpoints",
      prompt: `"${j.fastener}" connects which two parts?`,
      refs: [j.fastener, ...j.candidates.map((c) => c[0])],
      options, default: pairs.length > 0 ? "a" : "d" });
  }
  return qs;
}
