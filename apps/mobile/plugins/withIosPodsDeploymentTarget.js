const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("@expo/config-plugins");

/**
 * Pods の全ターゲットの IPHONEOS_DEPLOYMENT_TARGET を 15.1 以上に揃える config plugin。
 *
 * Xcode 27 (iPhoneOS 27.2 SDK) は deployment target が 15.0 未満のターゲットを警告ではなく
 * エラーにし、ローカルの eas build --local が ARCHIVE FAILED で止まる (2026-11-27)。
 * 引っかかるのは CocoaPods が作るリソースバンドルのターゲット (RNCAsyncStorage_resources,
 * SDWebImage-SDWebImage など) で、Podfile の `platform :ios` が反映されず podspec の古い値のまま残る。
 * ios/ は CNG で再生成されるため Podfile 直編集ではなくこの plugin で post_install に足す。
 */
const MIN_TARGET = "15.1";
const MARKER = "# withIosPodsDeploymentTarget";
const SNIPPET = `
    ${MARKER}
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |bc|
        if bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f < ${MIN_TARGET}
          bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${MIN_TARGET}'
        end
      end
    end`;

module.exports = function withIosPodsDeploymentTarget(config) {
  return withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, "Podfile");
      const contents = fs.readFileSync(podfilePath, "utf8");
      if (contents.includes(MARKER)) {
        return cfg; // 既に適用済み(冪等)
      }

      // react_native_post_install(...) の呼び出しの直後に足す (RN 側の設定を上書きできるように)
      const rnPostInstall = /(react_native_post_install\([\s\S]*?\n\s*\))/;
      if (!rnPostInstall.test(contents)) {
        throw new Error(
          "withIosPodsDeploymentTarget: Podfile に react_native_post_install(...) が見つかりません",
        );
      }
      fs.writeFileSync(podfilePath, contents.replace(rnPostInstall, `$1\n${SNIPPET}`));
      return cfg;
    },
  ]);
};
