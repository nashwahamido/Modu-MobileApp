import type { PropsWithChildren } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import { findNodeHandle, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import type { TutorialTargetId } from './steps';
import { useTutorialTargets } from './targetRegistry';

interface Props extends PropsWithChildren {
  id: TutorialTargetId;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: 'box-none' | 'none' | 'box-only' | 'auto';
}

export function TutorialTarget({ id, style, pointerEvents = 'box-none', children }: Props) {
  const ref = useRef<View>(null);
  const setNode = useTutorialTargets((s) => s.setNode);
  const clearFrame = useTutorialTargets((s) => s.clearFrame);

  const registerNode = useCallback(() => {
    const node = findNodeHandle(ref.current);
    if (node) setNode(id, node);
  }, [id, setNode]);

  const handleLayout = (_event: LayoutChangeEvent) => {
    requestAnimationFrame(registerNode);
  };

  useEffect(() => {
    requestAnimationFrame(registerNode);
    return () => {
      clearFrame(id);
    };
  }, [clearFrame, id, registerNode]);

  return (
    <View ref={ref} style={style} pointerEvents={pointerEvents} onLayout={handleLayout} collapsable={false}>
      {children}
    </View>
  );
}
