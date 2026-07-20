import { useCallback } from "react";
import { useFocusEffect } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";

export function useScreenOrientationLock(
  orientationLock: ScreenOrientation.OrientationLock,
): void {
  useFocusEffect(
    useCallback(() => {
      ScreenOrientation.lockAsync(orientationLock).catch((error) => {
        console.warn("Failed to lock screen orientation", error);
      });
    }, [orientationLock]),
  );
}
