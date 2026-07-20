// Mirrors src/game/helper-scripts/read-parts.mjs parseName — keep in sync.
export function parseName(name) {
  const dd = name.indexOf("__");
  const head = dd === -1 ? name : name.slice(0, dd);
  const [cluster, group, i, ...rest] = head.split("_");
  const hasIndex = i !== undefined && /^\d+$/.test(i);
  const spec = dd === -1 ? (rest.length ? rest.join("_") : undefined) : name.slice(dd + 2);
  return {
    cluster,
    group,
    index: hasIndex ? Number(i) : undefined,
    partId: hasIndex ? `${group}_${Number(i)}` : group,
    attached: spec ? spec.split("&") : undefined,
  };
}

export const partIdOf = (name) => parseName(name).partId;

export function buildName({ cluster, group, index, joints }) {
  let n = `${cluster}_${group}`;
  if (index != null) n += `_${index}`;
  if (joints?.length) n += `__${joints.join("&")}`;
  return n;
}

export const humanize = (s) =>
  ((t) => t.charAt(0).toUpperCase() + t.slice(1))(
    s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([a-zA-Z])(\d)/g, "$1 $2").toLowerCase(),
  );
