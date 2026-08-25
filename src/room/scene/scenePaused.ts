// Whether the room is on screen but not worth drawing: a near-full-screen popup (shop, inventory, friends) is covering it. NOT the same question as whether the scene is MOUNTED, which RoomExperience answers with HEAVY_ROUTES — a route carrying its own Filament scene tears this one down completely, because two engines must never run at once. A popup does the opposite on purpose: the room stays mounted so dismissing it costs nothing, and every GLB, texture and material instance the scene has in hand survives. What that leaves behind is a full-rate render — TAA at eight jitter positions, six levels of bloom, SSAO and a shadow pass — plus one JS rAF loop per wall item, the wall-culling loop and the avatar's, all running under a panel nobody can see through. This is what turns those off.
//
// A MODULE-LEVEL FLAG, not React state or context, and for the same reason cameraAzimuth in ../core/placement is one: the readers are animation-frame callbacks, which need the CURRENT value at the moment they run rather than the value captured when their effect last closed over it. Only one room scene can exist at a time — HEAVY_ROUTES guarantees it — so a single flag has exactly one writer, and the alternative (context plus a ref mirror in every reader) buys nothing a plain variable does not already give.
//
// READ INSIDE THE TICK, NEVER PUT IN AN EFFECT'S DEPENDENCIES. That is the load-bearing part: every rAF loop in this scene owns real teardown — the wall-item fade hands its entities back to the scene at full opacity and repaints to alpha 1, the culling loop's diff state describes what the materials currently hold — so restarting a loop on every popup would run that teardown, popping culled windows back into a room the player cannot see and then fading them out again on the way back. Skipping the BODY leaves every loop's lifecycle and diff state exactly as it was.
let paused = false;

export function setScenePaused(next: boolean): void {
  paused = next;
}

export function isScenePaused(): boolean {
  return paused;
}
