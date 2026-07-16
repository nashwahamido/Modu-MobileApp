import { StatusBar } from "expo-status-bar";
import { Component, useEffect, useState } from "react";
import type { ComponentType, ErrorInfo, ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

type RoomExperienceComponent = ComponentType;

class RoomErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("Room preview failed to render.", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.fallback}>
          <Text style={styles.title}>Room preview could not open.</Text>
          <Text style={styles.message}>{this.state.error}</Text>
        </View>
      );
    }

    return this.props.children;
  }
}

export default function RoomRoute() {
  const [RoomExperience, setRoomExperience] = useState<RoomExperienceComponent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      // Load the 3D room only after this route is opened, so Three.js cannot block app startup.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const module = require("@/src/room/RoomExperience") as { RoomExperience: RoomExperienceComponent };
      setRoomExperience(() => module.RoomExperience);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Room could not be loaded.");
    }
  }, []);

  if (error) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.title}>Room preview could not open.</Text>
        <Text style={styles.message}>{error}</Text>
      </View>
    );
  }

  if (!RoomExperience) {
    return (
      <View style={styles.fallback}>
        <ActivityIndicator color="#665f55" />
        <Text style={styles.message}>Loading room...</Text>
      </View>
    );
  }

  return (
    <>
      <RoomErrorBoundary>
        <RoomExperience />
      </RoomErrorBoundary>
      <StatusBar style="dark" />
    </>
  );
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#F3ECE0",
    padding: 28,
  },
  title: { color: "#231F20", fontSize: 22, fontWeight: "900", textAlign: "center" },
  message: { color: "#665f55", fontSize: 14, fontWeight: "700", textAlign: "center" },
});
