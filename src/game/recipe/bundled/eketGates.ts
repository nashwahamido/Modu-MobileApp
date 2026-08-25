// EKET's three gates in GateExpr form — the acceptance artifact for the grammar (behavioral equivalence is proven in gateExpr.test.ts; this module is the canonical copy the round-trip consumes).
import type { GateExpr } from "../gateExpr";

export const EKET_GATE_EXPRS: Record<string, GateExpr> = {
  topPanelClosesAfterBack: { implies: ["place_bottomPanel", "place_backPanel"] },
  bottomPanelClosesAfterBack: { implies: ["place_topPanel", "place_backPanel"] },
  suspAfterRearHardware: {
    all: [
      { done: "place_stabilizerRod_1" },
      { done: "place_stabilizerRod_2" },
      { done: "tighten-group:dowel145572" },
      { done: "tighten-group:cam139434" },
      { done: "tighten-group:dowel139435" },
    ],
  },
};

// EKET's one function-typed fastener rule in JSON form: pin requires its bore-mate cam (rule-based pairing) plus the back panel the pins pass through.
export const EKET_PIN_RULE_JSON = { group: "dowel139435", stage: 3, requiresExtra: ["place_backPanel"], pairedWith: { group: "cam139434" } } as const;
