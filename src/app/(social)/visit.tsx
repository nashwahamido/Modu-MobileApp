import { useEffect, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";

import { Button } from "@/src/game/ui/system/Button";
import { SceneBackdrop } from "@/src/game/ui/backdrop/SceneBackdrop";
import { useGameStore } from "@/src/game/core/store";
import { usePrefsStore } from "@/src/game/core/prefsStore";
import { TYPE, SPACE, useFixedStyles } from "@/src/game/ui/system/theme";
import type { Theme } from "@/src/game/ui/system/theme";
import { useCurrentUserId, useRepos } from "@/src/data";
import type { Profile } from "@/src/data";
import { ceilingLightOn, timeOfDayPhase, type CeilingLightOverride } from "@/src/room/core/timeOfDay";
import { readRoomFinishes } from "@/src/data/room/layoutMigrate";
import { sanitizeLayout } from "@/src/room/core/layoutSanitise";
import { toGrid, usePlacementStore } from "@/src/room/core/placement";
import { ORBIT } from "@/src/room/input/orbit";
import { RoomScene } from "@/src/room/scene/RoomScene";
import { useSceneSlot } from "@/src/game/scene/sceneSlot";
import { roomBackgroundView } from "@/src/room/ui/roomBackdrops";
import {
  LIGHT_COLUMN_GAP,
  ROOM_CHIP_SIZE,
  RoomLightControls,
} from "@/src/room/ui/RoomLightControls";
import { RoomLoadingOverlay } from "@/src/room/ui/RoomLoadingOverlay";
import { VisitHud } from "@/src/room/ui/VisitHud";
import { useScreenInsets } from '@/src/hooks/use-safe-insets';

export default function VisitScreen() {
  const s = useFixedStyles(makeStyles);
  const repos = useRepos();
  const me = useCurrentUserId();
  const { ownerId } = useLocalSearchParams<{ ownerId?: string }>();
  const safe = useScreenInsets();
  const hour = usePrefsStore((g) => g.roomTimeOfDay);
  const roomBackground = usePrefsStore((g) => g.roomBackground);
  const setRoomTimeOfDay = usePrefsStore((g) => g.setRoomTimeOfDay);
  const [lightOverride, setLightOverride] = useState<CeilingLightOverride>(null);
  const ceilingLight = ceilingLightOn(hour, lightOverride);
  const startViewing = usePlacementStore((p) => p.startViewing);
  const stopViewing = usePlacementStore((p) => p.stopViewing);

  const [host, setHost] = useState<Profile | null>(null);
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(0);
  const [empty, setEmpty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const sceneSlot = useSceneSlot("visit");

  const [roomRotation, setRoomRotation] = useState(0);
  const [roomZoom, setRoomZoom] = useState(1);
  const roomRotationRef = useRef(roomRotation);
  const roomZoomRef = useRef(roomZoom);
  useEffect(() => {
    roomRotationRef.current = roomRotation;
    roomZoomRef.current = roomZoom;
  }, [roomRotation, roomZoom]);
  const applyRoomControls = (nextRotation: number, nextZoom: number) => {
    const clampedZoom = Math.max(ORBIT.zoom.min, Math.min(ORBIT.zoom.max, nextZoom));
    roomRotationRef.current = nextRotation;
    roomZoomRef.current = clampedZoom;
    setRoomRotation(nextRotation);
    setRoomZoom(clampedZoom);
  };

  useEffect(() => {
    if (!ownerId) {
      setLoadError(true);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setLoadError(false);
    (async () => {
      try {
        const [saved, profile, hasLiked] = await Promise.all([
          repos.rooms.get(ownerId),
          repos.profiles.get(ownerId),
          repos.likes.hasLiked(ownerId, me),
        ]);
        if (!alive) return;
        if (profile === null) {
          setLoadError(true);
          return;
        }
        const layout = sanitizeLayout(saved.placements.map(toGrid));
        const finishes = readRoomFinishes(saved);
        startViewing(ownerId, layout, finishes);
        setHost(profile);
        setLiked(hasLiked);
        setLikes(profile?.likes ?? 0);
        setEmpty(layout.length === 0);
      } catch (err) {
        console.warn("[visit] could not open the room:", (err as Error).message);
        if (alive) setLoadError(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [me, ownerId, repos, startViewing]);

  useEffect(
    () => () => {
      stopViewing();
    },
    [stopViewing],
  );

  const toggleLike = async () => {
    if (!ownerId) return;
    const wasLiked = liked;
    const previous = likes;
    setLiked(!wasLiked);
    setLikes(previous + (wasLiked ? -1 : 1));
    try {
      if (wasLiked) await repos.likes.unlike(ownerId, me);
      else await repos.likes.like(ownerId, me);
    } catch (err) {
      console.warn("[visit] could not change the like:", (err as Error).message);
      setLiked(wasLiked);
      setLikes(previous);
    }
  };

  if (loadError) {
    return (
      <View style={[s.screen, s.center]}>
        <Text style={s.errorText}>Couldn&apos;t load this room. Check your connection.</Text>
        <Button label="Back" variant="primary" onPress={() => router.back()} />
      </View>
    );
  }

  const hostName = host?.username ?? "Builder";

  return (
    <View style={s.screen}>
      <SceneBackdrop {...roomBackgroundView(roomBackground, timeOfDayPhase(hour))} style={s.stage}>
        {loading || !sceneSlot ? null : (
          <RoomScene
            rotationY={roomRotation}
            zoom={roomZoom}
            onRotationChange={(next) => applyRoomControls(next, roomZoomRef.current)}
            onZoomChange={(next) => applyRoomControls(roomRotationRef.current, next)}
            ceilingLight={ceilingLight}
            onReady={() => setSceneReady(true)}
          />
        )}
      </SceneBackdrop>

      <RoomLightControls
        hour={hour}
        onHourChange={setRoomTimeOfDay}
        lightOn={ceilingLight}
        onToggleLight={() =>
          setLightOverride({
            hour,
            on: !ceilingLight,
          })
        }
        style={[
          s.lightControls,
          {
            top: 12 + safe.top + ROOM_CHIP_SIZE + LIGHT_COLUMN_GAP,
            left: 22 + safe.left,
          },
        ]}
      />

      <VisitHud
        host={host}
        liked={liked}
        likes={likes}
        empty={empty}
        onToggleLike={toggleLike}
        onBack={() => router.back()}
      />

      {revealed ? null : (
        <RoomLoadingOverlay
          dataReady={!loading}
          sceneReady={sceneReady}
          label={`${hostName}'s room`}
          onRevealed={() => setRevealed(true)}
        />
      )}
      <StatusBar style="dark" />
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    lightControls: {
      position: "absolute",
      zIndex: 12,
    },
    screen: {
      flex: 1,
      backgroundColor: t.bg,
      overflow: "hidden",
    },
    stage: StyleSheet.absoluteFillObject,
    center: {
      alignItems: "center",
      justifyContent: "center",
      gap: SPACE.md,
    },
    errorText: {
      ...TYPE.body,
      color: t.textFaint,
      textAlign: "center",
      padding: SPACE.lg,
    },
  });
