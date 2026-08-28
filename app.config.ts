import type { ExpoConfig } from "expo/config";

// APP_VARIANT=v2 builds a side-by-side install with its own bundle id.
const isV2 = process.env.APP_VARIANT === "v2";

const config: ExpoConfig = {
  name: isV2 ? "Modu 2.0" : "Modu",
  slug: "modu",
  scheme: isV2 ? "modu2" : "modu",
  version: "1.0.0",
  orientation: "landscape",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  // v2 wears the inverted mark (dark logo on cream) so the two installs read apart at a glance.
  icon: isV2
    ? "./src/assets/ui/icons/Modu_Dark.png"
    : "./src/assets/ui/icons/Modu_Icon.png",
  android: {
    package: isV2 ? "com.modu.app.v2" : "com.modu.app",
    adaptiveIcon: {
      foregroundImage: isV2
        ? "./src/assets/ui/icons/Modu_Icon_Foreground_Dark.png"
        : "./src/assets/ui/icons/Modu_Icon_Foreground.png",
      backgroundColor: isV2 ? "#F3ECE0" : "#595551",
      monochromeImage: "./src/assets/ui/icons/Modu_Icon_Monochrome.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    permissions: [
      "android.permission.RECORD_AUDIO",
      "android.permission.MODIFY_AUDIO_SETTINGS",
    ],
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: isV2 ? "com.modu.app.v2" : "com.modu.app",
    appleTeamId: "373HG67P3T",
    requireFullScreen: true,
    infoPlist: {
      "UISupportedInterfaceOrientations~ipad": [
        "UIInterfaceOrientationLandscapeLeft",
        "UIInterfaceOrientationLandscapeRight",
      ],
    },
  },
  plugins: [
    "expo-router",
    "expo-audio",
    "expo-asset",
    [
      "expo-font",
      {
        android: {
          fonts: [
            {
              fontFamily: "Lexend",
              fontDefinitions: [
                { path: "./src/assets/fonts/Lexend-Regular.ttf", weight: 400 },
                { path: "./src/assets/fonts/Lexend-Medium.ttf", weight: 500 },
                { path: "./src/assets/fonts/Lexend-SemiBold.ttf", weight: 600 },
                { path: "./src/assets/fonts/Lexend-Bold.ttf", weight: 700 },
                { path: "./src/assets/fonts/Lexend-ExtraBold.ttf", weight: 800 },
                { path: "./src/assets/fonts/Lexend-Black.ttf", weight: 900 },
              ],
            },
          ],
        },
        ios: {
          fonts: [
            "./src/assets/fonts/Lexend-Regular.ttf",
            "./src/assets/fonts/Lexend-Medium.ttf",
            "./src/assets/fonts/Lexend-SemiBold.ttf",
            "./src/assets/fonts/Lexend-Bold.ttf",
            "./src/assets/fonts/Lexend-ExtraBold.ttf",
            "./src/assets/fonts/Lexend-Black.ttf",
          ],
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    router: {},
    eas: {
      projectId: "ac5a6dfb-7e96-4602-8cb9-3ae1cdec0817",
    },
  },
};

export default config;
