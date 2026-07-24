// The first-run flow: auth -> create-account -> loading -> questionnaire -> avatar. Full-screen, no tab bar, no 3D engine — a plain stack that isolates the entry sequence from the hub. It exits into /tutorial or /room. (The tutorial itself is a heavy 3D scene, so it lives at the root, not here.)
import { Stack } from "expo-router";

export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
