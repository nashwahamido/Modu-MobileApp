import { Redirect } from "expo-router";

export default function EngineTestRoute() {
  if (__DEV__) {
    const EngineTestScreen =
      require("@/src/dev/engine-test/EngineTestScreen").default;
    return <EngineTestScreen />;
  }
  return <Redirect href="/" />;
}
