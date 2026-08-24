# Room backdrops

Photos that sit behind the room diorama (Settings → Display → "Room background"). This folder is the room's own — the assembly screens' illustrated set lives in `../assemble/` and is not affected by anything you put here.

To add one:

1. Drop the image in this folder, e.g. `loft-light.png` (and optionally `loft-dark.png` for dark mode).
2. Add one entry to `src/room/ui/roomBackdrops.ts`:

```ts
{
  id: "loft",
  label: "Loft",
  light: require("../../assets/images/backdrops/room/loft-light.png"),
  dark: require("../../assets/images/backdrops/room/loft-dark.png"), // optional
},
```

The settings picker builds its options from that table, so the new photo appears with no other edits. `dark` is optional: without it the same photo is used in both themes.

Notes:

- The path inside `require()` must be a literal — Metro bundles images at build time and cannot glob a folder.
- **Aspect.** The app is landscape-locked, so a phone is around 2.17:1 and a tablet 1.6:1. `fit: "cover"` (the default) fills the screen and crops whatever does not fit — a 4:3 photo loses ~40% of its height that way. `fit: "contain"` shows all of it and lets the themed background show at the left and right edges. Exporting the photo at 16:9 or wider avoids the choice.
- The backdrop sits under a transparent 3D view, so the room itself hides the middle; keep the subject off-centre.
