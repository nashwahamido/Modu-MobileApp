export type TutorialTargetId =
  | "scene"
  | "joystick"
  | "recenter"
  | "partsTray"
  | "assemblyArea"
  | "tool"
  | "beatControl"
  | "hint"
  | "undo"
  | "focus"
  | "spot"
  | "settings"
  /** Undo and Recenter together — one rectangle over the pair, taught as a single idea. */
  | "undoRecenter"
  /** The Auto button. Its own target rather than part of a row: Auto and Spot sit at opposite ends
   *  of the toggles row with Focus between them, so a single rectangle over "the two the copy names"
   *  would light Focus as well. The stuck-help step rings both of these separately. */
  | "auto"
  /** The whole screen, for the grip step: what it teaches is the DEVICE, not a control on it. */
  | "device";

export type TutorialEvent =
  | "grip_acknowledged"
  | "joystick_moved"
  | "camera_recentered"
  | "pinch_zoomed"
  | "one_finger_panned"
  | "underside_view_reached"
  | "part_picked_up"
  | "part_snapped"
  | "all_legs_installed"
  | "connector_placed"
  | "connector_tightened"
  | "assembly_reoriented"
  | "step_undone"
  | "backdrop_changed"
  | "instruction_preferences_changed"
  | "spot_used"
  | "focus_mode_toggled"
  | "hint_requested"
  | "tool_used"
  /** A step the player READS rather than does: any tap on the screen closes it. Used where the
   *  tutorial is explaining a control's purpose instead of asking for it to be exercised. */
  | "controls_acknowledged"
  /** The Settings panel was OPENED and then closed again — by Done or by tapping outside it.
   *  Distinct from backdrop_changed and instruction_preferences_changed, which require the player to
   *  actually change a setting: this one asks them to look, not to commit to anything. */
  | "settings_browsed";

export type ToolTutorialKind = "tighten" | "tap" | "beat" | "press";
export type TutorialAudioSource = number | { uri: string };

export interface TutorialContext {
  profile: "control" | "visual" | "momentum" | "clearPath";
  mode: "free" | "guide" | "strict";
  manualTools: boolean;
  softHints: boolean;
  /** A tablet is not held like a controller — it is propped, or held at the frame with the thumbs
   *  nowhere near the joystick — so the grip step is dropped there rather than teaching a grip the
   *  player cannot take. See GRIP_STEP_ID below. */
  tablet?: boolean;
}

export interface TutorialStep {
  id: string;
  targetId: TutorialTargetId;
  message: string;
  shortLabel?: string;
  event: TutorialEvent;
  audio?: TutorialAudioSource;
  /** Kept out of the "N of M" counter on the card, in BOTH halves — it is not the numerator and it
   *  is not in the denominator either, exactly like the grip step.
   *
   *  For a step that is not one move but the whole rest of the build. "Continue assembling." spans
   *  a bolt, a tighten and a leg, four times over; calling that "10 of 10" tells the player they are
   *  one action from the end when they are twelve, and calling it "10 of 10" for the entire time
   *  they work makes a counter that never moves. Silence is the honest reading. */
  unnumbered?: boolean;
  when?: (context: TutorialContext) => boolean;
}

export const TUTORIAL_REWARD_TOKENS = 80;
export const TUTORIAL_STEP_REWARD_TOKENS = 10;

/** The short, first-run core loop. Preference education stays contextual. */
export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    // FIRST, before anything on screen. Every control after this assumes two thumbs on the edges -
    // the joystick is bottom-left, the tray bottom-right - and a player holding the phone one-handed
    // to read finds the first drag awkward for a reason the tutorial never mentions.
    id: "hold-like-controller",
    targetId: "device",
    message: "Hold your device with both hands, like a game controller.",
    shortLabel: "Get comfortable",
    event: "grip_acknowledged",
  },
  {
    id: "long-press-part",
    targetId: "partsTray",
    message: "Long-press a part card to pick it up.",
    shortLabel: "Pick up the tabletop",
    event: "part_picked_up",
  },
  {
    id: "drag-and-snap",
    targetId: "assemblyArea",
    message: "Drag the part into place. Release when it lines up.",
    shortLabel: "Place the tabletop",
    event: "part_snapped",
  },
  {
    id: "view-under-table",
    targetId: "joystick",
    message:
      "Use the joystick to lower the view until you can clearly see underneath the tabletop.",
    shortLabel: "View the underside",
    event: "underside_view_reached",
  },
  {
    id: "place-connector",
    targetId: "partsTray",
    message: "Long-press a bolt, then place it into the highlighted hole.",
    shortLabel: "Insert the first bolt",
    event: "connector_placed",
  },
  {
    id: "tighten-connector",
    targetId: "tool",
    // LACK's bolt is hand-tightened: hardware.ts calls it "spun in by hand", and the tool override
    // that put an Allen key in the toolbox and the scene is gone.
    message: "Turn clockwise to tighten the bolt by hand.",
    shortLabel: "Tighten the bolt",
    event: "connector_tightened",
  },
  // THE LAST STEP. The tutorial used to close on a "stand-table-upright" beat, which was a swipe
  // card for an action that moved nothing — removed 2026-08-19 along with `finishing_checks` on
  // every furniture. Installing the fourth leg finishes the table, so it finishes the tutorial too,
  // and the copy says so rather than pointing at a next thing that no longer exists.
  {
    id: "install-four-legs",
    targetId: "partsTray",
    message:
      "Install the leg onto the bolt. Repeat the bolt and leg steps for all four legs to finish the table.",
    shortLabel: "Install all four legs",
    event: "all_legs_installed",
  },
];

/** Canonical short copy for recording voice-over; audio assets can be attached later. */
export const TUTORIAL_VOICE_OVER_SCRIPT = TUTORIAL_STEPS.map(
  ({ id, message }) => ({ id, text: message }),
);

/**
 * Content ready for later, contextual moments. These are deliberately not part
 * of the opening sequence until product confirms the opening-vs-later split.
 */
export const CONTEXTUAL_TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "control-hint",
    targetId: "hint",
    message:
      "Need a nudge? Tap Hint for a calm suggestion about what to place next.",
    event: "hint_requested",
    when: ({ profile, mode, softHints }) =>
      profile === "control" && mode === "free" && softHints,
  },
  {
    id: "one-finger-pan",
    targetId: "scene",
    message: "Drag one finger across empty space to pan the camera.",
    event: "one_finger_panned",
  },
  {
    id: "undo-step",
    targetId: "undo",
    message: "Use Back one step to return to the previous assembly step.",
    event: "step_undone",
  },
];

/** Momentum and Control explicitly teach the HUD controls requested in the review. */
export const SHARED_HUD_TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "hud-recenter",
    targetId: "recenter",
    message: "Tap Recenter to bring the furniture back into view.",
    shortLabel: "Try Recenter",
    event: "camera_recentered",
  },
  {
    id: "hud-undo",
    targetId: "undo",
    message: "Tap Back one step to undo the last assembly action.",
    shortLabel: "Try Undo",
    event: "step_undone",
  },
  {
    id: "hud-focus",
    targetId: "focus",
    message: "Tap Focus to reduce the screen to the controls you need now.",
    shortLabel: "Try Focus",
    event: "focus_mode_toggled",
  },
  {
    id: "hud-spot",
    targetId: "spot",
    // Spot no longer moves the camera. It plays a ghost of the next part travelling into its socket,
    // so the copy has to describe a demonstration rather than a framing.
    message: "Tap Spot to see the next part move into place.",
    shortLabel: "Try Spot",
    event: "spot_used",
  },
];

/** Optional preference walkthrough offered after the short core tutorial. */
export const SETTINGS_TUTORIAL_STEPS: TutorialStep[] = [
  // Background, not Released part: the in-build panel no longer carries the dev interaction rows, and this is the one step every profile gets — Control pins mode "free", which filters the instructions step below out for it. Teaching Background through the real panel is also the standing content decision (TUTORIAL_CONTENT_DECISIONS.display).
  {
    id: "background-settings",
    targetId: "settings",
    message:
      "In Settings, you can change the Build background behind the furniture.",
    event: "backdrop_changed",
  },
  {
    id: "guided-instructions-settings",
    targetId: "settings",
    message:
      "You can choose Standard or Simple instructions, and show or hide the step text.",
    event: "instruction_preferences_changed",
    when: ({ mode }) => mode === "guide",
  },
  // Focus is taught by hud-focus, on the chip itself — the in-build panel no longer carries the row.
];

/**
 * LUMI's own run — the visual profile, and the only profile with a hand-written sequence.
 *
 * A SEPARATE LIST rather than `when` clauses on the shared ones, because this run merges steps the
 * others keep apart: pick-up and drag are one instruction here, and so are the two Settings steps.
 * Expressing that as filters on TUTORIAL_STEPS would have meant a merged step that only ever shows
 * for one profile sitting in the list every profile reads, and `tutorialStepsFor`'s slice(0, 3)
 * silently re-cutting the opening for everyone else the moment the count changed.
 *
 * Every step keeps the two properties that make the tutorial a tutorial: a `targetId` the spotlight
 * rings, and an `event` that only fires when the player has actually DONE the thing. Nothing here
 * advances on a tap-through.
 *
 * No `shortLabel` on any of them, deliberately: the visual profile renders shortLabel in preference
 * to message (MascotGuideOverlay.visualMessageForStep), so a short label here would replace the
 * sentences below with three-word stubs.
 */
export const VISUAL_TUTORIAL_STEPS: TutorialStep[] = [
  // The grip comes first for every profile — the controls that follow assume two thumbs on the edges.
  {
    // THE ONLY STEP IN THIS LIST WITH A shortLabel, and deliberately: the visual profile renders
    // shortLabel in preference to message, which for every other step would swap the authored
    // sentence for a stub. Here it is the opposite — the card the player actually reads is
    // GripCoach's own ("Hold it like a controller", with the hands art and the Got it button), so
    // `message` is never shown and the label is what appears wherever the step is named.
    id: "hold-like-controller",
    targetId: "device",
    message: "Hold your device with both hands, like a game controller.",
    shortLabel: "Get comfortable",
    event: "grip_acknowledged",
  },
  {
    // ONE step where the others have two. The spotlight rings the tray, which is where the gesture
    // starts; it advances on `part_snapped`, not `part_picked_up`, so a player who lifts a part and
    // puts it back down again has not finished the step.
    id: "visual-pickup-and-place",
    targetId: "partsTray",
    message:
      "Long-press a part to drag to canvas then release it in the middle circle.",
    event: "part_snapped",
  },
  {
    // Both Settings steps folded into one, and a BROWSE rather than a change. It used to advance on
    // `backdrop_changed`, which meant the player had to pick a different background to get past a
    // card that never told them to — and left them with a backdrop they had not chosen. Opening the
    // panel and closing it again is the whole ask now.
    id: "visual-settings",
    targetId: "settings",
    message: "You can adjust accessibility features and aesthetics in settings.",
    event: "settings_browsed",
  },
  {
    // `focus_mode_toggled` fires on the FIRST toggle, so the step closes when Focus goes on. The
    // second half of the sentence tells the player how to come back rather than gating on it —
    // there is no "toggled twice" event, and leaving them in focus mode with no way out is worse.
    id: "hud-focus",
    targetId: "focus",
    message: "Simplify the screen with ‘Focus’; press again to restore.",
    event: "focus_mode_toggled",
  },
  {
    id: "view-under-table",
    targetId: "joystick",
    message:
      "Use the joystick to rotate the view.",
    event: "underside_view_reached",
  },
  {
    id: "place-connector",
    targetId: "partsTray",
    message: "Drag a bolt to place it into the highlighted hole.",
    event: "connector_placed",
  },
  {
    // LACK's bolt is hand-tightened: hardware.ts calls it "spun in by hand".
    id: "tighten-connector",
    targetId: "tool",
    message: "Turn clockwise to tighten the bolt by hand.",
    event: "connector_tightened",
  },
  {
    // A step to READ, not to perform — and deliberately so. Undo and Recenter are the two controls a
    // player wants when something has gone wrong, which is the worst moment to be meeting them for
    // the first time; but making the tutorial demand an undo would force a player to break a build
    // they are in the middle of getting right. So it explains, rings both buttons, and closes on any
    // tap (see `controls_acknowledged`).
    id: "visual-undo-recenter",
    targetId: "undoRecenter",
    message:
      'Press "Undo" to go back, or "Recenter" to adjust the view.',
    event: "controls_acknowledged",
  },
  {
    // BEFORE the finishing step, not after it. It is a safety net, and a safety net offered once the
    // table is already built is a footnote — the player has nothing left to be stuck on. Here it
    // lands with three legs still to go, which is exactly when it might be needed.
    //
    // Rings SPOT and AUTO — the two the copy names, and only those. The overlay draws a second ring
    // on the `auto` frame for this step; Focus sits between them in the row and stays unlit.
    //
    // READ-ONLY (`controls_acknowledged`): a tap anywhere closes it, and so does pressing either
    // button. Requiring the player to press one would be worse than it sounds — Spot is a hint they
    // may not need and Auto skips a step they may want to do, so a step that demands one makes the
    // player use a crutch to be told the crutch exists. Auto also does not render outside __DEV__ or
    // a showcase build, so waiting on it would trap a real player forever.
    id: "visual-stuck-help",
    targetId: "spot",
    message:
      'If stuck, press "Spot" for a hint or "Auto" for support.',
    event: "controls_acknowledged",
  },
  {
    id: "install-four-legs",
    targetId: "partsTray",
    message:
      "Continue assembling.",
    event: "all_legs_installed",
  },
];

/**
 * PEBBLE's own run — the clearPath profile, hand-written for the same reason Lumi's is.
 *
 * It used to be COMPOSED, out of `TUTORIAL_STEPS` + the settings pair + `hud-focus`, and that
 * composition is what made it wrong in three separate ways:
 *
 *   - It taught Settings TWICE. `background-settings` and `guided-instructions-settings` ran inline
 *     mid-build, and `settingsTutorialStepsFor` then handed the same two steps back AFTER the table
 *     was finished — the bug already documented for the visual profile below. clearPath is now in
 *     the same `[]` branch, so Settings is taught once, here, and finishing the build finishes the
 *     tutorial.
 *   - `background-settings` advanced on `backdrop_changed`, which forced the player to pick a new
 *     background to get past a card that never asked them to, and left them with a backdrop they had
 *     not chosen. This run BROWSES instead: open the panel, press Done.
 *   - `hud-focus`'s shared copy says Focus REDUCES the screen, which is true for control and
 *     momentum and backwards here. clearPath is the one profile that pins `focusMode: true` at
 *     onboarding (PROFILE_DEFAULTS), so its player starts INSIDE focus mode and the first press
 *     shows them more, not less. Its own list is what lets the sentence say so without touching the
 *     copy the other two profiles read.
 *
 * SHARED IDS ARE DELIBERATE, both ways round. The assembly ids (`view-under-table`,
 * `place-connector`, `tighten-connector`, `install-four-legs`) are the ones tutorial.tsx's tray
 * filter keys on, so keeping them is what keeps the bolt-only tray and the empty joystick-step tray
 * working. The two `visual-` prefixed ids are here for the same reason and read oddly for it: their
 * behaviour is wired to the id in three places — the undo ghost (tutorial.tsx), the second ring over
 * Auto and the un-dimmed scrim (MascotGuideOverlay), and the withheld Spot toast — and reusing them
 * gives this run all of that with no new branches. Renaming them would mean touching the Lumi voice
 * table (game/audio/tutorialVoice.ts), which is keyed by id, so the prefix stays and this comment
 * explains why. Nothing about the recorded voice leaks in: the spoken path is gated on
 * `presentation.showVisualDemo`, which is false for this profile.
 */
export const CLEAR_PATH_TUTORIAL_STEPS: TutorialStep[] = [
  // The grip comes first for every profile — the controls that follow assume two thumbs on the edges.
  {
    id: "hold-like-controller",
    targetId: "device",
    message: "Hold your device with both hands, like a game controller.",
    shortLabel: "Get comfortable",
    event: "grip_acknowledged",
  },
  {
    // ONE step where the composition had two. `drag-and-snap` is gone, and its EVENT is what
    // survives it: this step closes on `part_snapped`, not `part_picked_up`, so a player who lifts
    // the tabletop and puts it down again has not finished it.
    //
    // The wording is unchanged from the pick-up step it replaces, which only works because the card
    // STANDS ASIDE the moment a part is in the air — `long-press-part` is in tutorial.tsx's
    // `collapsedActionGuide` now, so the sentence is never left on screen telling the player to do
    // something they have already done. Without that, closing on the snap would have meant rewriting
    // this copy as well.
    id: "long-press-part",
    targetId: "partsTray",
    message: "Long-press a part card to pick it up.",
    shortLabel: "Place the tabletop",
    event: "part_snapped",
  },
  {
    // A BROWSE, not a change: `settings_browsed` fires when the panel is closed, by Done or by a tap
    // outside it (see GameSettings' onClosed in tutorial.tsx). No `settingsTutorialTarget` is
    // derived for this id, which is the point — the panel opens with nothing singled out, because
    // the step is telling the player where their settings live rather than asking them to commit to
    // one.
    id: "visual-settings",
    targetId: "settings",
    message:
      "You can change aesthetics and accessibility features in Settings.",
    event: "settings_browsed",
  },
  {
    // BACKWARDS FROM THE OTHER PROFILES, and correct here — see the note above about focusMode.
    // `focus_mode_toggled` fires on the FIRST toggle, so this closes when the player presses Focus
    // and the rest of the HUD appears. The second half of the sentence tells them how to get back
    // rather than gating on it: there is no "toggled twice" event.
    id: "hud-focus",
    targetId: "focus",
    message:
      "Press ‘Focus’ to show more screen controls; press again to simplify.",
    shortLabel: "Try Focus",
    event: "focus_mode_toggled",
  },
  {
    // ONE ROTATION AND ON, which is the difference between this and every other profile's joystick
    // step. Those wait on `underside_view_reached` — the player has to steer all the way under the
    // tabletop before the card lets go. This one waits on `joystick_moved`, which fires once the
    // stick has been held past 250ms and pushed past 0.15 (see handleStickMove in tutorial.tsx), so
    // it is a deliberate rotation rather than a twitch, and it is over as soon as the player has
    // demonstrated they can turn the view.
    //
    // Nothing is lost by not gating on the underside: the bolt step later cannot be completed
    // without getting there anyway, and by then the player has been taught the control. What IS
    // gained is that a player who cannot find the underside is not held on step 4 by a card that
    // never explains what it is still waiting for.
    id: "view-under-table",
    targetId: "joystick",
    message:
      "Use the joystick to rotate the view until you can see the highlighted areas clearly.",
    shortLabel: "Rotate the view",
    event: "joystick_moved",
  },
  {
    // A step to READ, not to perform. Undo and Recenter are the two controls a player wants when
    // something has gone wrong, which is the worst moment to be meeting them for the first time; but
    // making the tutorial demand an undo would force a player to break a build they are in the
    // middle of getting right. So it explains, rings both buttons, and closes on any tap.
    //
    // BEFORE the bolt, deliberately: everything after this point is fiddly, and a safety net is
    // worth having in hand before the fiddly part rather than after it.
    id: "visual-undo-recenter",
    targetId: "undoRecenter",
    message: 'Press "Undo" to go back, or "Recenter" to reset the view.',
    shortLabel: "Undo and Recenter",
    event: "controls_acknowledged",
  },
  {
    // Rings SPOT and AUTO — the two the copy names, and only those. The overlay draws a second ring
    // on the `auto` frame for this id; Focus sits between them in the row and stays unlit.
    //
    // READ-ONLY (`controls_acknowledged`): a tap anywhere closes it, and so does pressing either
    // button. Requiring a press would be worse than it sounds — Spot is a hint they may not need and
    // Auto skips a step they may want to do, so a step that demands one makes the player use a
    // crutch to be told the crutch exists. Auto also does not render outside __DEV__ or a showcase
    // build, so waiting on it would trap a real player forever; in a release build the second ring
    // simply does not appear and the card names one button that is there and one that is not.
    id: "visual-stuck-help",
    targetId: "spot",
    message:
      'If you feel stuck, press "Spot" for a visual hint, or "Auto" to skip a step.',
    shortLabel: "Spot and Auto",
    event: "controls_acknowledged",
  },
  {
    id: "place-connector",
    targetId: "partsTray",
    message: "Long-press a bolt, then place it into the highlighted hole.",
    shortLabel: "Insert the first bolt",
    event: "connector_placed",
  },
  {
    // LACK's bolt is hand-tightened: hardware.ts calls it "spun in by hand".
    id: "tighten-connector",
    targetId: "tool",
    message: "Turn clockwise to tighten the bolt by hand.",
    shortLabel: "Tighten the bolt",
    event: "connector_tightened",
  },
  {
    id: "install-four-legs",
    targetId: "partsTray",
    message: "Continue assembling.",
    shortLabel: "Install all four legs",
    event: "all_legs_installed",
  },
];

/**
 * FELIX's own run — the control profile, and the last of the four to leave the composition.
 *
 * WHY IT COULD NOT STAY COMPOSED. The composition emits opening → settings → shared HUD → assembly →
 * finish, in that order, from tables shared with momentum. This run needs the HUD controls split
 * across that boundary — Undo/Recenter, Focus and Spot BEFORE the joystick, Hint AFTER the tighten —
 * and it needs its own copy for steps momentum still reads verbatim. Every one of those is a change
 * that would have had to be expressed as a `when` clause on a shared row, which is how a table that
 * four profiles read ends up unreadable to all of them.
 *
 * MOMENTUM IS NOW THE ONLY COMPOSED PROFILE. The machinery below (`tutorialStepsFor`'s slicing, the
 * shared HUD filter, the contextual-hint splice) is kept for it and is deliberately untouched.
 *
 * WHAT CHANGED FROM THE COMPOSED VERSION, since none of it is visible by diffing lists:
 *   - `drag-and-snap` is gone, folded into the pick-up step's event, as in the other two hand-written
 *     runs.
 *   - `hud-recenter` and `hud-undo` — two steps, each demanding the player actually press the button
 *     — became ONE read-only card naming both. Demanding a real undo means asking a player to break
 *     a build they are in the middle of getting right, which is why the other runs stopped doing it.
 *   - The settings step BROWSES instead of requiring a backdrop change.
 *   - `hud-spot`, which required a Spot press, became the stuck-help card that names Spot and Auto
 *     and asks for neither.
 *   - `control-hint` keeps its own step but stops being spliced in after the tighten by
 *     `tutorialStepsFor`; it is simply where it is in this list.
 *   - The last step is `unnumbered` — see the field.
 *
 * SHARED IDS, as in Pebble's run above: the assembly ids drive tutorial.tsx's tray filter, and
 * `visual-settings` / `visual-undo-recenter` bring behaviour wired to those ids (the browse-close on
 * the settings panel, the two-pass undo ghost). `hud-stuck-help` is deliberately NOT the visual
 * one: this run needs the focus-return prompt on that step and Lumi's must not gain it.
 */
export const CONTROL_TUTORIAL_STEPS: TutorialStep[] = [
  // The grip comes first for every profile — the controls that follow assume two thumbs on the edges.
  {
    id: "hold-like-controller",
    targetId: "device",
    message: "Hold your device with both hands, like a game controller.",
    shortLabel: "Get comfortable",
    event: "grip_acknowledged",
  },
  {
    // Merged, and closing on the SNAP — same as Pebble's, and the card stands aside for the drag
    // (tutorial.tsx's collapsedActionGuide) so the pick-up wording is never left contradicting a
    // pick-up that already happened.
    id: "long-press-part",
    targetId: "partsTray",
    message: "Long-press a part card to pick it up.",
    shortLabel: "Place the tabletop",
    event: "part_snapped",
  },
  {
    // A BROWSE. It used to be `background-settings`, which advanced on `backdrop_changed` — the
    // player had to pick a different background to escape a card that never asked them to, and was
    // left with a backdrop they had not chosen.
    id: "visual-settings",
    targetId: "settings",
    message:
      "You can change aesthetics and accessibility features in Settings.",
    event: "settings_browsed",
  },
  {
    // TWO STEPS BECAME ONE, and it stopped demanding a press. `hud-recenter` waited on
    // `camera_recentered` and `hud-undo` on `step_undone` — the second of which asks the player to
    // undo work they just did correctly. Both buttons still close this card when pressed (see
    // handleTutorialUndo and the Recenter handler in tutorial.tsx), so a player who reaches for one
    // is not told to tap elsewhere; they simply no longer have to.
    //
    // The ghost runs TWICE here rather than looping, which comes from sharing the id: the scene
    // animation in tutorial.tsx keys its iteration count on `visual-undo-recenter`. A looping ghost
    // was still travelling when the tap moved the player on, so the scene slid under the next card.
    id: "visual-undo-recenter",
    targetId: "undoRecenter",
    message: 'Press "Undo" to go back, or "Recenter" to reset the view.',
    shortLabel: "Undo and Recenter",
    event: "controls_acknowledged",
  },
  {
    // `focus_mode_toggled` fires on the FIRST toggle, so this closes when Focus goes ON — and the
    // player is then inside focus mode with the HUD stripped down. That is what the follow-up prompt
    // on the NEXT step is for: `focusPreviewActive` in tutorial.tsx puts up "Tap Focus again to
    // return to the tutorial" and rings the chip, so nobody is left there.
    //
    // control does NOT pin focusMode (PROFILE_DEFAULTS leaves it false, as does DEFAULT_SETTINGS),
    // so this player starts outside focus mode and the sentence reads forwards — the opposite of
    // clearPath above, which is why the two say different things about the same button.
    id: "hud-focus",
    targetId: "focus",
    message: "Press ‘Focus’ to simplify the screen controls.",
    shortLabel: "Try Focus",
    event: "focus_mode_toggled",
  },
  {
    // SHARED WITH MOMENTUM, and NOT with Lumi — which is why it is `hud-stuck-help` and not
    // `visual-stuck-help`. Both this run and Sparky's toggle focus ON at the step before and need
    // the way back out, so both carry the focus-return prompt (see focusPreviewActive in
    // tutorial.tsx). Lumi's identically-worded step must not gain it: she also toggles focus on and
    // simply stays there, which her remaining steps all survive. Pebble reaches neither, since it
    // starts inside focus mode and its focus step turns focus OFF.
    //
    // The second ring over Auto and the un-dimmed scrim come from SECONDARY_TARGET_BY_STEP, which
    // lists this id and the visual one.
    //
    // READ-ONLY: a tap anywhere closes it, and so does pressing either button. Requiring a press
    // would make the player use a crutch to be told the crutch exists, and Auto does not render
    // outside __DEV__ or a showcase build, so waiting on it would trap a real player forever.
    id: "hud-stuck-help",
    targetId: "spot",
    message:
      'If you feel stuck, press "Spot" for a visual hint, or "Auto" to skip a step.',
    shortLabel: "Spot and Auto",
    event: "controls_acknowledged",
  },
  {
    // ONE ROTATION AND ON — `joystick_moved` rather than `underside_view_reached`, the same change
    // Pebble's run got. The stick has to be held past 250ms and pushed past 0.15 for it to fire, so
    // it is a deliberate rotation and not a twitch. Nothing is lost: the bolt step cannot be
    // completed without reaching the underside anyway.
    id: "view-under-table",
    targetId: "joystick",
    message:
      "Use the joystick to rotate the view until you can see the highlighted areas clearly.",
    shortLabel: "Rotate the view",
    event: "joystick_moved",
  },
  {
    id: "place-connector",
    targetId: "partsTray",
    message: "Long-press a bolt, then place it into the highlighted hole.",
    shortLabel: "Insert the first bolt",
    event: "connector_placed",
  },
  {
    // LACK's bolt is hand-tightened: hardware.ts calls it "spun in by hand".
    id: "tighten-connector",
    targetId: "tool",
    message: "Turn clockwise to tighten the bolt by hand.",
    shortLabel: "Tighten the bolt",
    event: "connector_tightened",
  },
  {
    // AFTER the first full bolt-and-tighten, which is the earliest moment the player has been
    // stuck at something real and could actually want a suggestion. It is the one step in this run
    // that still asks for a press: Hint is Control's own affordance, it costs nothing to try, and
    // unlike Spot and Auto it is not a crutch — it is the profile's answer to "what now".
    //
    // Rings the "?" button (hudControls.hintButton, beside the gear). It is rendered only in free
    // mode and outside focus mode, both of which hold here: control pins mode "free", and the player
    // came out of focus mode on the stuck-help step above.
    id: "control-hint",
    targetId: "hint",
    message: 'Press "Hint" if you need a tip for the next step.',
    shortLabel: "Try Hint",
    event: "hint_requested",
  },
  {
    id: "install-four-legs",
    targetId: "partsTray",
    message: "Continue assembling.",
    shortLabel: "Install all four legs",
    event: "all_legs_installed",
    unnumbered: true,
  },
];

/**
 * SPARKY's own run — the momentum profile, and the last one out of the composition.
 *
 * WITH THIS, NOTHING COMPOSES ANY MORE. `tutorialStepsFor` is a dispatch on profile and every table
 * it used to assemble from — TUTORIAL_STEPS, SHARED_HUD_TUTORIAL_STEPS, SETTINGS_TUTORIAL_STEPS —
 * is now read by nobody. They are left in place rather than deleted: the slicing below is still the
 * documented shape a fifth profile would arrive in, and TUTORIAL_VOICE_OVER_SCRIPT is derived from
 * TUTORIAL_STEPS for recording. Worth a deliberate clear-out later; not worth doing as a side effect
 * of a copy change.
 *
 * NEARLY FELIX'S RUN, with three differences and they are all the profile talking:
 *   - No Hint step. Momentum has no "?" button (it is gated on free mode; momentum pins guide), so
 *     a step ringing it would point at nothing.
 *   - The Focus sentence is about the NEXT PART rather than about the screen. Same control, but
 *     momentum's pitch is one short task at a time, and that is what focus mode buys here.
 *   - The last step IS numbered. Felix's is not, deliberately — this run keeps its "9/9" because
 *     Sparky's whole loop is visible progress, and a counter that resolves is part of that.
 */
export const MOMENTUM_TUTORIAL_STEPS: TutorialStep[] = [
  // The grip comes first for every profile — the controls that follow assume two thumbs on the edges.
  {
    id: "hold-like-controller",
    targetId: "device",
    message: "Hold your device with both hands, like a game controller.",
    shortLabel: "Get comfortable",
    event: "grip_acknowledged",
  },
  {
    // Merged, closing on the SNAP. The card stands aside for the drag (collapsedActionGuide), so the
    // pick-up wording is never left contradicting a pick-up that already happened.
    id: "long-press-part",
    targetId: "partsTray",
    message: "Long-press a part card to pick it up.",
    shortLabel: "Place the tabletop",
    event: "part_snapped",
  },
  {
    // A BROWSE, and it replaces TWO steps: `background-settings`, which forced a backdrop change to
    // escape a card that never asked for one, and `guided-instructions-settings` right behind it,
    // which made Settings the only subject the tutorial spent two consecutive cards on.
    id: "visual-settings",
    targetId: "settings",
    message:
      "You can change aesthetics and accessibility features in Settings.",
    event: "settings_browsed",
  },
  {
    // `hud-recenter` and `hud-undo` folded into one read-only card naming both, as in Felix's run.
    // The ghost runs twice rather than looping — that comes from sharing the id, which is what the
    // iteration count in tutorial.tsx keys on. It also drops the full-screen "UNDO PREVIEW" takeover
    // that `hud-undo` used to trigger, since that is wired to the id this step no longer uses.
    id: "visual-undo-recenter",
    targetId: "undoRecenter",
    message: 'Press "Undo" to go back, or "Recenter" to reset the view.',
    shortLabel: "Undo and Recenter",
    event: "controls_acknowledged",
  },
  {
    // ABOUT THE NEXT PART, not about the screen — the same control Felix's step names, pitched at
    // what this profile came for. Closes when Focus goes ON; the step after carries the way back
    // out (focusPreviewActive).
    id: "hud-focus",
    targetId: "focus",
    message: "Press ‘Focus’ to focus on the next part only.",
    shortLabel: "Try Focus",
    event: "focus_mode_toggled",
  },
  {
    // Shared with Felix — see the note on his copy of this step for why it is not Lumi's id.
    id: "hud-stuck-help",
    targetId: "spot",
    message:
      'If you feel stuck, press "Spot" for a visual hint, or "Auto" to skip a step.',
    shortLabel: "Spot and Auto",
    event: "controls_acknowledged",
  },
  {
    // ONE ROTATION AND ON — `joystick_moved`, not `underside_view_reached`.
    id: "view-under-table",
    targetId: "joystick",
    message:
      "Use the joystick to rotate the view until you can see the highlighted areas clearly.",
    shortLabel: "Rotate the view",
    event: "joystick_moved",
  },
  {
    id: "place-connector",
    targetId: "partsTray",
    message: "Long-press a bolt, then place it into the highlighted hole.",
    shortLabel: "Insert the first bolt",
    event: "connector_placed",
  },
  {
    // LACK's bolt is hand-tightened: hardware.ts calls it "spun in by hand".
    id: "tighten-connector",
    targetId: "tool",
    message: "Turn clockwise to tighten the bolt by hand.",
    shortLabel: "Tighten the bolt",
    event: "connector_tightened",
  },
  {
    // NUMBERED, unlike Felix's — see the header note.
    id: "install-four-legs",
    targetId: "partsTray",
    message: "Continue assembling.",
    shortLabel: "Install all four legs",
    event: "all_legs_installed",
  },
];

/**
 * The SECOND control a step rings, for the few steps whose copy names two.
 *
 * A step carries one `targetId`, which is the right shape for almost all of them — the card names a
 * control and the spotlight rings it. The stuck-help card names two, Spot and Auto, and they are not
 * adjacent: Focus sits between them in the toggles row, so one rectangle drawn around "the two the
 * copy names" would light Focus as well, and a step that says "press Spot or Auto" while marking
 * three buttons is worse than one that marks neither.
 *
 * A TABLE rather than a field on TutorialStep, because this is the only step in the app that needs
 * it and both lists that contain it share the id. If a third case ever appears, promote it.
 *
 * The measurement half matters as much as the drawing half: MascotGuideOverlay measures the CURRENT
 * step's target and nothing else, so before this table existed the second ring's code was live and
 * its frame was never populated — `frames['auto']` was permanently undefined and Lumi's step 8 rang
 * Spot alone, silently, exactly as if the feature had not been written.
 */
export const SECONDARY_TARGET_BY_STEP: Record<string, TutorialTargetId> = {
  "visual-stuck-help": "auto",
  "hud-stuck-help": "auto",
};

export const FUTURE_TUTORIAL_REQUIREMENTS = {
  saveProgress: "Future requirement — do not implement yet.",
  floatPushBack:
    "The Put back button now exists in BOTH play and the tutorial fork; this entry only tracks whether a dedicated tutorial step should teach it.",
} as const;

export const TUTORIAL_CONTENT_DECISIONS = {
  display:
    "Teach Background through the real Settings panel after the first placed part.",
  guidedInstructions:
    "Teach Standard/Simple as the primary choice and mention Show instructions.",
  sequencing:
    "Keep the opening to the core loop; teach preferences in a separate post-core walkthrough.",
} as const;

/** The step that teaches the two-handed grip — dropped on a tablet, kept everywhere else. */
export const GRIP_STEP_ID = "hold-like-controller";

export const tutorialStepsFor = (context: TutorialContext): TutorialStep[] => {
  const steps = composeTutorialSteps(context);
  // Filtered here rather than in each profile's list, because all five lists open with the grip step
  // and a `when` on each would be the same predicate written five times.
  return context.tablet ? steps.filter((s) => s.id !== GRIP_STEP_ID) : steps;
};

const composeTutorialSteps = (context: TutorialContext): TutorialStep[] => {
  // Lumi runs its own hand-written sequence — see VISUAL_TUTORIAL_STEPS. Returned whole rather than
  // composed, because its merged steps do not survive the slicing below.
  if (context.profile === "visual") return VISUAL_TUTORIAL_STEPS;
  // Pebble likewise — see CLEAR_PATH_TUTORIAL_STEPS. Same reason and one more: this run inverts the
  // Focus sentence, which is a per-profile fact about a step every profile shares, and the only
  // honest place for it is a list only this profile reads.
  if (context.profile === "clearPath") return CLEAR_PATH_TUTORIAL_STEPS;
  // Felix likewise — see CONTROL_TUTORIAL_STEPS.
  if (context.profile === "control") return CONTROL_TUTORIAL_STEPS;
  // …and Sparky, which empties the composition below of callers entirely. Everything from here down
  // is now unreachable; it is kept as the documented shape a fifth profile would arrive in, and
  // because TUTORIAL_VOICE_OVER_SCRIPT still derives the recording script from TUTORIAL_STEPS.
  if (context.profile === "momentum") return MOMENTUM_TUTORIAL_STEPS;

  const core = TUTORIAL_STEPS.filter(
    (step) => !step.when || step.when(context),
  );
  // Three, not two: the grip step precedes the first two touch steps, and the Settings
  // introduction still belongs after the tabletop has been PLACED, not merely picked up.
  const openingSteps = core.slice(0, 3);
  const remainingCore = core.slice(3);
  const finishingStep = remainingCore.at(-1);
  const assemblySteps = finishingStep
    ? remainingCore.slice(0, -1)
    : remainingCore;
  // MOMENTUM IS THE ONLY CALLER LEFT, so the two profile tests that used to live here are gone with
  // it: it takes the whole shared HUD run (the `control || momentum` test was always true for the
  // pair, and the other three now return above), and it never wanted the contextual Hint splice —
  // that was Control's, and Control authors its own Hint step in its own list now.
  //
  // The composition is otherwise untouched. It is still the shape a fifth profile would arrive in,
  // and collapsing it into momentum's literal sequence would throw that away for no gain.
  const sharedHudSteps = SHARED_HUD_TUTORIAL_STEPS;
  const settingsSteps = SETTINGS_TUTORIAL_STEPS.filter(
    (step) => !step.when || step.when(context),
  );

  // Introduce the real Settings panel once the tabletop is present, then return
  // to the profile-specific controls and the rest of the assembly sequence.
  return [
    ...openingSteps,
    ...settingsSteps,
    ...sharedHudSteps,
    ...assemblySteps,
    ...(finishingStep ? [finishingStep] : []),
  ];
};

export const settingsTutorialStepsFor = (
  _context: TutorialContext,
): TutorialStep[] =>
  // NONE FOR ANYONE, now that all four runs are hand-written and each teaches Settings as its own
  // step. This used to hand the background/instructions pair back AFTER the table was finished,
  // between the last leg and the reward — which is why finishing the build appeared to do nothing:
  // the tutorial was not over, it had moved into a settings phase the player had already been
  // through. On clearPath and momentum it was the identical two cards twice in one session.
  //
  // An empty list is the supported way to say "skip it": beginSettingsTutorial checks for exactly
  // that and goes straight to rewardReady. (Nothing calls beginSettingsTutorial today either, so
  // this is belt and braces — but it is the branch that would run if anything did.)
  [];

export function messageForToolStep(kind: ToolTutorialKind | null) {
  if (kind === "press")
    return "Tap the hand four times to press the part into place.";
  if (kind === "tap") return "Tap repeatedly to drive it in.";
  if (kind === "beat") return "Swipe up or down to continue.";
  return "Trace the circle clockwise to tighten the connector.";
}