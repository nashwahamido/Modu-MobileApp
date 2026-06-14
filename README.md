# Modu-MobileApp

A gamified mobile app that makes furniture assembly less stressful and more enjoyable, with a focus on cognitive accessibility. Built with React Native, Expo, and React Three Fiber.

Summer Research Project — MSc Interactive Digital Media, University of Dublin

## Tech Stack

- **Platform:** React Native + Expo (SDK 54)
- **3D Rendering:** Three.js + React Three Fiber
- **State Management:** Zustand
- **Backend:** Supabase (Auth, Database, Storage)
- **Language:** TypeScript

## Team Setup

### One-time installs (on your computer)

- [Node.js](https://nodejs.org) (LTS version recommended)
- [VS Code](https://code.visualstudio.com)
- [Git](https://git-scm.com)
- Expo Go on your Android phone (Play Store)

### Getting started

1. Clone the repo:
   ```bash
   git clone https://github.com/nashwahamido/Modu-MobileApp.git
   cd Modu-MobileApp
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   - Copy `.env.example` to `.env`
   - Fill in the Supabase values (ask Nashwa for these)

4. Start the app:
   ```bash
   npx expo start
   ```

5. Scan the QR code with Expo Go on your Android phone (phone and computer must be on the same WiFi network)

> `.env` is gitignored and must never be committed. See the `.env.example` file for the required variables.

## Project Structure

```
Modu-MobileApp/
├── App.tsx                    # Entry point
├── src/
│   ├── config/
│   │   ├── supabase.ts        # Supabase client
│   │   └── models.ts          # 3D model URLs (Supabase Storage)
│   ├── hooks/
│   │   └── useAuth.ts         # Auth state hook
│   └── services/
│       └── auth.ts            # Sign up, sign in, sign out
├── app.json                   # Expo config
├── package.json
├── .env.example               # Template for environment variables
└── .gitignore
```

## 3D Models

Furniture models are stored in Supabase Storage (not bundled with the app). Currently available:

- LACK side table (from IKEA 3D Assembly Dataset, CC BY-NC-SA 4.0)

Models are loaded at runtime via public URLs. To add a new model, upload the `.glb` file to the `models` bucket in Supabase Storage and add its reference in `src/config/models.ts`.

## Contributing

1. Create a feature branch from `main`
2. Make your changes
3. Push and open a pull request
4. Never commit `.env`, API keys, or large binary files (`.glb`, `.obj`)