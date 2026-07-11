// Focus Mode — the ADHD-friendly LACK build.
//
// This mounts the parallel engine in `src/adhd/` (imported here as its default export, which already wraps <FilamentScene/>). It is intentionally separate from the standard `/play` route so the two workflows never interfere.
//
// For now this is LACK-only (the ADHD engine assembles the LACK table). Later, the "Choose your experience" step can be replaced with per-user personalization that decides which engine to route into.
import AdhdGameScreen from "@/src/adhd/GameScreen";

export default function PlayAdhdRoute() {
  return <AdhdGameScreen />;
}
