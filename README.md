# MODU

**Furniture assembly, made calmer.**

MODU is a gamified 3D furniture assembly app for Android, designed around cognitive accessibility. It turns a flat-pack instruction booklet into a 3D build you hold in your hands: one step at a time, with a companion who guides you through it.

- **Website:** [modugamified.vercel.app](https://modugamified.vercel.app)
- **Project:** MSc Interactive Digital Media team project, Trinity College Dublin (2026)

## Features

- **Four guidance profiles.** Control, Visual, Momentum and Clear Path change how guidance works across the whole app, not just in a settings menu. An onboarding questionnaire recommends one, and players can switch at any time.
- **Guided 3D assembly.** Pick up parts, place them, then fasten them with dedicated controls. Includes undo, a "spot" hint, a project map for multi-stage builds, and celebrations as stages finish.
- **Companion voice and prompts.** Recorded voiceover for the tutorial and each assembly step, with speech synthesis as the fallback. Gentle prompts appear when a player has gone idle or keeps missing the same part.
- **Left-handed mode.** Mirrors the on-screen controls.
- **Four furniture models:** LACK, DALFRED, EKET and BEKVAM, each in several finishes.
- **Your room.** Place finished furniture in a 3D room, decorate it, and visit friends' rooms.
- **Progression.** Coins, XP, levels, a shop and an inventory. Prices and rewards are checked on the server.

## Tech stack

| Area | Tools |
| --- | --- |
| App | React Native 0.81, Expo SDK 54, Expo Router, TypeScript |
| 3D | react-native-filament, GLB models prepared with glTF Transform |
| State | Zustand |
| Animation and input | Reanimated, Gesture Handler, Lottie |
| Audio | expo-audio, expo-speech |
| Backend | Supabase (auth, Postgres database, storage) |
| Builds | EAS Build (development, preview and production profiles) |
| Tests | Node's test runner via `tsx` |

## Getting started

MODU uses native modules, including 3D rendering. That means it runs in a **development build**, not in Expo Go.

### Prerequisites

- Node.js (LTS) and Git
- An Android phone or tablet with a MODU development build installed, built with EAS (`eas build --profile development --platform android`)
- Access to the project's Supabase instance

### Setup

```bash
git clone https://github.com/nashwahamido/Modu-MobileApp.git
cd Modu-MobileApp
npm install          # also applies the patch in /patches
cp .env.example .env # then fill in the values
npm start            # starts Metro; open the dev build on your device
```

`.env.example` documents every variable. Its comments explain which values are safe to ship in a release build and which must never be set for one. Please read them before building. `.env` is gitignored and must never be committed.

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase project (required) |
| `EXPO_PUBLIC_DATA_BACKEND` | `supabase` for the live backend; any other value uses in-memory test data |
| `EXPO_PUBLIC_SHOWCASE` | `1` enables the showcase demo accounts (demo builds only) |
| `EXPO_PUBLIC_DEV_*`, `EXPO_PUBLIC_SHOWCASE_*` | Development and demo account rosters. Never set these for production. |
| `SUPABASE_SERVICE_ROLE_KEY` | Used by node scripts only. Never bundled. |

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Start the Metro bundler |
| `npm run android` | Build and run on a connected Android device |
| `npm test` | Run the test suite |
| `npm run typecheck` | TypeScript check |
| `npm run build:room` | Rebuild and verify the room model |
| `npm run compress:furniture` | Compress furniture GLB files |
| `npm run upload:assembly` | Upload assembly content to Supabase |
| `npm run fix:hardware-materials` | Keep metal hardware materials correct in the style variants |

## Project structure

```
src/
├── app/            routes (Expo Router): onboarding, home, game, presentation, social, dev
├── game/           assembly engine
│   ├── core/       model, evaluation, geometry and presentation logic (no React)
│   ├── content/    furniture data: LACK, DALFRED, EKET, BEKVAM
│   ├── scene/      3D rendering and shaders
│   ├── input/      drag, pick and camera input
│   ├── tutorial/   tutorial steps and voice
│   ├── audio/      sound effects, music and step voice
│   └── ui/         HUD, coaches and design system (theme tokens, shared components)
├── room/           room decoration: placement grid, input, scene, UI
├── onboarding/     questionnaire, avatar and mode recommendation, voice assets
├── data/           data layer: in-memory and Supabase adapters behind one interface
├── shop/, inventory/
├── components/, hooks/, services/, config/
├── dev/            development and showcase tools
└── assets/         models, textures, audio, fonts, UI art
scripts/            asset pipeline (GLB compression, room build, uploads)
patches/            patch-package fix for react-native-filament
```

Screens import data through `src/data`, never from Supabase directly. This keeps the in-memory adapter usable for tests and offline work.

## Tests

```bash
npm test
```

The suite covers the pure logic: assembly rules, the instruction simulator across every furniture model and mode, room placement, camera and picking maths, and voice asset mapping. Rendering is tested by hand on physical devices (a Samsung Galaxy S22 Ultra and a Lenovo Tab M10).

## Builds

`eas.json` defines three profiles:

- **development:** a dev client for internal testing.
- **preview:** an internal Android APK with the showcase demo enabled.
- **production:** a store build with auto-incremented versions.

## 3D models

Furniture models are based on the [IKEA 3D Assembly Dataset](https://github.com/IKEA/IKEA3DAssemblyDataset) (CC BY-NC-SA 4.0), renamed and prepared in Blender, then compressed with the scripts in `/scripts`.

## Team

Built by Astrid Yin, Emma Sun, Ge You, Krystyna Mikava, Nashwa Hamido and Sherin Glady, as an MSc Interactive Digital Media project at Trinity College Dublin, supervised by Prof. John Dingliana.

Nashwa Hamido was project manager and full-stack developer.

---

MODU, its name, artwork and design are the property of the MODU team. Furniture names are used only to describe the pieces modelled; MODU is not affiliated with IKEA. All rights reserved.
