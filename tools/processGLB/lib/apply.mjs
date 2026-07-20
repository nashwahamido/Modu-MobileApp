// tools/processGLB/lib/apply.mjs
import { buildName, partIdOf } from "./naming.mjs";

const posKey = (n) => [-n.worldPos[2], -n.worldPos[1], n.worldPos[0]];
const byPos = (inv) => {
  const m = new Map(inv.nodes.map((n) => [n.name, n]));
  return (a, b) => {
    const ka = posKey(m.get(a)), kb = posKey(m.get(b));
    for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    return a < b ? -1 : 1;
  };
};

export function buildOps(inv, proposal, resolved, fastenerPrefixes) {
  const report = { warnings: [] };
  const clusterName = (cid) => resolved.get(`cluster:${cid}`) ?? cid;
  const groupName = (g) =>
    resolved.get(`group:${g.key}`) ?? g.suggestedGroup;
  const kindOf = (g) => resolved.get(`kind:${g.key}`) ?? g.kind;
  // an answered "type:<groupKey>" question can flip a heuristic fastener
  // group to structural (or vice versa) — this is the effective type used
  // everywhere buildOps branches on g.type.
  const effType = (g) => resolved.get(`type:${g.key}`) ?? g.type;

  // fastener group prefix must reflect the (possibly answered) kind
  const KIND_PREFIX = { secured: "screw", threaded: "bolt", cam: "cam", pin: "dowel" };
  const finalGroupName = (g) => {
    let name = groupName(g);
    if (effType(g) === "fastener") {
      const want = KIND_PREFIX[kindOf(g) ?? "secured"];
      if (!fastenerPrefixes.some((p) => name.startsWith(p))) name = want + (g.article ?? "");
      else if (!name.startsWith(want)) {
        // replace the leading prefix word with the answered kind's word
        const cur = fastenerPrefixes.find((p) => name.startsWith(p));
        name = want + name.slice(cur.length);
      }
    }
    return name;
  };

  const clusterOfGroup = new Map();
  for (const c of proposal.clusters)
    for (const gk of c.groups) clusterOfGroup.set(gk, clusterName(c.id));
  const nodeGroup = new Map();
  for (const g of proposal.groups) for (const nm of g.nodes) nodeGroup.set(nm, g);
  const jointsByFastener = new Map(proposal.joints.map((j) => [j.fastener,
    resolved.get(`joint:${j.fastener}`) ?? j.endpoints]));
  const nearestStructuralCluster = (nodeName) => {
    // fastener fallback: cluster of first endpoint, else first cluster
    const eps = jointsByFastener.get(nodeName) ?? [];
    for (const e of eps) {
      const g = nodeGroup.get(e);
      if (g && clusterOfGroup.has(g.key)) return clusterOfGroup.get(g.key);
    }
    return clusterName(proposal.clusters[0]?.id ?? "whole");
  };

  // pass 0: which final group names span multiple clusters (forces global index)
  // a group's cluster comes from clusterOfGroup when it was originally structural
  // (i.e. it's a member of one of proposal.clusters); an answered fastener→structural
  // group has no cluster membership of its own, so — same as the fastener pass — its
  // per-node cluster is resolved via nearestStructuralCluster.
  const clustersPerName = new Map();
  for (const g of proposal.groups) {
    if (effType(g) !== "structural") continue;
    const fn = finalGroupName(g);
    const set = clustersPerName.get(fn) ?? clustersPerName.set(fn, new Set()).get(fn);
    const cl = clusterOfGroup.get(g.key);
    if (cl) set.add(cl);
    else for (const nm of g.nodes) set.add(nearestStructuralCluster(nm));
  }

  const renames = new Map();
  const emitGroup = (g, joints = null) => {
    const fn = finalGroupName(g);
    const cl = effType(g) === "structural" ? clusterOfGroup.get(g.key) : null;
    const multiCluster = (clustersPerName.get(fn)?.size ?? 0) > 1;
    const needIndex = g.nodes.length > 1 || multiCluster;
    const sorted = [...g.nodes].sort(byPos(inv));
    sorted.forEach((nodeName, i) => {
      const cluster = cl ?? nearestStructuralCluster(nodeName);
      renames.set(nodeName, buildName({
        cluster,
        group: fn,
        index: needIndex ? i + 1 : undefined,
        joints: joints ? joints(nodeName) : undefined,
      }));
    });
  };

  for (const g of proposal.groups.filter((g) => effType(g) === "structural")) emitGroup(g);
  const pidOfNode = (nodeName) => partIdOf(renames.get(nodeName) ?? nodeName);
  for (const g of proposal.groups.filter((g) => effType(g) === "fastener"))
    emitGroup(g, (nodeName) => {
      const eps = (jointsByFastener.get(nodeName) ?? []).map(pidOfNode);
      return eps.length ? eps : undefined;
    });

  // validation
  const pids = [...renames.values()].map(partIdOf);
  const dup = pids.filter((p, i) => pids.indexOf(p) !== i);
  if (dup.length) throw new Error(`duplicate partId(s): ${[...new Set(dup)].join(", ")}`);
  const pidSet = new Set(pids);
  for (const [nodeName, finalName] of renames) {
    const m = finalName.match(/__(.+)$/);
    if (m) for (const ep of m[1].split("&"))
      if (!pidSet.has(ep)) report.warnings.push(`${finalName}: endpoint "${ep}" is not a partId`);
  }
  for (const finalName of new Set(renames.values()))
    if (finalName.length > 60) report.warnings.push(`"${finalName}": exceeds 60 chars (Blender truncates at 63)`);

  // groups answered fastener→structural lose their fastener treatment entirely:
  // their nodes were never mechanically re-oriented as fasteners, so drop them
  // from reorient (their names have already been rewritten above, without a
  // fastener prefix or __joints suffix).
  const answeredStructuralNodes = new Set();
  for (const g of proposal.groups)
    if (g.type === "fastener" && effType(g) === "structural")
      for (const nm of g.nodes) answeredStructuralNodes.add(nm);

  const ops = {
    renames: [...renames.entries()],
    unparent: proposal.unparent.map((n) => renames.get(n) ?? n),
    reorient: proposal.reorient
      .filter((r) => !answeredStructuralNodes.has(r.node))
      .map((r) => ({
        node: renames.get(r.node) ?? r.node,
        shaft: r.shaft,
        sign: resolved.get(`head:${r.node}`) ?? r.sign,
      })),
  };
  return { ops, report };
}
