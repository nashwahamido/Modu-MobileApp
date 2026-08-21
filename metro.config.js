const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// ".tex" is PNG bytes under a non-image extension, and the extension is the whole point on ANDROID RELEASE.
// Metro sorts bundled assets by type: a png/jpg/webp becomes an aapt DRAWABLE RESOURCE, everything else is copied verbatim into res/raw. Image.resolveAssetSource then hands react-native-filament a bare resource name ("src_assets_textures_wood_grain"), and its loadAsset (FilamentProxy.java) looks in res/raw and then in assets/ — it never looks in drawable. So a .png fed to useBuffer resolves to nothing in a release APK, useBuffer catches the miss with a console.error, and the hook sits at undefined FOREVER. In debug the same require resolves to a Metro http URL, which is why it only ever broke in release.
// Only textures that reach FILAMENT need this. A texture drawn by <Image> stays .png — RN's own image loader is the half of the system that does understand a drawable resource.
config.resolver.assetExts.push("ktx", "glb", "filamat", "tex");

module.exports = config;
