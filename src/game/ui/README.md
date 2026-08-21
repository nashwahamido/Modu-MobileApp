# `src/game/ui`

Every screen-space surface for the ASSEMBLY side of the app, grouped by the job it does. If you are
adding a file here, the folder you cannot decide between is usually the answer to "when does the player
see this?"

| folder | what lives here | when the player sees it |
| --- | --- | --- |
| `system/` | The design system: `theme` (tokens), `slideUp` (the sheet motion), `Button`, `OverlaySheet`, `Icons`. | Everywhere. Nothing in here knows about a build. |
| `hud/` | The chrome around a build in progress: `hudChrome` (shared placements), the parts and cluster trays, the toolbar, the objective bar, the toggle chips, undo / finish / voice / recenter, the cluster focus dial. | While building. |
| `feedback/` | Transient reactions to one action: `HintToast`, `FitChip`, `GreenFlash`, `CenterDropRing`. | For a second, mid-build. |
| `celebration/` | "You finished something": `Confetti`, `ClusterCelebration`, `BuildComplete`. | At a milestone or the end of a build. |
| `settings/` | `SettingsPrimitives` (the row vocabulary — Stepper, Segmented, Row, ActionRow), `sections` (one component per section, plus the option tables), `SettingsControls` (the SHORT in-build composition) and `GameSettings` (the gear panel that hosts it). The tabbed `/settings` route composes the same sections into its General and Assembly tabs — that split is why the sections are their own file, and why a row is written once and shown twice. | On demand. |
| `loading/` | `LoadingScreen`, `LoadingOverlay`, and the `loadingProgress` milestone logic they share. | Between screens. |
| `backdrop/` | What sits BEHIND the build: `SceneBackdrop` and the `backdrops` table. Named `backdrop/` and not `scene/` on purpose — `src/game/scene` already exists and means the 3D layer. | Always, behind everything. |

## Two things worth knowing before you edit

**Read the conventions block at the top of `system/theme.ts` first.** It covers where styles live, which
of the two palettes to reach for, and why a text style that sets `fontWeight` without `fontFamily`
silently renders in the wrong font.

**`system/` is imported by everything else; nothing in `system/` imports back out.** That is the only
structural rule here, and it is worth taking literally. `ToggleChips` sat in `system/` for about ten
minutes before this rule caught it: it reads build settings and calls `suggestNext()`, so it was never a
primitive, and it now lives in `hud/`.

The one allowed inward reach is `theme.ts` reading the active `ThemeId` off the game store, so
`useTheme()` can resolve tokens. It knows the theme setting and nothing else.
