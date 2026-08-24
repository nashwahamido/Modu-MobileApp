// Declarative replacement for Gate closures. Deliberately tiny and monotone-except-implies: all/any/done cover conjunction and disjunction, implies covers the only negative form any real gate uses (¬A ∨ B). Refs expand ONCE at compile time — the returned closure does set lookups only, same cost profile as the hand-written gates it replaces.
import type { Gate, PartDef, PartId } from "@/src/game/core/type";
import { expandRef, type ActionRef } from "./refs";

export type GateExpr =
  | { all: GateExpr[] }
  | { any: GateExpr[] }
  | { done: ActionRef }
  | { implies: [ActionRef, ActionRef] };

type Parts = Record<PartId, PartDef>;

export function compileGate(expr: GateExpr, parts: Parts): Gate {
  if ("all" in expr) {
    const subs = expr.all.map((e) => compileGate(e, parts));
    return (done) => subs.every((g) => g(done));
  }
  if ("any" in expr) {
    const subs = expr.any.map((e) => compileGate(e, parts));
    return (done) => subs.some((g) => g(done));
  }
  if ("implies" in expr) {
    const [a, b] = expr.implies.map((r) => expandRef(r, parts));
    return (done) => !a.every((id) => done.has(id)) || b.every((id) => done.has(id));
  }
  const ids = expandRef(expr.done, parts);
  return (done) => ids.every((id) => done.has(id));
}
