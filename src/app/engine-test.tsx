// ─────────────────────────────────────────────────────────────────────────────
// DEV-ONLY ROUTE — remove before / after feature completion. To delete the engine-test harness entirely: remove this file and the `src/dev/` folder. Nothing else references either.
//
// The harness is gated behind `__DEV__`, so in production builds the block below is constant-folded away and the `require` is dropped from the bundle — none of `src/dev/` ships to users.
// ─────────────────────────────────────────────────────────────────────────────
import { Redirect } from "expo-router";

export default function EngineTestRoute() {
  if (__DEV__) {
    const EngineTestScreen =
      require("@/src/dev/engine-test/EngineTestScreen").default;
    return <EngineTestScreen />;
  }
  return <Redirect href="/" />;
}
