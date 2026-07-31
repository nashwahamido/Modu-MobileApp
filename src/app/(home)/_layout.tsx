// The persistent hub. Room is the only screen the navigator keeps mounted, so nothing here ever tears down the Room scene. Everything heavier (the assembly task, a friend-room visit) lives OUTSIDE this group as its own route; everything lighter (settings, profile, store, inventory) is a modal layer over it; the task catalogue is a full-screen page pushed over the room, which stays mounted beneath it. No tab bar: the room's own buttons are the navigation.
import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="room"
      screenOptions={{ headerShown: false }}
      tabBar={() => null}
    >
      <Tabs.Screen name="room" />
    </Tabs>
  );
}
