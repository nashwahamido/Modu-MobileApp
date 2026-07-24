// The placeholder furniture sprite for the Wooden Shelving Unit — rendered both as the draggable piece in the room and as the preview in the Inventory tile, so extracted here to share. There is no real 3D model yet; this is a flat drawing. Colours are literal (not themed) by design.
import { StyleSheet, View } from "react-native";

export function Cabinet() {
  return (
    <View style={s.cabinet}>
      <View style={s.topWood} />
      <View style={s.drawers}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={s.drawer}>
            <View style={s.knob} />
          </View>
        ))}
      </View>
      <View style={s.legs}>
        <View style={s.leg} />
        <View style={s.leg} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  cabinet: { width: 110, height: 78, backgroundColor: "#b8783f", borderWidth: 2, borderColor: "#754621" },
  topWood: { height: 10, backgroundColor: "#d79a58" },
  drawers: { height: 56, flexDirection: "row", flexWrap: "wrap" },
  drawer: { width: "33.33%", height: "50%", borderWidth: 0.7, borderColor: "#754621", alignItems: "center", justifyContent: "center" },
  knob: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#58331b" },
  legs: { height: 12, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 8 },
  leg: { width: 6, height: 12, backgroundColor: "#754621" },
});
