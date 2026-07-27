import { StatusBar } from "expo-status-bar";
import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Text, View } from "react-native";
import { RoomExperience } from "@/src/room/ui/RoomExperience";
import { styles } from "./room.styles";

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
