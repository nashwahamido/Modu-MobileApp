import { StatusBar } from "expo-status-bar";
import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { RoomExperience } from "@/src/room/ui/RoomExperience";

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
