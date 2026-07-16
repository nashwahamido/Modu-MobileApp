import { StyleSheet, Text, View } from "react-native";

export function RoomScene() {
  return (
    <View style={styles.fallback}>
      <Text style={styles.text}>Room preview is available in the iOS app.</Text>
    </View>
  );
}

export function setRoomCameraTarget() {}

const styles = StyleSheet.create({
  fallback: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f6efe4" },
  text: { color: "#6a6258", fontSize: 14, fontWeight: "700" },
});
