# Modu-MobileApp

Summer Research Project

## Setup

1. Clone the repo and install dependencies:

```bash
   npm install
```

2. Get `google-services.json`:
   - Go to [console.firebase.google.com](https://console.firebase.google.com)
   - Open the **Modu** project
   - Project Settings → Your apps → Android app → Download `google-services.json`
   - Place it in the **root** of the project (same level as `package.json`)

3. Set up environment variables:
   - Copy `.env.example` to `.env`
   - Fill in the Supabase values (ask Nashwa for these)

4. Start the app:

```bash
   npx expo start
```

> `google-services.json` and `.env` are gitignored and must never be committed.
