import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Prebuild names the project after expo.name stripped of non-alphanumerics, so it is "Modu" on v1 and "Modu20" on v2 — find it rather than hardcoding either.
function appProjectPbxproj() {
  const iosDir = path.join(root, "ios");
  if (!fs.existsSync(iosDir)) return path.join(iosDir, "App.xcodeproj/project.pbxproj");
  const proj = fs.readdirSync(iosDir).find((entry) => entry.endsWith(".xcodeproj"));
  return path.join(iosDir, proj ?? "App.xcodeproj", "project.pbxproj");
}

const replacements = [
  {
    file: path.join(root, "node_modules/expo-constants/scripts/get-app-config-ios.sh"),
    from: "PROJECT_DIR_BASENAME=$(basename $PROJECT_DIR)",
    to: 'PROJECT_DIR_BASENAME=$(basename "$PROJECT_DIR")',
  },
  {
    file: path.join(root, "ios/Pods/Pods.xcodeproj/project.pbxproj"),
    from: 'shellScript = "bash -l -c \"$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh\"";',
    to: 'shellScript = "bash -l \"$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh\"";',
  },
  {
    file: appProjectPbxproj(),
    from: '`\\"$NODE_BINARY\\" --print \\"require(\'path\').dirname(require.resolve(\'react-native/package.json\')) + \'/scripts/react-native-xcode.sh\'\\"`',
    to: 'REACT_NATIVE_XCODE_SCRIPT=\\"$(\\"$NODE_BINARY\\" --print \\"require(\'path\').dirname(require.resolve(\'react-native/package.json\')) + \'/scripts/react-native-xcode.sh\'\\")\\"\\n/bin/sh \\"$REACT_NATIVE_XCODE_SCRIPT\\"',
  },
];

for (const replacement of replacements) {
  if (!fs.existsSync(replacement.file)) {
    console.log(`Skipped missing file: ${path.relative(root, replacement.file)}`);
    continue;
  }

  const original = fs.readFileSync(replacement.file, "utf8");
  const fixed = original.replace(replacement.from, replacement.to);

  if (fixed === original) {
    console.log(`Already ok: ${path.relative(root, replacement.file)}`);
    continue;
  }

  fs.writeFileSync(replacement.file, fixed);
  console.log(`Fixed: ${path.relative(root, replacement.file)}`);
}
