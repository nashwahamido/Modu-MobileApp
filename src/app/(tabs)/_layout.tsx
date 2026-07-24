// The persistent hub. Room and the task catalogue are sibling tabs the navigator keeps mounted, so switching between them never tears down the Room scene. Everything heavier (the assembly task, a friend-room visit) lives OUTSIDE this group as its own route; everything lighter (settings, profile, store, inventory) is a modal layer over it.
import { Tabs } from "expo-router";

import { AppNavigation } from "@/src/components/AppNavigation";

export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="room"
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <AppNavigation {...props} />}
    >
      <Tabs.Screen name="catalogue" />
      <Tabs.Screen name="room" />
    </Tabs>
  );
}
