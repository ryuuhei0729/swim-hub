const { withAndroidManifest, AndroidConfig } = require("@expo/config-plugins");

/**
 * Android で expo-image-picker の launchCameraAsync(カメラ撮影)を使うための設定。
 *
 * expo-image-picker の config plugin は Android に CAMERA 権限を追加しない
 * (cameraPermission の文字列は iOS の NSCameraUsageDescription にのみ反映される)。
 * 一方 VideoUploader は撮影前に requestCameraPermissionsAsync() を呼ぶため、
 * CAMERA が未宣言だと Android では権限要求が即 denied になり撮影できない。
 * そのため CAMERA 権限を明示的に宣言する。
 *
 * あわせて uses-feature を required=false で宣言し、カメラ非搭載端末
 * (一部タブレット等)が Google Play の対応端末から除外されないようにする。
 */
const CAMERA_FEATURES = ["android.hardware.camera", "android.hardware.camera.autofocus"];

const withAndroidCamera = (config) => {
  config = AndroidConfig.Permissions.withPermissions(config, ["android.permission.CAMERA"]);

  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest["uses-feature"] = manifest["uses-feature"] || [];
    const features = manifest["uses-feature"];
    for (const name of CAMERA_FEATURES) {
      const exists = features.some((f) => f?.$?.["android:name"] === name);
      if (!exists) {
        features.push({ $: { "android:name": name, "android:required": "false" } });
      }
    }
    return cfg;
  });

  return config;
};

module.exports = withAndroidCamera;
