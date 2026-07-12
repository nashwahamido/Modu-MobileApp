import { useEffect } from 'react';
import { Model, ModelRenderer, useFilamentContext, useModel } from 'react-native-filament';
import { PartDef } from '../game/parts';
import { looseDelta } from '../game/staging';
import { useGameStore } from '../game/store';
import type { FitState } from '../game/fit';
import type { PartMode } from './useSceneState';
import type { OffsetDriver } from './offsetDriver';

/**
 * Ghost colors follow the PDD color language; emissive glow is used because
 * the DALFRED materials are opaque near-black glTF — runtime alpha is ignored
 * and base-color tints are swallowed by the dark albedo.
 */
const FIT_GLOW: Record<FitState, [number, number, number]> = {
  idle: [0.08, 0.3, 0.85], // blue — discoverable
  held: [0.08, 0.3, 0.85],
  nearCorrect: [0.05, 0.8, 0.3], // green — ready to place
  nearRotation: [0.95, 0.45, 0.08], // orange — orientation attention
  wrongTarget: [0.85, 0.12, 0.12], // red — wrong socket
};

interface Props {
  def: PartDef;
  mode: PartMode;
  /** Drives the held part's offset (owned by the drag gesture). */
  heldDriver: OffsetDriver;
  /** Drives the active fastener's sink-to-flush offset (owned by TightenControl). */
  sinkDriver: OffsetDriver;
  /** True when this fastener's tighten gesture is active. */
  tightening?: boolean;
  /** Ghost drop target is the loose pose (inserts) instead of the baked pose. */
  ghostAtLoosePose?: boolean;
}

/** Glowing duplicate of the part at its drop-target pose, shown while held. */
function Ghost({ def, atLoosePose }: { def: PartDef; atLoosePose: boolean }) {
  const model = useModel(def.asset);
  const { renderableManager } = useFilamentContext();
  const fitState = useGameStore((s) => s.fitState);

  useEffect(() => {
    if (model.state !== 'loaded') return;
    const glow = FIT_GLOW[fitState];
    for (const entity of model.asset.getRenderableEntities()) {
      const primitives = renderableManager.getPrimitiveCount(entity);
      for (let i = 0; i < primitives; i++) {
        const mi = renderableManager.getMaterialInstanceAt(entity, i);
        try {
          mi.setFloat3Parameter('emissiveFactor', glow);
        } catch {
          // material variant without emissive — leave it as-is
        }
      }
    }
  }, [model, renderableManager, fitState]);

  if (model.state !== 'loaded') return null;
  return <ModelRenderer model={model} translate={atLoosePose ? looseDelta(def.id) : undefined} />;
}

/** A part whose offset is animated imperatively via an OffsetDriver. */
function DrivenModel({ def, driver, initial }: { def: PartDef; driver: OffsetDriver; initial: [number, number, number] }) {
  const model = useModel(def.asset);
  const { transformManager } = useFilamentContext();
  useEffect(() => {
    if (model.state !== 'loaded') return;
    driver.attach(transformManager, model.rootEntity, initial);
    return () => driver.detach();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.state]);
  if (model.state !== 'loaded') return null;
  return <ModelRenderer model={model} />;
}

export function PartModel({ def, mode, heldDriver, sinkDriver, tightening, ghostAtLoosePose }: Props) {
  switch (mode) {
    case 'hidden':
      return null;
    case 'flush':
      return <Model key={`${def.id}-flush`} source={def.asset} />;
    case 'loose':
      return tightening ? (
        <DrivenModel key={`${def.id}-sink`} def={def} driver={sinkDriver} initial={looseDelta(def.id)} />
      ) : (
        <Model key={`${def.id}-loose`} source={def.asset} translate={looseDelta(def.id)} />
      );
    case 'held':
      return (
        <>
          <DrivenModel key={`${def.id}-held`} def={def} driver={heldDriver} initial={heldDriver.value} />
          <Ghost def={def} atLoosePose={ghostAtLoosePose ?? false} />
        </>
      );
  }
}
