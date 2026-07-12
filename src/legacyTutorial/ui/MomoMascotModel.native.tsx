import {
  Camera,
  EnvironmentalLight,
  FilamentScene,
  FilamentView,
  Light,
  Model,
} from "react-native-filament";
import { StyleSheet } from "react-native";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const lunaMascotModel = require("../assets/mascot/luna-mascot.glb");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const defaultEnvironment = require("react-native-filament/assets/RNF_default_env_ibl.ktx");

function MascotScene() {
  return (
    <FilamentView style={styles.canvas}>
      <Camera
        cameraPosition={[0, 0.24, 4.05]}
        cameraTarget={[0, 0.24, 0]}
        focalLengthInMillimeters={48}
      />
      <EnvironmentalLight
        source={defaultEnvironment}
        intensity={52000}
      />
      <Light
        type="directional"
        colorKelvin={5400}
        intensity={130000}
        direction={[0.35, -0.75, -0.55]}
        castShadows={false}
      />
      <Light
        type="point"
        colorKelvin={3800}
        intensity={55000}
        position={[-1.1, 1.1, 2.3]}
        castShadows={false}
      />
      <Light
        type="point"
        colorKelvin={6800}
        intensity={18000}
        position={[1.2, 1.4, 2.0]}
        castShadows={false}
      />
      <Model
        source={lunaMascotModel}
        transformToUnitCube
        scale={[1.95, 1.95, 1.95]}
        translate={[0, -0.34, 0]}
        rotate={[0, -0.04, 0]}
      />
    </FilamentView>
  );
}

export function MomoMascotModel() {
  return (
    <FilamentScene>
      <MascotScene />
    </FilamentScene>
  );
}

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
    backgroundColor: "transparent",
  },
});
