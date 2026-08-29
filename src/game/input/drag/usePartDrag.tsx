// TODO: settle down the part marked as dev-setting: magnetic pull + auto return vs float +auto retuen btn

import * as Haptics from "expo-haptics";
import { useCallback, useMemo, useRef } from "react";
import { Gesture, GestureType } from "react-native-gesture-handler";
import { useSharedValue, withTiming } from "react-native-reanimated";

import {
  groupCandidates,
  holdOffsetFor,
  seatOffsetFor,
  stagingShiftFor,
  targetPositionForAction,
} from "@/src/game/core/scene/targets";
import type { GroupCandidate } from "@/src/game/core/scene/targets";
import { deriveJointFrames, partAnchorOffsets } from "@/src/game/core/model/jointFrames";
import { actionCluster, actionsForClusterFocus, clusterStarted } from "@/src/game/core/evaluation/clusters";
import { clusterDriveKind } from "@/src/game/core/evaluation/clusterCombine";
import {
  adaptedTravelDir,
  parkOffsetFor,
  placeEngagement,
} from "@/src/game/core/evaluation/engagement";
import type { ParkInfo } from "@/src/game/core/evaluation/engagement";
import type { ISharedValue } from "react-native-worklets-core";
import type { OffsetSink } from "../../scene/combineDriver";
import type { CarryOffset } from "../../scene/CombineCarry";
import { computeFit, APPROACH_FACTOR } from "@/src/game/core/geometry/fit";
import { isPickupType } from "@/src/game/core/ids";
import { stagedMembers } from "@/src/game/core/model/staging";
import { quatConjugate, quatMultiply, quatRotateVec3, quatSlerp, screenRay } from "@/src/game/core/geometry/math";
import { AIM_BAND_MAX_PX, aimBandScale, clusterCarryAnchor, clusterCarryOffset, holdReachFrom, burialDepthM, ghostSamplePoints, pointToSegmentPx, sightlineGapM, VIS_GAP_SLACK_M, rayPointNearest, segmentInFrame } from "./dragPlane";
import { ActionId, AssemblyAction, PartId, Vec3 } from "@/src/game/core/type";
import { selectFirstDrop, useGameStore } from "@/src/game/core/store";
import type { GetLookAt } from "../../scene/projectToScreen";
import { occluderBoxes, readLiveBoxes } from "../../scene/partBoxes";
import { hasPickProber, probePick } from "../../scene/pickProbe";
import { describePick, judgePick, PickConfirmCache } from "./pickConfirm";
import {
  APPROACH_RADIUS_M,
  CARRY_CAP_EASE,
  CARRY_CAP_EPS_M,
  CARRY_SURFACE_MARGIN_M,
  DEPTH_BLEND_EASE,
  DEPTH_BLEND_ENABLED,
  DEPTH_BLEND_EPS,
  FINGER_LIFT_DP,
  HOLD_OFFSCREEN_MARGIN_PX,
  OCCLUDER_REFRESH_MS,
  PICKUP_MS,
  POS_PULL_FULL_M,
  POS_PULL_START_M,
  SNAP_DIST_MAX,
  SNAP_DIST_MIN,
  SWITCH_MARGIN_PX,
} from "./dragConfig";
import { ClusterTargetRing, PickupRing } from "./dragRings";
import {
  hasRidingBodies,
  parkShiftFor,
  type ClusterSession,
  type DragSession,
  type Float3,
} from "./dragSession";
import { useDragCamera } from "./useDragCamera";
import { CAMERA_NEAR_M, FOV_Y_DEG } from "../../scene/cameraConfig";
import {
  animateClusterDriver,
  animateDriver,
  ClusterDriver,
  OffsetDriver,
} from "../../scene/offsetDriver";

// Timestamp gate for the DEV drag probe below — module scope so it survives gesture rebuilds.
let lastDragLog = 0;
// One-shot gate for the DEV rotation probe: log once per matched-target change, not per frame.
let lastRotLogId: ActionId | null = null;

interface Params {
  /** The PANNED look-at (useOrbitCamera's getLookAt), not the manipulator's own — every screen↔world conversion in here depends on it being the camera that actually drew the frame. */
  getLookAt: GetLookAt;
  heldDriver: OffsetDriver;
  /** Drives a component's non-lead bodies while the lead is held/dragged, so they track the same live offset ("riding" mode). */
  slideDriver: ClusterDriver;
  /** The combine carry offset, applied to the dragged cluster's entities on the RENDER thread (scene/CombineCarry) — carrying ~60 entities per frame from the JS thread froze the app. */
  carryShared: ISharedValue<CarryOffset>;
  getFocusPoint: () => Vec3;
  /** Camera strafe callbacks — the canvas gesture falls back to these when the one-finger drag isn't re-grabbing a floating part. */
  onPanStart?: (x: number, y: number) => void;
  onPanMove?: (x: number, y: number) => void;
  onPanEnd?: () => void;
}

/** Tray-item drag: long-press a tray card (progress ring) to take the part in hand — it materializes at the spawn point on the work plane — then keep the finger down to pan it; release snaps or returns it to the tray. */
export function usePartDrag({
  getLookAt,
  heldDriver,
  slideDriver,
  carryShared,
  getFocusPoint,
  onPanStart,
  onPanMove,
  onPanEnd,
}: Params) {
  const session = useRef<DragSession | null>(null);
  // Combine-drag state lives in a ref, NOT gesture-closure locals: setCombiningCluster in onStart re-renders ClusterTray, which rebuilds the cluster gesture object, and gesture-handler carries the active touch onto the NEW object without re-firing its onStart — so closure-local ref/planeY/lastO would reset to null and onUpdate would stop tracking. A ref survives the swap, exactly as `session` does for part drags.
  const clusterSession = useRef<ClusterSession | null>(null);

  const ringX = useSharedValue(0);
  const ringY = useSharedValue(0);
  const ringProgress = useSharedValue(0);
  // Screen position of the combine drag's target marker (the seat / park pose), driven from the cluster gesture.
  const clusterRingX = useSharedValue(0);
  const clusterRingY = useSharedValue(0);
  const {
    winW,
    winH,
    fingerOnCameraPlaneAt,
    fingerOnRay,
    carryCapAt,
    assemblyRadius,
    fingerOnPlane,
    fingerOnCameraPlane,
    worldToScreen,
  } = useDragCamera(getLookAt, getFocusPoint);

  // Read at HOOK level, not inside the gesture callback. The callback that sets the drag plane runs
  // from gesture-handler's event path, and reaching into the store from there was throwing on a
  // snapshot that had not resolved — a subscription here is resolved before any gesture can fire.
  const dragPlaneSetting = useGameStore((s) => s.settings.dragPlane);
  const partBoxes = useGameStore((s) => s.partBoxes);
  const furnitureForAnchors = useGameStore((s) => s.furniture);
  // Derived once per (furniture, boxes) rather than per drag frame: anchors are baked-pose geometry and cannot change while a furniture is loaded. Empty until the scene's harvest lands, and every consumer falls back to the visual-center clamp until it does. Frames ride along for the pickup-time facing derivation, which additionally depends on what is PLACED and so cannot be memoized here.
  const jointGeom = useMemo(() => {
    if (!furnitureForAnchors || !Object.keys(partBoxes).length)
      return { anchors: {} as Record<PartId, Vec3>, frames: null, liaisons: null };
    const liaisons = furnitureForAnchors.liaisons ?? {};
    const frames = deriveJointFrames(furnitureForAnchors.parts, liaisons, partBoxes);
    return { anchors: partAnchorOffsets(furnitureForAnchors.parts, liaisons, frames), frames, liaisons };
  }, [furnitureForAnchors, partBoxes]);
  const jointAnchors = jointGeom.anchors;

  /** A part is "floating": float releaseBehavior is ON (the canvas re-grab has no separate toggle — it comes with float mode), the part is held with no live drag session, and it isn't in a post-release park/snap phase that owns the driver (this also keeps re-grab out of auto-return's recover animation window). */
  const isFloating = useCallback(() => {
    const store = useGameStore.getState();
    return (
      store.settings.releaseBehavior === "float" &&
      !!store.heldActionId &&
      !session.current &&
      !store.orientationActionId &&
      store.fitState !== "nearCorrect" &&
      store.fitState !== "nearRotation"
    );
  }, []);

  const buildGesture = useCallback(
    (action: AssemblyAction, canvas = false) => {
      // Canvas variant: same drag session, no long-press and no pickup ring. Routing happens in plain-JS onStart (manualActivation's state manager only works in worklet callbacks, and our gating reads the JS store): floating part → re-grab it; otherwise fall back to the camera strafe callbacks (own toggle) or do nothing. canvasStarted: only a canvas gesture that actually began a DRAG may finalize one — a stray canvas touch during a live card drag must not steal its session.
      let canvasStarted = false;
      let canvasStrafing = false;
      let g = Gesture.Pan().runOnJS(true);
      g = canvas
        ? g.maxPointers(1).minDistance(10)
        : g.activateAfterLongPress(PICKUP_MS);
      g = g
        .onTouchesDown((e) => {
          if (canvas) return;
          const store = useGameStore.getState();
          if (store.heldActionId) {
            // Mid-drag or mid-orientation: ignore card touches entirely.
            if (session.current || store.orientationActionId) return;
            if (store.heldActionId !== action.actionId) {
              // A different part is floating (releaseBehavior "float"): put it back; a fresh long-press then picks this card's part.
              store.cancelHeld();
              return;
            }
            // This card's own part is floating — fall through so the pickup ring runs and onStart re-picks it (float-mode resume).
          }
          if (!store.available().some((a) => a.actionId === action.actionId)) {
            if (store.mode !== "free") return;
            // An untouched cluster's greyed cards don't run the pickup ring — beginPickup will refuse them anyway.
            const cluster = store.furniture ? actionCluster(store.furniture, action) : undefined;
            if (
              cluster &&
              store.furniture &&
              !clusterStarted(store.furniture, cluster, new Set(store.completed))
            ) {
              return;
            }
          }
          const t = e.allTouches[0];
          ringX.value = t.absoluteX;
          ringY.value = t.absoluteY;
          ringProgress.value = 0;
          ringProgress.value = withTiming(1, { duration: PICKUP_MS });
        })
        .onTouchesUp(() => {
          if (canvas) return;
          ringProgress.value = withTiming(0, { duration: 80 });
        })
        .onStart((e) => {
          if (canvas) {
            const st = useGameStore.getState();
            // Every start re-decides which of the two roles this touch has, so the previous touch's role is cleared first. onFinalize normally does it, but a gesture whose onFinalize was lost — the touch carried onto a rebuilt gesture object mid-press, the same swap that used to strand the orbit's grab flag — would otherwise leave this true and route every later re-grab into the strafe instead.
            canvasStrafing = false;
            if (!(isFloating() && st.heldActionId === action.actionId)) {
              // Not a re-grab → camera strafe fallback (always on).
              if (onPanStart) {
                canvasStrafing = true;
                onPanStart(e.x, e.y);
              }
              return;
            }
            canvasStarted = true;
          }
          if (!action.partId) return;
          const store = useGameStore.getState();
          const furniture = store.furniture;
          if (!furniture) return;
          const part = furniture.parts[action.partId];
          // Drag plane at the action's OWN target height (her model): on-screen overlap with a socket then means genuine 3D proximity — a finger on a 2D screen cannot steer depth.
          const doneSet0 = new Set(store.completed);
          const ownTarget = targetPositionForAction(action, furniture.parts, doneSet0);
          // The finger owns the part's HOLD POINT — the visual center for compact parts, clamped near the snap origin for lengthy ones (a DALFRED leg is steered by its foot, not mid-shaft; see holdOffsetFor).
          const grabOffset = holdOffsetFor(part, jointAnchors);
          // The plane pins the hold point (what the finger holds), so anchor it at the socket's hold-point height — a plane whose height disagrees with the pinned point left tall parts (DALFRED legs: +0.27m center offset) vertically unreachable in level mode.
          // The plane sits at the PARK height for a part that enters along an axis, so the pin can
          // actually hover over its hole instead of being held at the depth it ends up at.
          const ownPark = parkShiftFor(part);
          const planeY = ownTarget[1] + grabOffset[1] + ownPark[1];
          // VERTICAL-ENTRY PARTS ONLY.
          //
          // A camera-facing plane fixes depth at the socket's own — which is what a part that drops
          // in from above needs, because no horizontal plane can express downward travel. But it
          // also pins the part to THAT depth while the finger is somewhere else on screen, so for an
          // ordinary part the two visibly separate: the part sits at the socket's distance while the
          // finger is at its own. Making this the default traded one problem for a worse one.
          //
          // So it stays scoped to parts authored to enter along a mostly-vertical axis — DALFRED's
          // support pin and pole, EKET's panels — where the gesture is impossible otherwise.
          // Everything else keeps the horizontal plane, which tracks the finger.
          const uprightAnchor: Vec3 | null =
            dragPlaneSetting !== "level" &&
            part.placeDir &&
            Math.abs(part.placeDir[1]) > 0.7
              ? [
                  ownTarget[0] + grabOffset[0] + ownPark[0],
                  planeY,
                  ownTarget[2] + grabOffset[2] + ownPark[2],
                ]
              : null;
          // Where the part materializes. Both spawn paths now answer every finger position the
          // pickup can happen at, so this is a no-camera guard and nothing more.
          //
          // It used to carry the horizon: a card's ray never reaches a work plane at the socket's
          // height under a near-level camera, fingerOnPlane returned null, and the part spawned at
          // the SOCKET — yards from the finger, until the first connecting ray teleported it there.
          // (The fallback before that put it on a camera-facing plane through the focus point, which
          // spawned it close to the lens and jumped just as badly.) fingerOnPlane takes the horizon
          // limit itself now, so the part starts under the finger and stays there.
          const socketStart: Float3 = [ownTarget[0], planeY, ownTarget[2]];
          // EXPERIMENT (drag-no-plane): adaptive spawns on the ray just in front of the model instead of on the work plane; level keeps the plane as the comparison engine.
          const modelR = assemblyRadius(furniture);
          // What the carry has to clear so no end of this part crosses the lens. Measured from the HOLD point, which since joint anchors is the part's joint at one END of it: a LACK leg held at its top reaches its full 0.40 m downward, and at the 0.65 m zoom floor the other carry floors land near 0.29 m — which put that foot end behind the camera.
          const holdReach = holdReachFrom(useGameStore.getState().partBoxes[action.partId], [
            part.pose.position[0] + grabOffset[0],
            part.pose.position[1] + grabOffset[1],
            part.pose.position[2] + grabOffset[2],
          ]);
          // Seed the socket-referenced carry from this action's own target BEFORE the first carry point is computed — the spawn frame is exactly the one the "it is huge the moment I grab it" report is about, so a depth that only arrives once the matcher has run would miss it. projectToScreen's `depth` IS the axial depth dragRayPoint wants (its ray has dir·fwd = 1).
          const socketDepth0 = worldToScreen(ownTarget)?.depth ?? null;
          // The obstacle list is read HERE, before the spawn point, because the carry cap below needs it on frame zero — the spawn is the frame the "it appears way off my finger" reports are about, and a cap that only arrived with the first move would let the part materialise inside the cabinet and then step out of it. `doneSet0` is safe to read this early: beginPickup (called below) sets heldActionId and clears drag state, never `completed`, so the placed set cannot change between here and there.
          // Live geometry, read off the renderer — never the load-time harvest, which describes the FINISHED furniture and so gives a placed-but-stashed part a box across an assembly it is standing nowhere near (EKET: a phantom drawerFront over the visibly open cabinet face). The rule that used to paper over that phantom asked whether a part's CLUSTER was seeded or combined, which is authoring metadata standing in for render state: BEKVAM and LACK name their single cluster purely for the UI label and never set `seed`, so every part of those furnitures was disqualified as an obstacle and the gate ran inert for the whole build — measured, gap 0mm from all 72 sweep cameras, every hidden socket snappable. Live boxes answer the question directly and retire the proxy, the staged-carrier gap it admitted to, and the seed overload with it.
          const placedIds = [
            ...new Set<PartId>(
              furniture.actions
                .filter((a) => a.type === "placePart" && a.partId && doneSet0.has(a.actionId))
                .map((a) => a.partId!),
            ),
          ];
          // Kept as its own binding rather than inlined into the call: null (no scene reader registered) and {} (reader present, nothing on screen) drive the same empty obstacle list but mean opposite things, and only the probe below can tell them apart.
          const liveBoxes0 = readLiveBoxes(placedIds);
          const placedBoxList = occluderBoxes(placedIds, liveBoxes0, partBoxes);
          // Seeded raw, not eased: there is no previous frame to ease from, and the whole point of computing it here is that frame zero is already correct.
          const carryCap0 = carryCapAt(e.absoluteX, e.absoluteY, placedBoxList);
          const visualStart = uprightAnchor
            ? (fingerOnCameraPlaneAt(e.absoluteX, e.absoluteY, uprightAnchor) ?? socketStart)
            : dragPlaneSetting === "level"
              ? (fingerOnPlane(e.absoluteX, e.absoluteY, planeY) ?? socketStart)
              : (fingerOnRay(e.absoluteX, e.absoluteY, modelR, holdReach, socketDepth0, carryCap0) ?? socketStart);
          const base: Float3 = [
            visualStart[0] - grabOffset[0] - part.pose.position[0],
            visualStart[1] - grabOffset[1] - part.pose.position[1],
            visualStart[2] - grabOffset[2] - part.pose.position[2],
          ];
          heldDriver.set(base);
          // A component lead's siblings start riding from the same offset the instant it's picked up, so there's no pop between grab and the first drag frame.
          if (hasRidingBodies(furniture, action.partId)) slideDriver.set(base);
          store.beginPickup(action.actionId);
          if (useGameStore.getState().heldActionId !== action.actionId) return;
          // A WRONG part still picks up and drags — taking the part away was worse than the
          // mistake — but the toast arrives NOW, as the drag begins, not seconds later when the
          // fly-back lands. (The sound is the audio layer's call: useAssemblySfx plays the error
          // cue instead of the pickup cue for a blocked pickup, so the two never stack.)
          if (!store.available().some((a) => a.actionId === action.actionId)) {
            store.noteBlocked(action.actionId);
          }
          Haptics.selectionAsync();
          if (!canvas) ringProgress.value = withTiming(0, { duration: 120 });

          const nextStore = useGameStore.getState();
          const avail = actionsForClusterFocus(
            furniture,
            nextStore.available(),
            nextStore.activeCluster,
          );
          const doneSet = new Set(nextStore.completed);
          const allCandidates = groupCandidates(
            avail,
            action,
            furniture.parts,
            doneSet,
            jointAnchors,
          );
          const rawCandidates = selectFirstDrop(nextStore)
            ? allCandidates.filter((c) => c.action.actionId === action.actionId)
            : allCandidates;
          // Match against the PARK pose, not the seated one, for any part that parks before it is
          // driven home. A candidate's position is where the part ends up AFTER the drive — for
          // DALFRED's support pin that is down inside circleUpp's hole, so the fit only went green
          // once the pin was already through the socket, when the whole point is that it enters from
          // above. Backing the match point off along the authored placeDir puts the green where the
          // part is genuinely ready to be released: hovering, lined up, about to drop in.
          const candidates = rawCandidates.map((c) => {
            const cPart = furniture.parts[c.action.partId!];
            // ORDER-ADAPTED travel, not the raw authored placeDir: the aim anchor and the match/park segment must back off along the direction the part will actually travel in THIS build state, or a legally reversed order (EKET backPanel after a bottom-first close) aims the whole acquisition at the closed side and the snap never arms while the release path parks correctly.
            const dir = cPart ? adaptedTravelDir(furniture, cPart, doneSet) : null;
            const back = cPart?.parkBackoff ?? 0;
            // seatVisual is the candidate's FLUSH pose — the hole the player can actually see. For inserts, position/holdPosition are already the loose pose proud of the hole, so without this the whole match segment floats out along the screw axis and zoomed in it projects off-screen while the hole sits centered (measured: aim stuck at 0.167 with the finger dead on the hole).
            // Which point of the flush pose is the hole is targets.seatOffsetFor's call: a structural part's joint anchor, a fastener's shaft MOUTH — not its visual centre, which for a screw is mid-shaft and buried (the drawer-back screws were unassemblable from any angle because of it).
            const off = seatOffsetFor(cPart, cPart ? partBoxes[cPart.partId] : undefined, jointAnchors, doneSet, placedBoxList, dir);
            // The seat rides the SAME staging displacement as the delivery target (targets.stagingShiftFor, exemptions included) — built from the raw baked pose alone, the gate judged visibility of a spot 5cm from a staged group's real socket (EKET stabiliser rod).
            const sShift = stagingShiftFor(c.action, furniture.parts) ?? [0, 0, 0];
            const seatVisual: Vec3 = cPart
              ? [
                  cPart.pose.position[0] + off[0] + sShift[0],
                  cPart.pose.position[1] + off[1] + sShift[1],
                  cPart.pose.position[2] + off[2] + sShift[2],
                ]
              : c.holdPosition;
            // The park the release will actually deliver this candidate to (engagement.parkOffsetFor — authored where the part authors one, derived from the engagement where it does not), so the ghost below stands where the ghost renderer draws it.
            const engShift = parkOffsetFor(furniture, c.action, doneSet) ?? [0, 0, 0];
            const delivered: Vec3 = [sShift[0] + engShift[0], sShift[1] + engShift[1], sShift[2] + engShift[2]];
            /**
             * clearPoints — the visibility gate's SECOND CHANCE: points whose own clear sightline passes this candidate when its seat is box-blocked.
             *
             * A STRUCTURAL part offers its whole ghost body, the copy of the part standing at the delivered pose. The rule that buys is "if you can see where the part goes, you can put it there", and it is the rule the player is already playing by — they are aiming a 40cm leg at a spot under a tabletop, not aiming at a 6mm-wide contact patch. Judging the seat alone made a LACK leg's socket exist only for an eye BELOW the tabletop's underside plane (measured: elevation ≤5° at a 1.2m orbit; one step higher the gap is 27mm against a 6mm threshold), which is the camera pinned under the table for all four legs.
             *
             * A FASTENER offers its park point and nothing more — the engagement's where it derives one, its AUTHORED back-off otherwise, which is what it has always offered. Its body is a screw: a sliver of it peeking past a silhouette says nothing about whether the player can see the hole, and that is not hypothetical — box/halo sampling shipped once and armed a wood screw's socket at 9% visible. The park point is different in kind: one point, in open air on the approach side, where the part visibly waits before its drive.
             *
             * The ghost body takes the ENGAGEMENT's park only, never the authored fallback, because it has to stand where scene/PartModel draws the ghost — and a `dropOn` part authoring a back-off still has its ghost sitting at the seat (pressParkInfo returns null for exactly that reason).
             */
            const fastenerPark: Vec3 | null =
              engShift[0] || engShift[1] || engShift[2]
                ? engShift
                : dir && back
                  ? [-dir[0] * back, -dir[1] * back, -dir[2] * back]
                  : null;
            const clearPoints: Vec3[] =
              cPart && cPart.type !== "fastener"
                ? ghostSamplePoints(partBoxes[cPart.partId], delivered)
                : fastenerPark
                  ? [[seatVisual[0] + fastenerPark[0], seatVisual[1] + fastenerPark[1], seatVisual[2] + fastenerPark[2]]]
                  : [];
            // matchVisual only — position and holdPosition stay AS AUTHORED. The release path
            // applies the park offset itself, so shifting the real position here parked the part
            // twice: the pin jumped a further 12cm up on release and had to be slid all the way back
            // down. Matching and placing are two different questions about the same socket.
            if (!dir || !back) return { ...c, matchVisual: c.holdPosition, seatVisual, clearPoints };
            const shift: Vec3 = [-dir[0] * back, -dir[1] * back, -dir[2] * back];
            return {
              ...c,
              matchVisual: [
                c.holdPosition[0] + shift[0],
                c.holdPosition[1] + shift[1],
                c.holdPosition[2] + shift[2],
              ] as Vec3,
              seatVisual,
              clearPoints,
            };
          });
          const candidatesWithFacing = candidates.map((c) => {
            // ONE visibility rule (sightline gap; see dragPlane.sightlineGapM): precompute this anchor's burial depth — its own threshold calibration. No exemptions, no fastener/structural split, no samples: box/halo sampling answered "is the NEIGHBOURHOOD visible" and a halo corner peeking past the plate's silhouette armed a socket the player could not see (user screenshot, wood screw at 9%).
            const burial = burialDepthM(c.seatVisual, placedBoxList);
            return {
              ...c,
              burial,
            };
          });
          // DEV pickup probe: one line per pickup with the first candidate's WORLD anchors, to catch an anchor landing in the wrong space (a seat that projects fine can still sit centimetres from the LENS — band collapse, unmatched drags).
          //
          // The four counts after it characterise the OCCLUDER PIPELINE end to end, because every stage of it can fail silently to PERMISSIVE — an empty obstacle list is indistinguishable from a clear line of sight at the point the verdict is taken, so the gate simply passes everything and says nothing. Read them together: `boxes` 0 means the harvest tripped its own 2mm gate and published none (AssemblyScene); `live=none` means no scene reader is registered at all, so occluders fell back to those baked boxes; `live=0` with a non-zero `placed` means the reader IS registered and reported nothing on screen, which is a different fault with the same symptom. `occN` is what the gate actually received. `pk` is whether layer 2 exists on this build — it needs the native patch, so it can differ between two platforms built from one tree, which is exactly the kind of divergence this line exists to catch.
          if (__DEV__) {
            const c0 = candidates[0];
            const j = c0 ? jointAnchors[c0.action.partId!] : undefined;
            const cand = c0
              ? `${c0.action.actionId} pos=${c0.position.map((v) => v.toFixed(3)).join(",")} hold=${c0.holdPosition.map((v) => v.toFixed(3)).join(",")} seat=${c0.seatVisual.map((v) => v.toFixed(3)).join(",")} match=${c0.matchVisual.map((v) => v.toFixed(3)).join(",")} anchor=${j ? j.map((v) => v.toFixed(3)).join(",") : "none"}`
              : `${action.actionId} NO-CANDIDATES`;
            console.log(
              `[pickup] ${cand} placed=${placedIds.length} live=${liveBoxes0 ? Object.keys(liveBoxes0).length : "none"} boxes=${Object.keys(partBoxes).length} occN=${placedBoxList.length} pk=${hasPickProber() ? "on" : "off"} BUILD=noplane19`,
            );
          }
          const groupIds = new Set(candidates.map((c) => c.action.actionId));
          const otherSockets = avail
            .filter(
              (a) => a.partId && isPickupType(a.type) && !groupIds.has(a.actionId),
            )
            .map((a) => targetPositionForAction(a, furniture.parts, doneSet));
          // Parts a renderer pick may find at the socket's pixel WITHOUT that meaning occlusion: the part in hand (it is what's about to fill the socket, and while aiming it hovers exactly over that pixel) and everything riding with it — a component lead's sibling bodies, a staged carrier's fitted hardware. Mirrors useSceneState's riding derivation.
          const heldSet = new Set<string>();
          if (action.partId) {
            heldSet.add(action.partId);
            const comp = furniture.components?.byBody[action.partId];
            if (comp && furniture.components!.lead[comp] === action.partId)
              for (const b of furniture.components!.bodies[comp] ?? []) heldSet.add(b);
            for (const m of stagedMembers(furniture, action.partId, doneSet)) heldSet.add(m);
          }
          session.current = {
            base,
            candidates: candidatesWithFacing,
            otherSockets,
            bakedPos: part.pose.position,
            bakedRot: part.pose.rotation,
            grabOffset,
            planeY,
            basePlaneY: planeY,
            uprightAnchor,
            matchedActionId: null,
            hoverLift: 0,
            depthBlend: 0,
            depthTarget: null,
            startX: e.absoluteX,
            startY: e.absoluteY,
            blockedStamp: 0,
            modelR,
            holdReach,
            placedIds,
            placedBoxes: placedBoxList,
            boxesStamp: Date.now(),
            pickCache: new PickConfirmCache(),
            heldSet,
            socketDepth: socketDepth0,
            carryCap: carryCap0,
          };
        })
        .onUpdate((e) => {
          if (canvas && canvasStrafing) {
            onPanMove?.(e.x, e.y);
            return;
          }
          const s = session.current;
          const store = useGameStore.getState();
          const furniture = store.furniture;
          if (!s || !furniture || store.heldActionId !== action.actionId)
            return;
          // Exact per-frame projection onto the (dynamic) horizontal drag plane — absolute mapping, so the part cannot drift from the finger. The camera-plane delta math is no longer the horizon's fallback (fingerOnPlane takes that limit itself); what is left for it is the upright path's own miss, an anchor gone behind the lens.
          // EXPERIMENT (drag-no-plane): adaptive rides the ray at cap depth every frame — no plane, no grazing pathologies; the socket blend below still owns delivery depth. Level keeps the plane.
          // Occlusion cap on the carry depth, updated BEFORE the carry point that consumes it. Read against last tick's occluder list (refreshed on its own throttle further down) — the boxes move only on the rare mid-drag events that throttle covers, and the ray they are tested against is this frame's.
          // Whether the cap is BITING: a placed part stands nearer to the eye than the depth the held part is heading for, so the part is drawn in front of that part instead of at its socket. Hoisted out of the block because the "turn the camera" chip is decided after the matcher, below.
          let carryCapBiting = false;
          {
            const rawCap = carryCapAt(e.absoluteX, e.absoluteY, s.placedBoxes);
            // Read the RAW cap, before the matched-socket override below: once a socket is locked on that override deliberately carries THROUGH the box that reported nearer, and calling that blocked would coach a camera turn at the moment the aim finally worked.
            carryCapBiting =
              Number.isFinite(rawCap) && s.socketDepth != null && rawCap < s.socketDepth;
            // A socket the player is LOCKED ONTO overrules the cap. Boxes are fatter than the meshes inside them, so the box of the very panel a socket sits on can report a surface a centimetre or two nearer than the socket itself — and letting that win would break the one property the socket-referenced carry exists for, that part and socket share a depth and therefore a scale. Safe to overrule because a matched socket has already passed the visibility gate: its own sightline is clear, and the finger is inside the approach band, so the ray to the finger is the ray to the socket give or take a few degrees.
            const want =
              s.matchedActionId != null && s.socketDepth != null
                ? Math.max(rawCap, s.socketDepth)
                : rawCap;
            if (Number.isFinite(want)) {
              // Ease in from wherever the cap currently sits; a cap arriving from Infinity has nothing to ease from and takes the value outright (the finger just crossed onto a surface from open space, and one frame of the part inside the panel is worse than one frame of it stepping).
              s.carryCap = Number.isFinite(s.carryCap)
                ? s.carryCap + (want - s.carryCap) * CARRY_CAP_EASE
                : want;
            } else if (Number.isFinite(s.carryCap) && s.socketDepth != null && s.carryCap < s.socketDepth) {
              // Release: the finger left the surface, so the cap eases back OUT toward the depth the carry actually wants rather than snapping there, then retires. Retiring matters — a cap parked asymptotically just below the wanted depth would hold the part a permanent fraction too near for the rest of the drag.
              const next = s.carryCap + (s.socketDepth - s.carryCap) * CARRY_CAP_EASE;
              s.carryCap = s.socketDepth - next < CARRY_CAP_EPS_M ? Infinity : next;
            } else {
              // Nothing to ease toward: no socket depth means the model-derived carry is in charge, and it has no target for the cap to converge on.
              s.carryCap = Infinity;
            }
          }
          let p = s.uprightAnchor
            ? (fingerOnCameraPlaneAt(e.absoluteX, e.absoluteY, s.uprightAnchor) ??
              fingerOnCameraPlane(e.absoluteX, e.absoluteY, s))
            : store.settings.dragPlane === "level"
              ? (fingerOnPlane(e.absoluteX, e.absoluteY, s.planeY) ??
                fingerOnCameraPlane(e.absoluteX, e.absoluteY, s))
              : (fingerOnRay(e.absoluteX, e.absoluteY, s.modelR, s.holdReach, s.socketDepth, s.carryCap) ??
                fingerOnCameraPlane(e.absoluteX, e.absoluteY, s));
          let nearest = s.candidates[0];
          let bestD = Infinity;
          // seatVisual is on every session candidate (DragSession.candidates) and target is only ever assigned from that list, so the narrower shape here was under-declaring what it holds — the socket-depth reference below needs the seat.
          let target: (GroupCandidate & { matchVisual: Vec3; seatVisual: Vec3 }) | null = null;
          // Socket-depth policy staging: the matched socket's nearest point on the finger's ray, plus the aim distance the blend weight rides on (set in the adaptive branch below, applied once snapDist is known).
          let depthAim: { d: number } | null = null;
          // The finger's ray this frame, kept so the depth blend can recompute its socket point on the CURRENT ray even on frames where nothing is matched and the blend is easing back out.
          let frameRay: { eye: Vec3; dir: Vec3 } | null = null;
          // Pixel cap on the whole aim-band family (see aimBandScale): 1 at bench range, shrinking zoomed-in so match/magnet/snap never span a third of the screen. Level mode keeps 1 — its bands are true 3D distances, part of the demo contract.
          let band = 1;
          // The slerp-rotated grab anchor of this frame, for the probe: with hold-point pinning the visual center rides at grabOffset only while unrotated.
          let probeAnchor: Vec3 | null = null;
          // Whether the aim is parked on a facing-blocked socket with nothing matchable — drives the "Try turning the camera" chip.
          let aimBlockedNow = false;
          // WHICH of the chip's triggers fired — probe-only. `blk=1` alone could not tell a hidden socket from a part merely passing over the furniture, which is the whole of the report this exists to answer next time.
          let blockedWhy = "-";
          // Which placed part's box blocked the nearest skipped candidate — probe-only, names the occluder in one log line.
          let blockedBy: PartId | null = null;
          // Visible/total sample count of the winning candidate — probe-only, so an "arms while hidden" report carries its own numbers.
          let nearestVis = "-";
          // Per-profile acceptance radius; also the magnet's full-strength point so "looks seated" and "is accepted" stay the same distance. Read before the matcher because the crowding cap below is expressed against it.
          const snapDist = Math.min(
            SNAP_DIST_MAX,
            Math.max(SNAP_DIST_MIN, store.settings.snapDistance),
          );
          // Aim distance to the matched socket's PARK POINT — what the visible magnet ramps ride on. Defaults to bestD (level mode measures true 3D distance and keeps it).
          let pullD = Infinity;
          if (store.settings.dragPlane === "level") {
            // "level" — the on-release engine's mechanism, kept for comparison/demo: plane FIXED at the session target's height, candidates matched by TRUE 3D distance, no hysteresis. Depth can hide a socket here — the multi-height blind spot (wool stool two-height legs, DALFRED screw105251) is intentional to demonstrate.
            s.planeY = s.basePlaneY;
            const offB = heldDriver.value;
            const dragX = p?.[0] ?? s.bakedPos[0] + offB[0] + s.grabOffset[0];
            const dragY = p?.[1] ?? s.bakedPos[1] + offB[1] + s.grabOffset[1];
            const dragZ = p?.[2] ?? s.bakedPos[2] + offB[2] + s.grabOffset[2];
            for (const c of s.candidates) {
              const d = Math.hypot(
                dragX - c.matchVisual[0],
                dragY - c.matchVisual[1],
                dragZ - c.matchVisual[2],
              );
              if (d < bestD) {
                bestD = d;
                nearest = c;
              }
            }
            if (nearest && bestD <= APPROACH_RADIUS_M) target = nearest;
            s.matchedActionId = target?.action.actionId ?? null;
          } else {
            // "adaptive" — candidate matching in SCREEN space: the finger's aim is 2D, so depth must never hide a socket. Distances are converted back to world meters at the candidate's depth so the approach/snap radii keep their meaning.
            const fingerPx = { x: e.absoluteX, y: e.absoluteY - FINGER_LIFT_DP };
            // Aim is measured to the SEGMENT hole→park, not the park point alone: zoomed in, the park hover pose can project off-screen while the hole is visibly centered — the player aims at what they can see, so any point on the approach line counts (pointToSegmentPx's rationale).
            const distPx = (c: GroupCandidate & { matchVisual: Vec3; seatVisual?: Vec3 }) => {
              const spA = worldToScreen(c.seatVisual ?? c.holdPosition);
              const spB = worldToScreen(c.matchVisual);
              const one = spA ?? spB;
              if (!one) return { px: Infinity, mPerPx: 1, inFrame: false, nearFrame: false };
              const a = spA ?? one;
              const b = spB ?? one;
              const inFrame = segmentInFrame(a.x, a.y, b.x, b.y, winW, winH, 0);
              const nearFrame = inFrame || segmentInFrame(a.x, a.y, b.x, b.y, winW, winH, HOLD_OFFSCREEN_MARGIN_PX);
              if (!spA || !spB) {
                return {
                  px: Math.hypot(fingerPx.x - one.x, fingerPx.y - one.y),
                  mPerPx: (2 * one.depth * Math.tan((FOV_Y_DEG * Math.PI) / 360)) / winH,
                  inFrame,
                  nearFrame,
                };
              }
              const seg = pointToSegmentPx(fingerPx.x, fingerPx.y, spA.x, spA.y, spB.x, spB.y);
              const depth = spA.depth + (spB.depth - spA.depth) * seg.u;
              return {
                px: seg.px,
                mPerPx: (2 * depth * Math.tan((FOV_Y_DEG * Math.PI) / 360)) / winH,
                inFrame,
                nearFrame,
              };
            };
            let nearestPx = Infinity;
            let nearestMPerPx = 1;
            // Occlusion gate (layer 1 of socket visibility): a socket whose line of sight from the camera passes through a placed part is hidden — DALFRED's back-leg spots behind the plate from a front view — and is skipped for acquisition exactly like an off-frame one. The nearest skipped-px is remembered so the chip can say WHY nothing matches ("Try turning the camera") instead of hunting silently — the off-frame gate shipped silent and read as a bug. The exemption-based variant that used to live here (receivers and anchor-containing boxes excluded by hand, segmentHitsBox per candidate) was superseded by the sightline-gap rule below and is gone: exemptions made a part transparent to its OWN sockets, so legs snapped through plates from above.
            const laF = getLookAt();
            const now = Date.now();
            // Occluder refresh, throttled: the boxes are world-space so camera motion alone never stales them (the eye above is per-frame), but parts can MOVE mid-drag — a second finger toggling cluster focus hides/shows parts, and the previous part's commit animation can still be easing home when this pickup happened. Burials re-derive with the boxes: each is a measurement against the same list.
            if (now - s.boxesStamp > OCCLUDER_REFRESH_MS) {
              s.boxesStamp = now;
              s.placedBoxes = occluderBoxes(s.placedIds, readLiveBoxes(s.placedIds), partBoxes);
              for (const c of s.candidates) c.burial = burialDepthM(c.seatVisual, s.placedBoxes);
            }
            let blockedPx = Infinity;
            // The nearest box-blocked candidate this frame — the one socket the player might actually be aiming at through box fat, and so the only one worth a renderer pick.
            let probeCand: { id: ActionId; sx: number; sy: number; axial: number; euclid: number } | null = null;
            for (const c of s.candidates) {
              const d = distPx(c);
              // A socket the player cannot SEE cannot be aimed at — off-frame candidates are skipped for acquisition (a snap must never be earned against an invisible hole; measured: a seat at y=-88 was still inside the capture band near the top edge). The CURRENT match is not acquired here either — it is held through the more generous nearFrame test below, so a mid-drag orbit that nudges the socket just past the edge does not pop the magnet.
              if (!d.inFrame) continue;
              // Visibility gate, one rule for every part type: the first surface the sightline meets must be within (the anchor's own burial + slack) of the anchor. Looking AT the socket passes; looking at anything in front of it — another part, or the SAME part's far side — fails. Replaces box/halo sampling (neighbourhood visibility) and the exemption-based line-of-sight test (transparent receivers), both of which armed hidden sockets in play tests.
              let visStat: string | null = null;
              if (laF) {
                const g = sightlineGapM(laF[0], c.seatVisual, s.placedBoxes);
                visStat = `${(g.gap * 1000).toFixed(0)}/${((c.burial + VIS_GAP_SLACK_M) * 1000).toFixed(0)}mm`;
                // Second chance (clearPoints): a structural part's whole GHOST BODY at the delivered pose, a fastener's park point. Either passes a seat that is merely grazed — the side view of DALFRED's pin hole, where the plate's rim stands 60mm before the centre of its own top face; a LACK leg hanging in plain sight under the tabletop it bolts into. No burial slack on these: they are points on the PART, not mouths inside a receiver, so a sample that reports itself buried is a sample standing inside something and is exactly what should not count.
                const seenClear = c.clearPoints.some((p) => sightlineGapM(laF[0], p, s.placedBoxes).gap <= VIS_GAP_SLACK_M);
                if (seenClear && g.gap > c.burial + VIS_GAP_SLACK_M) visStat += "+ghost";
                if (g.gap > c.burial + VIS_GAP_SLACK_M && !seenClear) {
                  // Renderer second opinion (layer 2, pickConfirm.ts): the box can only over-block — AABB ⊇ mesh — so a box-blocked socket earns a pickEntityWithDepth check of what is REALLY frontmost at its pixel. A live confirmed-visible verdict lets the candidate through; anything less keeps the conservative box verdict. The sweep counts 48 sockets reachable only through this path (round plates' corner air, hollow runner channels).
                  const confirmed = s.pickCache.isConfirmedVisible(c.action.actionId, laF[0], now);
                  if (!confirmed) {
                    if (d.px < blockedPx) {
                      blockedPx = d.px;
                      blockedBy = (g.by as PartId | null) ?? c.action.partId ?? null;
                      const sp = worldToScreen(c.seatVisual);
                      if (sp)
                        probeCand = {
                          id: c.action.actionId,
                          sx: sp.x,
                          sy: sp.y,
                          axial: sp.depth,
                          euclid: Math.hypot(c.seatVisual[0] - laF[0][0], c.seatVisual[1] - laF[0][1], c.seatVisual[2] - laF[0][2]),
                        };
                    }
                    continue;
                  }
                  visStat += "+pk";
                }
              }
              if (d.px < nearestPx) {
                nearestPx = d.px;
                nearestMPerPx = d.mPerPx;
                nearest = c;
                nearestVis = visStat ?? "-";
              }
            }
            // Fire at most one pick per interval for the socket chosen above. The verdict is judged by the SAME rule as the box gate — first surface within (burial + slack) of the anchor — but measured on rendered geometry via the depth buffer; hits on the held part or a ghost teach nothing (the part in hand hovers over the very pixel it is aiming at) and leave the previous verdict standing. The eye is captured at fire time so the cache's staleness test compares like with like.
            if (probeCand && laF && s.pickCache.shouldFire(now)) {
              const firedEye: Vec3 = [laF[0][0], laF[0][1], laF[0][2]];
              const pending = probePick(probeCand.sx, probeCand.sy);
              if (pending) {
                s.pickCache.markFired(now);
                const pc = probeCand;
                pending
                  .then((hit) => {
                    const inp = { hit, heldSet: s.heldSet, anchorAxialDepthM: pc.axial, anchorEuclidDistM: pc.euclid, nearM: CAMERA_NEAR_M };
                    const v = judgePick(inp);
                    s.pickCache.record(pc.id, v, firedEye, Date.now());
                    if (__DEV__) s.pickCache.lastDiag = `${describePick(inp, v)} st=${s.pickCache.streakOf(pc.id)}`;
                  })
                  .catch(() => s.pickCache.record(pc.id, "ignore", firedEye, Date.now()));
              }
            }
            bestD = nearestPx * nearestMPerPx; // world-equivalent aim distance
            band = aimBandScale(nearestMPerPx, APPROACH_RADIUS_M);
            // Crowding cap, measured in WORLD metres. Its job: the acceptance radius must never span two sibling sockets, or a near-miss seats into the wrong hole ("I can only snap on the two at the back", measured on DALFRED at the zoom floor). The first cut measured the gap in PIXELS, which is azimuth-dependent: from the home framing two of DALFRED's four leg anchors project nearly on top of each other (depth-aligned pair, ~12 px apart while 15 cm apart in world), so the band was crushed to 0.13 at any zoom and nothing could match or seat at all — the "totally not work" regression. Pixel-coincident-but-depth-separated siblings are exactly what screen-space matching plus hysteresis already tolerate; the seating hazard the cap exists for lives in world space, so the gap is measured there.
            if (nearest && snapDist > 0) {
              let gapM = Infinity;
              for (const c of s.candidates) {
                if (c.action.actionId === nearest.action.actionId) continue;
                const g = Math.hypot(
                  c.matchVisual[0] - nearest.matchVisual[0],
                  c.matchVisual[1] - nearest.matchVisual[1],
                  c.matchVisual[2] - nearest.matchVisual[2],
                );
                if (g < gapM) gapM = g;
              }
              if (Number.isFinite(gapM)) {
                band = Math.min(band, gapM / (2 * snapDist));
              }
            }

            const current = s.candidates.find(
              (c) => c.action.actionId === s.matchedActionId,
            );
            // The hold test runs on the current match's OWN scale and band: when the only in-approach socket is the held one and every rival is off-frame, the loop above never set nearestMPerPx, and judging the hold by a defaulted scale would drop a perfectly on-screen match.
            // The current match keeps its own laxer facing threshold: acquisition needs the socket clearly presented, but a match already in hand survives a grazing angle so an orbit through edge-on does not strobe the magnet.
            const currentD = current ? distPx(current) : null;
            const currentPx = currentD?.nearFrame ? currentD.px : Infinity;
            const currentBand = currentD
              ? aimBandScale(currentD.mPerPx, APPROACH_RADIUS_M)
              : band;
            if (
              current &&
              currentD &&
              currentPx * currentD.mPerPx <= APPROACH_RADIUS_M * currentBand
            ) {
              target = nearestPx + SWITCH_MARGIN_PX < currentPx ? nearest : current;
            } else if (nearest && bestD <= APPROACH_RADIUS_M * band) {
              target = nearest;
            }
            s.matchedActionId = target?.action.actionId ?? null;
            // The chip's "turn the camera" case: nothing matched, and either the closest thing to the finger was a blocked socket within chip-worthy aim range, the carry cap is biting, or the part itself is behind a placed part. Debounced asymmetrically — ON immediately, OFF only after 300ms clear of every trigger — because the raw condition rides three sharp edges (the 160px rim, match acquisition, grazing sightlines) and read as flicker on device. A real match still silences it the same frame: fit language outranks coaching.
            // blockedPx alone stopped covering this. It is written only for candidates that survived `if (!d.inFrame) continue`, and scores them by distance to the FINGER, so a part carried in front of a panel with its socket behind that panel produced no blockedPx at all. It also narrowed: the sampling gate that used to feed it (VIS_FRACTION_MIN, ≥30% of seated samples in clear sight) was replaced in "Drag Fix 5" by the one-ray sightline rule plus pickConfirm's renderer second opinion, which is better at matching but calls far less blocked.
            // partBehind is the case the cap misses: it eases in over several frames rather than at once, the upright and level carries never consult it, the near-plane floors overrule it, and CARRY_CAP_ENABLED can retire it. Threshold is the cap's own clearance, not VIS_GAP_SLACK_M — the question is whether the part sits deeper than the gap the cap would have held it at. Measured on `p` because the visual centre needs probeAnchor, which is not resolved until the pose is written below; with nothing matched the two differ only by the grab offset.
            const partBehind =
              !!laF && !!p && sightlineGapM(laF[0], p, s.placedBoxes).gap > CARRY_SURFACE_MARGIN_M;
            // ...and the guard all three answer to: a camera turn is only ever the advice when there is NOTHING on this screen to snap to. nearestPx is written for a candidate only after it has passed both the in-frame test and the visibility gate, so a finite value IS "a socket you could take right now" — and the candidates are one interchangeable group, so any one of them finishes the pickup. Without this, the two carry-side triggers coached a turn for a part merely PASSING OVER the furniture on its way to a socket in plain sight: the cap bites over any placed box whatever the socket is doing, and partBehind rides the cap's own ease-in, so a drag across the assembly lit the chip the whole way (reported from device — "it tells me to turn the camera when I just need to move the part"). What is left for them is the case they were added for, where every socket is off-frame or hidden and blockedPx never gets written at all.
            const nothingAimable = !Number.isFinite(nearestPx);
            const rawBlocked =
              !target && nothingAimable && (blockedPx <= AIM_BAND_MAX_PX || carryCapBiting || partBehind);
            if (rawBlocked) {
              s.blockedStamp = Date.now();
              blockedWhy = blockedPx <= AIM_BAND_MAX_PX ? "socket" : carryCapBiting ? "cap" : "behind";
            }
            aimBlockedNow = !target && (rawBlocked || Date.now() - s.blockedStamp < 300);
            // The 300ms tail, named apart from the triggers: on those frames nothing is firing and the chip is only being HELD, which a bare reason string would misreport as a live cause.
            if (aimBlockedNow && !rawBlocked) blockedWhy = "hold";
            // The SEGMENT distance owns matching only. The VISIBLE pulls (magnet position, rotation ease, fit) measure to the park point itself: on-device, letting the magnet feed on the segment turned the whole hole→park corridor into a capture zone — the screw leapt to the socket the moment the finger crossed the corridor and stayed there while the finger travelled ("it does not ride my finger", phone screenshot with Drop it! stuck on). Screen-invisible consumers (depth blend) keep the segment aim.
            if (target) {
              const spT = worldToScreen(target.matchVisual);
              pullD = spT
                ? Math.hypot(fingerPx.x - spT.x, fingerPx.y - spT.y) *
                  ((2 * spT.depth * Math.tan((FOV_Y_DEG * Math.PI) / 360)) / winH)
                : Infinity;
            }
            // Ease the drag plane toward the matched socket's height (multi-height groups); slides the part ALONG the finger's view ray, so it is invisible on screen. Same hold-point anchoring as the session plane.
            const wantY = target
              ? target.position[1] +
                s.grabOffset[1] +
                parkShiftFor(furniture.parts[target.action.partId!])[1]
              : s.basePlaneY;
            // Only the horizontal plane has a height to ease. On the upright plane the finger owns
            // world-Y directly, and moving the plane under it would fight the drag.
            if (!s.uprightAnchor) s.planeY += (wantY - s.planeY) * 0.25;
            // Socket-depth policy — the second half of the on-ray contract: the plane owns depth only while it is trustworthy. Near a matched socket the depth eases to the point on the finger's RAY nearest that socket — screen-invisible (movement along the ray never moves the part on screen), but it swaps a grazing plane's metres-per-pixel runaway for the socket's own depth, so the snap window is pixels of AIM rather than pixels of tremor. The aim distance is recomputed for the CHOSEN target (hysteresis can keep `current` while bestD measured the rival). Upright parts skip it: their anchor already pins depth.
            if (!s.uprightAnchor) {
              const la = getLookAt();
              if (la) {
                frameRay = screenRay(
                  { eye: la[0], center: la[1], up: la[2] },
                  FOV_Y_DEG,
                  winW,
                  winH,
                  e.absoluteX,
                  e.absoluteY - FINGER_LIFT_DP,
                );
              }
              if (target) {
                const dT = distPx(target);
                depthAim = { d: dT.px * dT.mPerPx };
                s.depthTarget = target.matchVisual;
              }
              // Re-reference the carry depth for the NEXT frame (SOCKET_DEPTH_CARRY_ENABLED). The matched socket owns it while there is one, the nearest candidate otherwise — so the part is at socket depth all the way in, not only once it matches. Kept on the session rather than recomputed at the carry site because the carry runs before the matcher; the resulting one-frame lag only shows if the aim crosses between sockets at different depths, and a stale value is still a socket's depth rather than the bounding sphere's.
              const depthRef = target ?? nearest;
              if (depthRef) {
                const spD = worldToScreen(depthRef.seatVisual ?? depthRef.holdPosition);
                if (spD) s.socketDepth = spD.depth;
              }
            }
          }

          // Level mode (and any path that didn't set a park-point pull) keeps the classic single distance for the ramps.
          if (!Number.isFinite(pullD)) pullD = bestD;
          if (p) {
            // The depth blend eases over TIME toward the aim-derived weight instead of taking it outright each frame. Taking it outright made depth a direct function of where the finger IS, and near a socket that function is steep and non-monotonic — measured on a zoomed DALFRED leg the depth ran 0.120 -> 0.462 -> 0.120 m as the aim crossed the socket band. Since the part's body hangs off the carry point by a fixed WORLD offset (a leg's whole length, now that the hold point is its real joint) and its screen offset is that over depth, a depth moving that fast moved the body faster than the finger — and backwards on the way out of the band, at a measured gain of -0.30. Easing decouples depth from the aim's moment-to-moment value, so it can no longer race the finger.
            const wantBlend = DEPTH_BLEND_ENABLED && depthAim
              ? Math.max(
                  0,
                  Math.min(
                    1,
                    (APPROACH_RADIUS_M * band - depthAim.d) /
                      ((APPROACH_RADIUS_M - snapDist) * band),
                  ),
                )
              : 0;
            s.depthBlend += (wantBlend - s.depthBlend) * DEPTH_BLEND_EASE;
            if (s.depthBlend <= DEPTH_BLEND_EPS) {
              s.depthBlend = 0;
              s.depthTarget = null;
            } else if (s.depthTarget && frameRay) {
              // The socket point is recomputed on THIS frame's ray, never remembered from the last one: a stale point belongs to the ray the finger was on a frame ago, and blending toward it would slide the part off the finger — the one invariant the whole on-ray design exists to hold.
              const q = rayPointNearest(frameRay.eye, frameRay.dir, s.depthTarget);
              p = [
                p[0] + (q[0] - p[0]) * s.depthBlend,
                p[1] + (q[1] - p[1]) * s.depthBlend,
                p[2] + (q[2] - p[2]) * s.depthBlend,
              ];
            }
            // Magnetic snap: once a socket is matched, the part eases toward it as it approaches (no match = it stays pinned under the finger, t = 0). Fit feedback (color states) is independent of the pull.
            const magnetic = !!target;
            // Rotation factor: eases over the whole approach band (the gradual turn toward the socket's orientation).
            const rotT = magnetic
              ? Math.max(
                  0,
                  Math.min(
                    1,
                    (APPROACH_RADIUS_M * band - pullD) /
                      ((APPROACH_RADIUS_M - snapDist) * band),
                  ),
                )
              : 0;
            // Position factor: a much tighter band so the part stays under the finger (responsive control) and only commits to the socket when genuinely close.
            const posT = magnetic
              ? Math.max(
                  0,
                  Math.min(
                    1,
                    (POS_PULL_START_M * band - pullD) /
                      ((POS_PULL_START_M - POS_PULL_FULL_M) * band),
                  ),
                )
              : 0;
            // DEV rotation probe (one-shot per target change): whether there is any rotation to magnetize AT ALL — flat-node GLBs bake identity on every part, making the slerp a structural no-op.
            if (__DEV__ && target && s.matchedActionId !== lastRotLogId) {
              lastRotLogId = s.matchedActionId;
              console.log(
                `[rot] tgt=${target.action.actionId} rotT=${rotT.toFixed(2)} bakedRot=${s.bakedRot.map((v) => v.toFixed(3)).join(",")} targetRot=${target.rotation.map((v) => v.toFixed(3)).join(",")}`,
              );
            }
            // No hover-lift: the part eases straight to the socket so there's no vertical "drop" on release — it just moves to where it should rest (the loose state for screws/legs is still applied on release).
            s.hoverLift = 0;
            // Hold-point-pinned rotation. The driver composes T·R about the NODE ORIGIN (native updateTransform is new*current), and the node origin is not the hold point — a DALFRED leg's origin is its FOOT, 0.43 m from the held joint. Rotating about the origin swept the joint and the whole body away from the finger in an arc, which read as "the part is not magnetic to the rotation" while the probe swore gapPx=0 (it measures intent, not the entity). Pinning: the magnet pulls the JOINT toward the socket's holdPosition, and the node position is re-aimed through the slerp-rotated anchor so the joint stays exactly where the drag put it at every rotT. At rotT=0 the delta is identity and this is byte-for-byte the old translation.
            const rotQ = target
              ? quatSlerp(s.bakedRot, target.rotation, rotT)
              : s.bakedRot;
            const gRot = quatRotateVec3(
              quatMultiply(rotQ, quatConjugate(s.bakedRot)),
              s.grabOffset,
            );
            const holdT: Vec3 = target
              ? [
                  p[0] + (target.holdPosition[0] - p[0]) * posT,
                  p[1] + (target.holdPosition[1] - p[1]) * posT,
                  p[2] + (target.holdPosition[2] - p[2]) * posT,
                ]
              : p;
            probeAnchor = gRot;
            heldDriver.setPose(
              [
                holdT[0] - gRot[0] - s.bakedPos[0],
                holdT[1] - gRot[1] - s.bakedPos[1],
                holdT[2] - gRot[2] - s.bakedPos[2],
              ],
              rotQ,
            );
            // Mirror the held lead's live world-space offset onto its riding siblings every drag frame, so the whole slide moves as one object in hand.
            if (hasRidingBodies(furniture, action.partId)) slideDriver.set(heldDriver.value);
          }
          const off = heldDriver.value;
          const held: Vec3 = [
            s.bakedPos[0] + off[0],
            s.bakedPos[1] + off[1] - s.hoverLift,
            s.bakedPos[2] + off[2],
          ];
          // Acceptance under the no-plane carry measures the PLAYER's error — 2D aim to the delivery point — not the transient world distance. The depth glide is SYSTEM-owned and finishes on its own clock; judging fit on the world gap meant a release with the finger dead on the socket bounced back to the tray purely because the glide had frames left (emulator run: 3 px of aim, 0.3 m of unfinished depth, fit stuck at held). Level mode and upright parts keep computeFit: their held depth is real, not a glide in progress.
          const fs =
            target && depthAim
              ? // Acceptance arms on the SEGMENT aim (depthAim.d): the player aims at the HOLE they can see, and the park/stage delivery pose sits a fixed world offset from it along the part's axis — measuring the green to the delivery point (pullD) made that offset the required aim error, negligible zoomed out and 100+px zoomed in ("must aim lower than the target to snap"). The MAGNET stays on pullD: position pull keyed to the segment is the corridor-capture regression; a state flag keyed to it is not, and the release animation carries the part in from wherever it visually hovers.
                depthAim.d <= snapDist * band
                ? "nearCorrect"
                : depthAim.d <= snapDist * band * APPROACH_FACTOR
                  ? "approaching"
                  : "held"
              : target
                ? computeFit(
                    held,
                    target.rotation,
                    { position: target.position, rotation: target.rotation },
                    s.otherSockets,
                    { distance: snapDist * band, angleDeg: 25 },
                  )
                : "held";
          if (
            fs !== store.fitState ||
            s.matchedActionId !== store.matchedActionId
          )
            store.setDragFit(fs, s.matchedActionId);
          if (aimBlockedNow !== store.aimBlocked) store.setAimBlocked(aimBlockedNow);
          // DEV drag probe (throttled): one line per ~quarter second into the Metro console, enough to reconstruct which mechanism owns the part when it separates from the finger. gapPx is the user-facing invariant — the held part's visual center vs the touch, on screen.
          if (__DEV__ && Date.now() - lastDragLog > 250) {
            lastDragLog = Date.now();
            const pa = probeAnchor ?? s.grabOffset;
            const heldVisual: Vec3 = [
              held[0] + pa[0],
              held[1] + pa[1],
              held[2] + pa[2],
            ];
            const hp = worldToScreen(heldVisual);
            const gapPx = hp
              ? Math.hypot(hp.x - e.absoluteX, hp.y - (e.absoluteY - FINGER_LIFT_DP)).toFixed(0)
              : "offscreen";
            // Zoom and carry depth, so an on-device report says WHICH zoom it happened at instead of leaving it to be guessed — the clearance floor is a function of both, and the last round of reports could not be reproduced without them.
            const la2 = getLookAt();
            const camDist = la2
              ? Math.hypot(la2[1][0] - la2[0][0], la2[1][1] - la2[0][1], la2[1][2] - la2[0][2])
              : 0;
            const carryDepth =
              la2 && p
                ? (() => {
                    const fx = la2[1][0] - la2[0][0], fy = la2[1][1] - la2[0][1], fz = la2[1][2] - la2[0][2];
                    const fl = Math.hypot(fx, fy, fz) || 1;
                    return (((p[0] - la2[0][0]) * fx + (p[1] - la2[0][1]) * fy + (p[2] - la2[0][2]) * fz) / fl).toFixed(3);
                  })()
                : "?";
            const nSeat = nearest?.seatVisual ? worldToScreen(nearest.seatVisual) : null;
            const nPark = nearest?.matchVisual ? worldToScreen(nearest.matchVisual) : null;
            console.log(
              `[drag] f=(${e.absoluteX.toFixed(0)},${e.absoluteY.toFixed(0)}) part=(${hp ? `${hp.x.toFixed(0)},${hp.y.toFixed(0)}` : "?"}) gapPx=${gapPx} p=${p ? p.map((v) => v.toFixed(2)).join(",") : "null"} plane=${s.planeY.toFixed(2)} upright=${!!s.uprightAnchor} aim=${Number.isFinite(bestD) ? bestD.toFixed(3) : "inf"} pull=${Number.isFinite(pullD) ? pullD.toFixed(3) : "inf"} band=${band.toFixed(2)} cam=${camDist.toFixed(3)} reach=${s.holdReach.toFixed(3)} carry=${carryDepth} cap=${Number.isFinite(s.carryCap) ? s.carryCap.toFixed(3) : "-"} sock=${s.socketDepth?.toFixed(3) ?? "-"} blend=${s.depthBlend.toFixed(2)} tgt=${s.matchedActionId ?? "-"} blk=${aimBlockedNow ? blockedWhy : 0} occ=${blockedBy ?? "-"} vis=${nearestVis} near=${nearest?.action.actionId ?? "-"} seat=(${nSeat ? `${nSeat.x.toFixed(0)},${nSeat.y.toFixed(0)}` : "?"}) park=(${nPark ? `${nPark.x.toFixed(0)},${nPark.y.toFixed(0)}` : "?"}) fit=${fs} pk=${hasPickProber() ? s.pickCache.lastDiag || "none" : "OFF"} BUILD=noplane19`,
            );
          }
        })
        .onFinalize(() => {
          if (canvas) {
            if (canvasStrafing) {
              canvasStrafing = false;
              onPanEnd?.();
              return;
            }
            if (!canvasStarted) return;
            canvasStarted = false;
          } else {
            ringProgress.value = withTiming(0, { duration: 80 });
          }
          const store = useGameStore.getState();
          if (store.heldActionId !== action.actionId) return;
          const s = session.current;
          session.current = null;
          if (!s) {
            // Card only: a tap/failed long-press on the held part's card puts it back. A canvas touch that never activated must NOT put it back. No live session ever ran here, but a prior drag could have left slideDriver at a floated offset — clear it so a stale value can't leak into the next lead pickup.
            if (!canvas) {
              if (hasRidingBodies(store.furniture, action.partId)) slideDriver.set([0, 0, 0]);
              store.cancelHeld();
            }
            return;
          }
          const ready = store.fitState === "nearCorrect";
          const needsRotation = store.fitState === "nearRotation";
          const matched =
            s.candidates.find(
              (c) => c.action.actionId === store.matchedActionId,
            ) ?? s.candidates[0];
          if ((ready || needsRotation) && matched) {
            // Committing to the socket: siblings drop the ride and revert to their normal (pop-in) placed presentation right away — the frame still eases into the socket over the animation below, unchanged from before this phase.
            if (hasRidingBodies(store.furniture, action.partId)) slideDriver.set([0, 0, 0]);
            const st = useGameStore.getState();
            const doneSet = new Set(st.completed);
            const eng =
              st.furniture && matched.action.type === "placePart"
                ? placeEngagement(st.furniture, matched.action, doneSet)
                : "drop";
            const isScrew = eng === "screw";
            // The SAME park the visibility gate judged this candidate's second chance on (the mapping above) — one function, so the point the player was allowed to aim at and the point the part is delivered to cannot drift apart. `eng` is handed over rather than recomputed: this site's own "drop" for a non-placePart action is part of the contract.
            const backoff = st.furniture
              ? parkOffsetFor(st.furniture, matched.action, doneSet, eng)
              : null;
            const dest: Float3 = [
              matched.position[0] - s.bakedPos[0] + (backoff?.[0] ?? 0),
              matched.position[1] - s.bakedPos[1] + (backoff?.[1] ?? 0),
              matched.position[2] - s.bakedPos[2] + (backoff?.[2] ?? 0),
            ];
            animateDriver(heldDriver, dest, 250, () => {
              const store = useGameStore.getState();
              if (needsRotation || isScrew) {
                store.parkOrientation(matched.action.actionId);
                Haptics.selectionAsync();
              } else if (eng === "slide" || eng === "press") {
                store.parkDrive(matched.action.actionId, eng);
                Haptics.selectionAsync();
              } else {
                store.releaseHeld();
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }
            });
          } else if (store.settings.releaseBehavior === "float") {
            // FLOAT: leave the part exactly where it was set down. heldActionId stays set (we don't cancelHeld), so the driver keeps its offset and the part renders in place — drag it again on the canvas or use the tray Put-back to return it. Ported from the on-release engine. slideDriver is intentionally left as-is (not zeroed): the lead is still logically held, just parked, so its siblings should keep riding at the same offset until the next drag frame or an explicit cancel.
            // A drag that ended without placing. Counted here rather than in releaseHeld, which only runs when a socket matched — so it sees successes and never failures.
            // TRAY DRAGS ONLY. `canvas` is the re-grab of a part already floating in the scene —
            // nudging a piece around, or a strafe that turned into a drag — and counting those made
            // the Recenter offer arrive after ordinary camera work rather than after four real
            // attempts to place a part from the tray.
            if (!canvas) useGameStore.getState().noteMiss(action.actionId);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          } else {
            // complimentary function for FLOAT: AUTO-RETURN: the part flies to a recover spot in front of the camera and returns to the tray.
            const la = getLookAt();
            const off = heldDriver.value;
            let dest: Float3 = s.base;
            if (la) {
              const [eye, center] = la;
              const fx = center[0] - eye[0];
              const fz = center[2] - eye[2];
              const fl = Math.hypot(fx, fz) || 1;
              dest = [
                off[0] + (-fz / fl) * 0.55,
                off[1] + 0.08,
                off[2] + (fx / fl) * 0.55,
              ];
            }
            // A held lead's riding siblings fly back WITH it as one coherent object (heldActionId stays set through the whole tween, so they render in "riding" mode the entire flight — an immediate zero here would pop them to their assembled pose at the empty socket while the frame visibly recovers).
            const lead = hasRidingBodies(store.furniture, action.partId);
            if (lead) animateClusterDriver(slideDriver, dest, 220);
            animateDriver(heldDriver, dest, 220, () => {
              const st = useGameStore.getState();
              st.cancelHeld();
              // cancelHeld FIRST (clears heldActionId → riding parts unmount), THEN zero the driver so it's clean for the next lead pickup and nothing ever renders the transient reset.
              if (lead) slideDriver.set([0, 0, 0]);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              st.noteBlocked(action.actionId);
              // The auto-return half of the same failure. noteBlocked is NOT a substitute: it also fires when a pickup is refused outright, which is not a failed drag.
              // Tray drags only, for the same reason as the float branch above.
              if (!canvas) st.noteMiss(action.actionId);
            });
          }
        });
      return g;
    },
    [
      getLookAt,
      heldDriver,
      slideDriver,
      getFocusPoint,
      fingerOnCameraPlaneAt,
      fingerOnPlane,
      fingerOnRay,
      carryCapAt,
      assemblyRadius,
      fingerOnCameraPlane,
      worldToScreen,
      ringX,
      ringY,
      ringProgress,
      isFloating,
      onPanStart,
      onPanMove,
      onPanEnd,
      // The gesture closure captures this, so a settings change has to rebuild it.
      dragPlaneSetting,
      jointAnchors,
    ],
  );

  /** Ease the carried cluster's shared offset home over `ms` — a JS rAF loop writing ONE shared value per frame; the render-thread loop does the actual moving. */
  const animateCarryHome = useCallback(
    (from: Float3, ms: number, onDone: () => void) => {
      const t0 = Date.now();
      const step = () => {
        const k = Math.min(1, (Date.now() - t0) / ms);
        const e = 1 - (1 - k) * (1 - k);
        carryShared.value = {
          x: from[0] * (1 - e),
          y: from[1] * (1 - e),
          z: from[2] * (1 - e),
        };
        if (k < 1) requestAnimationFrame(step);
        else onDone();
      };
      requestAnimationFrame(step);
    },
    [carryShared],
  );

  /** Combine drag: a cluster card behaves like a part card. CARRY phase — the whole cluster materializes under the finger on the work plane (camera-projected, exactly like a part pickup) and follows it as ONE rigid body, gliding at its own baked height; the gesture only writes `carryShared`, and the render-thread loop (scene/CombineCarry) moves the entities. Release near its target: the seed cluster eases home and completes; a slide-joined cluster snaps to its park pose — the telescoping `sink` extends the runners out to meet it — and hands off to SlideControl for the drive home. Release anywhere else returns it to its card. */
  const buildClusterGesture = useCallback(
    (
      action: AssemblyAction,
      sink: OffsetSink,
      park: ParkInfo | null,
    ) => {
      const target: Float3 = park ? ([...park.offset] as Float3) : [0, 0, 0];
      // Long-press activation, exactly like a part card: the tray's ScrollView claims a bare pan the moment the finger clears its slop (the drag froze a step outside the tray), but it cannot steal a gesture that is already ACTIVE when the hold completes.
      return Gesture.Pan()
        .runOnJS(true)
        .activateAfterLongPress(PICKUP_MS)
        .onTouchesDown((e) => {
          const t = e.allTouches[0];
          ringX.value = t.absoluteX;
          ringY.value = t.absoluteY;
          ringProgress.value = 0;
          ringProgress.value = withTiming(1, { duration: PICKUP_MS });
        })
        .onTouchesUp(() => {
          ringProgress.value = withTiming(0, { duration: 80 });
        })
        .onStart((e) => {
          ringProgress.value = withTiming(0, { duration: 120 });
          const store = useGameStore.getState();
          const f = store.furniture;
          if (!action.cluster || !f) return;
          // the finger carries the cluster's baked centroid; the carry plane sits at that height so the cluster glides level across the bench
          const members = Object.values(f.parts).filter(
            (p) => p.cluster === action.cluster,
          );
          const c: Float3 = [0, 0, 0];
          for (const p of members) {
            c[0] += p.pose.position[0] / members.length;
            c[1] += p.pose.position[1] / members.length;
            c[2] += p.pose.position[2] / members.length;
          }
          const planeY = c[1];
          // A vertically-parking cluster — and the SEED, whose target is its own baked pose — rides the camera-facing plane through that target instead of the horizontal glide: the glide plane sits where a level orbit sees it edge-on and the finger's ray lands metres out, so the in-plane snap was unreachable from most of the screen (DALFRED's seat, measured at every zoom; DALFRED's base, unplaceable outright).
          const anchor = clusterCarryAnchor(c, target);
          const p = anchor
            ? (fingerOnCameraPlaneAt(e.absoluteX, e.absoluteY, anchor) ??
              fingerOnPlane(e.absoluteX, e.absoluteY, planeY))
            : (fingerOnPlane(e.absoluteX, e.absoluteY, planeY) ??
              fingerOnCameraPlaneAt(e.absoluteX, e.absoluteY, getFocusPoint()));
          const lastO: Float3 = p ? clusterCarryOffset(p, c, target, !!anchor) : target;
          clusterSession.current = { ref: c, planeY, lastO, anchor };
          store.setCombiningCluster(action.cluster);
          store.setDragFit("held", null);
          // pin the target marker where the release must land: the centroid shifted by the park offset (or the seat itself for the seed)
          const sp = worldToScreen([c[0] + target[0], c[1] + target[1], c[2] + target[2]]);
          if (sp) {
            clusterRingX.value = sp.x;
            clusterRingY.value = sp.y;
          }
          carryShared.value = { x: lastO[0], y: lastO[1], z: lastO[2] };
        })
        .onUpdate((e) => {
          const s = clusterSession.current;
          if (!s) return;
          // Same plane choice as onStart, per frame: the anchored camera plane for a vertical park, the horizontal glide otherwise. The getFocusPoint fallback survives for the glide's true misses (anchor behind the lens / no camera yet), though dragPlanePoint answers the horizon itself now.
          const p = s.anchor
            ? (fingerOnCameraPlaneAt(e.absoluteX, e.absoluteY, s.anchor) ??
              fingerOnPlane(e.absoluteX, e.absoluteY, s.planeY))
            : (fingerOnPlane(e.absoluteX, e.absoluteY, s.planeY) ??
              fingerOnCameraPlaneAt(e.absoluteX, e.absoluteY, getFocusPoint()));
          if (!p) return;
          const o: Float3 = clusterCarryOffset(p, s.ref, target, !!s.anchor);
          s.lastO = o;
          carryShared.value = { x: o[0], y: o[1], z: o[2] };
          // re-project the marker each move so it survives a mid-drag zoom
          const sp = worldToScreen([s.ref[0] + target[0], s.ref[1] + target[1], s.ref[2] + target[2]]);
          if (sp) {
            clusterRingX.value = sp.x;
            clusterRingY.value = sp.y;
          }
          const snapDist = Math.min(
            SNAP_DIST_MAX,
            Math.max(SNAP_DIST_MIN, useGameStore.getState().settings.snapDistance),
          );
          // One measure for both carries, because clusterCarryOffset already made the glide's y equal target[1]: the miss there is still purely in-plane, while an anchored carry's vertical miss is a real one the player can see.
          const d = Math.hypot(o[0] - target[0], o[1] - target[1], o[2] - target[2]);
          const fit =
            d <= snapDist
              ? "nearCorrect"
              : d <= snapDist * APPROACH_FACTOR
                ? "approaching"
                : "held";
          if (fit !== useGameStore.getState().fitState) {
            useGameStore.getState().setDragFit(fit, null);
          }
        })
        .onFinalize(() => {
          const s = clusterSession.current;
          clusterSession.current = null;
          const store = useGameStore.getState();
          const ready = store.fitState === "nearCorrect";
          store.setDragFit("idle", null);
          if (!ready) {
            // back to its card: the mode flip pulls the entities out of the scene, so the offset reset is invisible
            store.setCombiningCluster(null);
            carryShared.value = { x: 0, y: 0, z: 0 };
            return;
          }
          if (park) {
            // snap the carry to the park pose and hand off to the drive gesture (SlideControl glide or ScrewControl dial, per the cluster's authored driveMotion) for park -> 0
            carryShared.value = { x: park.offset[0], y: park.offset[1], z: park.offset[2] };
            sink.set([...park.offset] as Float3);
            store.parkDrive(
              action.actionId,
              action.cluster ? clusterDriveKind(store.furniture?.clusters, action.cluster) : "slide",
            );
            Haptics.selectionAsync();
            return;
          }
          // the seed cluster eases the last stretch home, then the placement commits
          animateCarryHome(s?.lastO ?? [0, 0, 0], 180, () => {
            const st = useGameStore.getState();
            st.completeAction(action.actionId);
            st.setCombiningCluster(null);
            carryShared.value = { x: 0, y: 0, z: 0 };
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          });
        });
    },
    [fingerOnPlane, fingerOnCameraPlaneAt, getFocusPoint, worldToScreen, clusterRingX, clusterRingY, ringX, ringY, ringProgress, carryShared, animateCarryHome],
  );

  // Cluster gestures are cached like part gestures so a ClusterTray re-render hands GestureDetector the SAME object and gesture-handler never swaps callbacks mid-drag (the swap that reset the closure state before the clusterSession fix; the cache kills the rebuild at the source).
  const clusterGestureCache = useMemo(
    () => new Map<string, { action: AssemblyAction; gesture: GestureType }>(),
    [buildClusterGesture],
  );
  // Hits require the same action OBJECT, not just the same id: action ids can collide across furnitures, and this hook never observes furniture swaps, so an id-only hit could serve a gesture with a stale baked action/park.
  const clusterGestureFor = useCallback(
    (action: AssemblyAction, sink: OffsetSink, park: ParkInfo | null) => {
      const hit = clusterGestureCache.get(action.actionId);
      if (hit && hit.action === action) return hit.gesture;
      const gesture = buildClusterGesture(action, sink, park);
      clusterGestureCache.set(action.actionId, { action, gesture });
      return gesture;
    },
    [clusterGestureCache, buildClusterGesture],
  );

  const gestureCache = useMemo(
    () => new Map<string, GestureType>(),
    [buildGesture],
  );
  const gestureFor = useCallback(
    (action: AssemblyAction) => {
      let g = gestureCache.get(action.actionId);
      if (!g) {
        g = buildGesture(action);
        gestureCache.set(action.actionId, g);
      }
      return g;
    },
    [gestureCache, buildGesture],
  );

  /** Canvas re-grab: the same drag for `action`, but activated by a one-finger drag anywhere on the scene while that part is FLOATING (releaseBehavior "float"). Compose it into the scene gesture alongside (and before) the camera strafe. */
  const canvasGestureFor = useCallback(
    (action: AssemblyAction) => {
      const key = `canvas:${action.actionId}`;
      let g = gestureCache.get(key);
      if (!g) {
        g = buildGesture(action, true);
        gestureCache.set(key, g);
      }
      return g;
    },
    [gestureCache, buildGesture],
  );

  const ringOverlay = (
    <>
      <PickupRing x={ringX} y={ringY} progress={ringProgress} />
      <ClusterTargetRing x={clusterRingX} y={clusterRingY} />
    </>
  );

  return { gestureFor, canvasGestureFor, clusterGestureFor, ringOverlay };
}
