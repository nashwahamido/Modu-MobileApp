import { useEffect } from "react";
import {
  ModelRenderer,
  useFilamentContext,
  useModel,
} from "react-native-filament";
import type { AssetSrc } from "@/src/game/core/type";

const FLOOR_Y = -0.004;

export function ShadowPlane({ source }: { source: AssetSrc }) {
  const model = useModel(source);
  const { transformManager } = useFilamentContext();

  useEffect(() => {
    if (model.state !== "loaded") return;
    transformManager.setEntityPosition(model.rootEntity, [0, FLOOR_Y, 0], false);
  }, [model, transformManager]);

  if (model.state !== "loaded") return null;
  return <ModelRenderer model={model} />;
}
