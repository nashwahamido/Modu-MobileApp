import { FilamentView, Camera, EnvironmentalLight, Light, useCameraManipulator } from 'react-native-filament';
import { StyleSheet } from 'react-native';
import { PARTS, ALL_PART_IDS } from '../game/parts';
import { FOCAL_LENGTH_MM } from './cameraConfig';
import { IBL_INTENSITY, KEY_LIGHT } from './lighting';
import { PartModel } from './PartModel';
import { ToolModel } from './ToolModel';
import { SceneState } from './useSceneState';
import type { OffsetDriver } from './offsetDriver';

export type OrbitManipulator = ReturnType<typeof useCameraManipulator>;

interface Props {
  cameraManipulator: OrbitManipulator;
  sceneState: SceneState;
  heldDriver: OffsetDriver;
  sinkDriver: OffsetDriver;
}

/** The 3D workbench: camera, lights, and every part rendered by its game-state mode. */
export function AssemblyScene({ cameraManipulator, sceneState, heldDriver, sinkDriver }: Props) {
  const { modes, heldAction, activeTighten } = sceneState;
  return (
    <FilamentView style={styles.filament}>
      <Camera cameraManipulator={cameraManipulator} focalLengthInMillimeters={FOCAL_LENGTH_MM} />
      <EnvironmentalLight
        source={require('react-native-filament/assets/RNF_default_env_ibl.ktx')}
        intensity={IBL_INTENSITY}
      />
      <Light
        type="directional"
        colorKelvin={KEY_LIGHT.colorKelvin}
        intensity={KEY_LIGHT.intensity}
        direction={KEY_LIGHT.direction}
        castShadows
      />
      {ALL_PART_IDS.map((id) => (
        <PartModel
          key={id}
          def={PARTS[id]}
          mode={modes[id]}
          heldDriver={heldDriver}
          sinkDriver={sinkDriver}
          tightening={activeTighten?.partId === id}
          ghostAtLoosePose={heldAction?.type === 'insertFastener'}
        />
      ))}
      {activeTighten?.tool && activeTighten.partId ? (
        <ToolModel key={activeTighten.id} action={activeTighten} />
      ) : null}
    </FilamentView>
  );
}

const styles = StyleSheet.create({ filament: { flex: 1 } });
