// LACK needs no dynamic gates — all ordering is expressible with plain
// `requires` edges (top before legs, leg before its screw). Kept as an empty
// map so the Furniture shape and validator stay consistent with DALFRED.
import { Gate } from "@/src/adhd/core/type";

export const GATES: Record<string, Gate> = {};
