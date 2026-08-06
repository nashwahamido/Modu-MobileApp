# `src/game/input`

Every on-screen gesture surface for a build. Grouped by **the gesture the player performs**, because
that is also what decides which code a file shares — the four dial controls share one gauge, the pad
controls share one pad, and the track controls are next in line for the same treatment.

| folder | the gesture | files |
| --- | --- | --- |
| `camera/` | Move the VIEW, never the build. | `useOrbitCamera`, `Joystick` |
| `drag/` | Move a PART with a finger, plus the hit-testing that decides which part you grabbed. | `usePartDrag`, `stagedHit` |
| `dial/` | Turn a circular gauge: tighten a fastener, thread a cluster home, correct an orientation, lock a dowel. | `DialGauge` (the shared gauge + turn gesture), `TightenControl`, `ScrewControl`, `RotateControl`, `DrawTurnControl` |
| `pad/` | Tap a round pad repeatedly to drive something home. | `PressPad` (the shared pad), `PressControl`, `TapControl`, `InsertPressControl` |
| `slide/` | Drag a thumb along a track. | `SlideControl`, `SeatSlideControl`, `PushTestControl`, `HookPressControl`, `BeatControl` |

## The rule for two-phase controls

Three controls use one gesture then another, so the folder is **the gesture that COMMITS the action** —
the one the player is doing when the step completes:

- `DrawTurnControl` draws a dowel out on a slider, then locks it with the dial. It commits on the dial,
  so it lives in `dial/` and needs nothing from `slide/`.
- `HookPressControl` presses a panel onto its pins, then drags it along the slot to lock. It commits on
  the drag, so it lives in `slide/` and imports `PressPad` from `pad/`.
- `PushTestControl` taps a drawer's latch, then drags the drawer out and home. It commits on the drag, so
  it lives in `slide/` and imports `PressPad` from `pad/`.

Those two `PressPad` imports are the only cross-folder imports between control groups, and both are
inherent to the control rather than an accident of layout.

## What is shared, and what is deliberately not

`DialGauge` and `PressPad` own the LOOK and the FEEL — geometry, colours, the squash, the haptics, the
draw order. Each control keeps its own driver maths and its own store writes, because those genuinely
differ. If you find yourself copying a number or an easing between two controls in the same folder, it
belongs in that folder's shared file instead.

The differences that ARE real are options rather than copies: `bidirectional` (an orientation dial counts
a turn either way; a screw does not), `tickDeg` (how often it thumps), and `PressPad`'s `onPress` return
value (reject the tap, or override its weight).

## The colours a control may use

Track chrome — the border, the travelled fill, the thumb — is ALWAYS `CONTROL.fill` / `CONTROL.fillSoft`,
the app's interactive lavender. A track is something you press and drag, and lavender is what "you can
press this" looks like everywhere else in the app (see the three-accent rule in `ui/system/theme.ts`).

Four of the five slide controls used to draw their fill and thumb in green `#37c871` while
`SlideControl` and `DrawTurnControl` used the lavender, and `HookPressControl` managed both at once — a
lavender track border around a green thumb. That was drift, and it is now settled on lavender.

Green survives in exactly two places, and both are STATE rather than chrome:

- `usePartDrag`'s drop ring turns green when the part is `ready` to drop — "this will fit".
- `BeatControl`'s card turns green while that beat is `playing`.

Green means complete or valid; lavender means interactive. If you are colouring a control's own surface,
you want lavender. If you are signalling that something is now true, green may be right — though both of
those still use a raw hex rather than the theme's `success` token, which is a separate cleanup.
