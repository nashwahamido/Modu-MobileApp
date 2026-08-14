// A friend's room, read-only: their furniture under YOUR light (room decor is a local setting, not saved per room — see the spec). Its own route rather than a layer over the hub because it runs a Filament scene, and only one engine may run at a time: the route name `visit` is exactly what RoomExperience's HEAVY_ROUTES matches to drop the hub's scene, which is why this file sits in a group with NO _layout.tsx and the owner id travels as a query param instead of a path segment.
import { useEffect, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";

import { Button } from "@/src/game/ui/system/Button";
import { SceneBackdrop } from "@/src/game/ui/backdrop/SceneBackdrop";
import { useGameStore } from "@/src/game/core/store";
import { TYPE, SPACE, useFixedStyles } from "@/src/game/ui/system/theme";
import type { Theme } from "@/src/game/ui/system/theme";
import { useCurrentUserId, useRepos } from "@/src/data";
import type { Profile } from "@/src/data";
import { ceilingLightOn, sunPreset, type CeilingLightOverride } from "@/src/room/core/timeOfDay";
import { readRoomFinishes } from "@/src/data/room/layoutMigrate";
import { sanitizeLayout } from "@/src/room/core/layoutSanitise";
import { toGrid, usePlacementStore } from "@/src/room/core/placement";
import { ORBIT } from "@/src/room/input/orbit";
import { RoomScene } from "@/src/room/scene/RoomScene";
import { roomBackdropView } from "@/src/room/ui/roomBackdrops";
import { RoomLightControls } from "@/src/room/ui/RoomLightControls";
import { RoomLoadingOverlay } from "@/src/room/ui/RoomLoadingOverlay";
import { VisitHud } from "@/src/room/ui/VisitHud";
import { useScreenInsets } from '@/src/hooks/use-safe-insets';

export default function VisitScreen() {
  const s = useFixedStyles(makeStyles);
  const repos = useRepos();
  const me = useCurrentUserId();
  const { ownerId } = useLocalSearchParams<{ ownerId?: string }>();
  // Immersive mode reports 0 insets, so these floors sit UNDER the design's own offsets — the same treatment VisitHud gives its own header.
  const safe = useScreenInsets();
  // The visitor's own dressing: the backdrop follows the hour they chose, same as in their room.
  const hour = useGameStore((g) => g.roomTimeOfDay);
  const roomBackdrop = sunPreset(hour).backdrop;
  // A visitor gets the SAME light controls they have at home, and that is safe precisely because neither half of them is the host's: the hour is the visitor's own store setting and the switch is local state, so relighting a friend's room changes nothing the friend owns and needs no write permission. What you are adjusting is your VIEW of their furniture.
  const setRoomTimeOfDay = useGameStore((g) => g.setRoomTimeOfDay);
  const [lightOverride, setLightOverride] = useState<CeilingLightOverride>(null);
  const ceilingLight = ceilingLightOn(hour, lightOverride);
  const darkTheme = useGameStore((g) => g.theme) === "dark";
  const startViewing = usePlacementStore((p) => p.startViewing);
  const stopViewing = usePlacementStore((p) => p.stopViewing);

  const [host, setHost] = useState<Profile | null>(null);
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(0);
  const [empty, setEmpty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // The two halves of the wait this screen covers: their room's rows, then their furniture's models. Nobody arrives at a friend's house to watch it being furnished, so the overlay stays up for both.
  const [sceneReady, setSceneReady] = useState(false);
  const [revealed, setRevealed] = useState(false);

  // Camera state is PER SCREEN: returning from a visit must not leave the hub's camera wherever this one was left. Mirrors applyRoomControls in RoomExperience, clamp included, so both paths share one zoom range.
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
        // A null profile means no such player: rooms.get and likes.hasLiked don't throw for an owner row that doesn't exist, so a well-formed but unknown ownerId would otherwise fall through and render as a real, merely-empty room titled "Builder's room". This is NOT the same as a real profile whose layout has no placements — that case is the `empty` state below and stays a normal room, not an error.
        if (profile === null) {
          setLoadError(true);
          return;
        }
        // The same stale-row filter hydrate() applies to the player's own room. Skipping it would show this room artifacts the OWNER never sees, and a visit is read-only, so nobody could fix them.
        const layout = sanitizeLayout(saved.placements.map(toGrid));
        // Shape-validated only, same as hydrate() — the ids are checked against the catalogue at render time in RoomScene.
        const finishes = readRoomFinishes(saved);
        startViewing(ownerId, layout, finishes);
        setHost(profile);
        setLiked(hasLiked);
        setLikes(profile?.likes ?? 0);
        setEmpty(layout.length === 0);
      } catch (err) {
        // The repos THROW on any Postgrest error; without this the screen spins forever on a dropped connection.
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

  // Leaving hands the scene back to the player's own layout. The synchronicity of stopViewing() is real but it is not what makes this safe — this cleanup runs in React's passive-effect phase, AFTER the commit where RoomExperience already recomputed heavySceneActive and re-mounted its RoomScene. What actually protects the hub is that RoomScene gates on `viewing` itself (see the stillViewingFriend selector in RoomExperience.tsx); this effect is what releases that gate, one commit later.
  useEffect(
    () => () => {
      stopViewing();
    },
    [stopViewing],
  );

  const toggleLike = async () => {
    if (!ownerId) return;
    // Optimistic, rolled back on a throw — the same shape as removeFriend in profile.tsx.
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

  // The host's name, once known — the ring's initial and the line under it, so the wait says whose door you are standing at rather than just "loading".
  const hostName = host?.username ?? "Builder";

  return (
    <View style={s.screen}>
      {/* The backdrop sits UNDER a transparent Filament view, so the artwork frames the diorama without touching the 3D scene. */}
      <SceneBackdrop {...roomBackdropView(roomBackdrop, darkTheme)} style={s.stage}>
        {/* Mounted only once the fetch has landed, and that is not merely tidiness: RoomScene reads `viewing ?? layout`, so a scene standing up before startViewing() would load the PLAYER'S OWN furniture into a friend's room and then swap it out piece by piece. */}
        {loading ? null : (
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

      {/* Sits under VisitHud's header row, the same way it sits under the settings button at home — 42 for the back button plus the 8 gap. */}
      <RoomLightControls
        hour={hour}
        onHourChange={setRoomTimeOfDay}
        lightOn={ceilingLight}
        onToggleLight={() => setLightOverride({ hour, on: !ceilingLight })}
        style={[
          s.lightControls,
          {
            top: 12 + safe.top + 50,
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

      {/* Last child, and opaque: the room and its HUD both assemble underneath. Its own error state is unused here — a room that cannot be fetched at all takes the loadError branch above, and a single piece that will not load is not worth refusing the visit over. */}
      {revealed ? null : (
        <RoomLoadingOverlay
          dataReady={!loading}
          sceneReady={sceneReady}
          avatar={{ initial: hostName.charAt(0).toUpperCase() }}
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
    // Absolute like every other HUD corner; the inset maths lives at the call site with VisitHud's, so the two stay in one column.
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
    center: { alignItems: "center", justifyContent: "center", gap: SPACE.md },
    errorText: { ...TYPE.body, color: t.textFaint, textAlign: "center", padding: SPACE.lg },
  });
