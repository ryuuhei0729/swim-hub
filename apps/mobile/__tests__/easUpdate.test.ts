// =============================================================================
// easUpdate.test.ts
// =============================================================================
//
// EAS Update (OTA) の設定を検証する。
// - app.config.js: 素の eas update は EAS_BUILD_PLATFORM を設定せずに設定を評価する。そのとき
//   計算される runtimeVersion が、各プラットフォームのビルドに埋め込まれる値と一致すること
//   (一致しないとそのプラットフォームにアップデートが届かない)。
// - scripts/eas-update.js: プラットフォームごとに EAS_BUILD_PLATFORM を設定して公開し、
//   OTA の manifest の version がビルドと一致すること。公開先の channel・EAS の environment・
//   eas.json の env の決め方。
//
// ミューテーション確認方法:
// - app.config.js の ios/android.runtimeVersion を消して runtimeVersion: { policy: "appVersion" }
//   に替えると、runtimeVersion の android の1件が赤になる
// - buildUpdateCommand の env から EAS_BUILD_PLATFORM を消すと、version の android の1件と
//   buildUpdateCommand の2件が赤になる

import { Updates } from "expo/config-plugins";
import type { ExpoConfig } from "expo/config";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

import createConfig from "../app.config.js";
import appJson from "../app.json";
import easJson from "../eas.json";
import { buildUpdateCommand, parseArgs, resolveUpdateTarget } from "../scripts/eas-update.js";

const APP_ROOT = path.resolve(__dirname, "..");
const PLATFORMS = ["ios", "android"] as const;

function configWithBuildPlatform(platform: string | undefined): ExpoConfig {
  vi.stubEnv("EAS_BUILD_PLATFORM", platform);
  const config: ExpoConfig = createConfig({ config: structuredClone(appJson.expo) });
  return config;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("app.config.js の EAS Update 設定", () => {
  it.each(PLATFORMS)(
    "%s: 素の eas update 時の runtimeVersion がビルド時の値 (そのビルドの version) と一致する",
    async (platform) => {
      const buildConfig = configWithBuildPlatform(platform);
      const buildRuntime = await Updates.getRuntimeVersionNullableAsync(APP_ROOT, buildConfig, platform);
      const updateConfig = configWithBuildPlatform(undefined);
      const updateRuntime = await Updates.getRuntimeVersionNullableAsync(
        APP_ROOT,
        updateConfig,
        platform,
      );

      expect(buildRuntime).toBe(buildConfig.version);
      expect(updateRuntime).toBe(buildRuntime);
    },
  );

  it.each(PLATFORMS)(
    "%s: スクリプト経由の OTA の manifest の version がビルドの version と一致する",
    (platform) => {
      const target = resolveUpdateTarget(easJson, "production", platform);
      const { env } = buildUpdateCommand(target, platform, {}, []);
      expect(configWithBuildPlatform(env.EAS_BUILD_PLATFORM).version).toBe(
        configWithBuildPlatform(platform).version,
      );
    },
  );

  it("アップデートの取得先が EAS プロジェクトの URL になっている", () => {
    const config = configWithBuildPlatform(undefined);
    expect(config.updates?.url).toBe(
      `https://u.expo.dev/${appJson.expo.extra.eas.projectId}`,
    );
  });
});

describe("resolveUpdateTarget", () => {
  it.each(PLATFORMS)("production (%s): 本番ビルドと同じ channel・environment・env", (platform) => {
    expect(resolveUpdateTarget(easJson, "production", platform)).toEqual({
      channel: "production",
      environment: "production",
      env: easJson.build.production.env,
    });
  });

  it("preview: distribution を省略しているので、ビルドと同じく production の environment を使う", () => {
    expect(resolveUpdateTarget(easJson, "preview", "ios")).toEqual({
      channel: "preview",
      environment: "production",
      env: easJson.build.preview.env,
    });
  });

  it("extends 先の env を引き継ぎ、同じ名前は自分の値で上書きする", () => {
    const eas = {
      build: {
        base: { channel: "base", env: { A: "base", B: "base" } },
        child: { extends: "base", env: { B: "child" } },
      },
    };
    expect(resolveUpdateTarget(eas, "child", "ios")).toEqual({
      channel: "base",
      environment: "production",
      env: { A: "base", B: "child" },
    });
  });

  it("ios / android 配下の設定をそのプラットフォームだけに上書きする", () => {
    const eas = {
      build: {
        p: {
          channel: "c",
          distribution: "internal",
          env: { A: "1", B: "1" },
          ios: { distribution: "store", env: { A: "ios" } },
          android: { channel: "c-android" },
        },
      },
    };
    expect(resolveUpdateTarget(eas, "p", "ios")).toEqual({
      channel: "c",
      environment: "production",
      env: { A: "ios", B: "1" },
    });
    expect(resolveUpdateTarget(eas, "p", "android")).toEqual({
      channel: "c-android",
      environment: "preview",
      env: { A: "1", B: "1" },
    });
  });

  it.each([
    [{ channel: "c" }, "production"],
    [{ channel: "c", distribution: "store" }, "production"],
    [{ channel: "c", distribution: "internal" }, "preview"],
    [{ channel: "c", distribution: "internal", developmentClient: true }, "development"],
    [{ channel: "c", distribution: "internal", environment: "production" }, "production"],
  ])("environment をビルドと同じ規則で決める: %o → %s", (profile, environment) => {
    expect(resolveUpdateTarget({ build: { p: profile } }, "p", "ios").environment).toBe(environment);
  });

  it("channel の無いプロファイルや存在しないプロファイルは公開せずにエラーにする", () => {
    expect(() => resolveUpdateTarget(easJson, "development", "ios")).toThrow("channel がありません");
    expect(() => resolveUpdateTarget(easJson, "nope", "ios")).toThrow("build.nope がありません");
  });
});

describe("buildUpdateCommand", () => {
  const target = { channel: "production", environment: "production", env: { EXPO_PUBLIC_A: "eas.json" } };

  it("プラットフォームを指定して公開し、EAS_BUILD_PLATFORM をそのプラットフォームにする", () => {
    expect(buildUpdateCommand(target, "android", {}, ["--message", "m"])).toEqual({
      args: [
        "update",
        "--platform",
        "android",
        "--channel",
        "production",
        "--environment",
        "production",
        "--message",
        "m",
      ],
      env: { EXPO_PUBLIC_A: "eas.json", EAS_BUILD_PLATFORM: "android" },
    });
  });

  it("シェルの EXPO_PUBLIC_* はビルドに入らないので外し、それ以外の環境変数は残す", () => {
    const { env } = buildUpdateCommand(
      target,
      "ios",
      { PATH: "/bin", EXPO_PUBLIC_A: "shell", EXPO_PUBLIC_ONLY_IN_SHELL: "shell" },
      [],
    );
    expect(env).toEqual({ PATH: "/bin", EXPO_PUBLIC_A: "eas.json", EAS_BUILD_PLATFORM: "ios" });
  });
});

describe("parseArgs", () => {
  it("--platform が無ければ両方を公開し、残りの引数は eas update に渡す", () => {
    expect(parseArgs(["production", "--message", "m"])).toEqual({
      profileName: "production",
      platforms: ["ios", "android"],
      easArgs: ["--message", "m"],
    });
  });

  it("--platform があればそのプラットフォームだけを公開する", () => {
    expect(parseArgs(["production", "--message", "m", "--platform", "android"])).toEqual({
      profileName: "production",
      platforms: ["android"],
      easArgs: ["--message", "m"],
    });
  });

  it("--platform に ios / android 以外を渡すとエラーにする", () => {
    expect(() => parseArgs(["production", "--platform", "all"])).toThrow("--platform");
  });
});
