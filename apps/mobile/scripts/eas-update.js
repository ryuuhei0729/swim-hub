/**
 * EAS Update (OTA) を、同じ名前のビルドプロファイルと同じ設定・環境変数で公開する。
 *
 *   pnpm ota:production --message "記録一覧の表示崩れを直す"
 *   pnpm ota:production --platform android --message "..."   (片方だけ公開し直すとき)
 *
 * eas update は次の点でビルドと違うので、ここで揃える。
 * - EAS_BUILD_PLATFORM を設定せずに app.config.js を評価する。Android だけ version を
 *   変えているため、そのままでは Android の OTA の manifest に iOS の version が入る
 *   (OTA 起動時の Constants.expoConfig.version が変わる)。プラットフォームごとに
 *   EAS_BUILD_PLATFORM を設定して別々に公開する。
 * - eas.json の build.<profile>.env を読まない。OTA の JS はこのマシンでバンドルされ、
 *   EXPO_PUBLIC_* はその時点の環境変数から埋め込まれるので、ここで渡す。シェルにある
 *   EXPO_PUBLIC_* はビルドには入らないので外す。
 *   --environment を付けると eas update が EAS の環境変数 (Plain text・Sensitive) を取得し、
 *   EXPO_NO_DOTENV=1 で .env* の読み込みを止める (.env.local のローカル接続先が混ざらない)。
 *
 * プロファイルの解決 (extends と ios/android 配下の上書き) と environment の決め方は
 * eas-cli 18.7.0 に合わせている (@expo/eas-json の build/build/resolver.js と
 * build/build/evaluateConfigWithEnvVarsAsync.js): environment 指定があればそれ、無ければ
 * distribution が store (省略時の既定) なら production、developmentClient なら development、
 * それ以外は preview。
 * ビルドは eas.json の env を EAS の環境変数より優先するが、eas update は逆になる。
 * 同じ名前の変数を両方に置かないこと。
 */
const { spawnSync } = require("child_process");
const path = require("path");

const PLATFORMS = ["ios", "android"];

function mergeProfiles(base, update) {
  const result = { ...base, ...update };
  if (base.env && update.env) {
    result.env = { ...base.env, ...update.env };
  }
  for (const platform of PLATFORMS) {
    if (base[platform] && update[platform]) {
      result[platform] = mergeProfiles(base[platform], update[platform]);
    }
  }
  return result;
}

function resolveProfile(build, name) {
  const profile = build[name];
  if (!profile) {
    throw new Error(`eas.json に build.${name} がありません`);
  }
  const { extends: baseName, ...rest } = profile;
  return baseName ? mergeProfiles(resolveProfile(build, baseName), rest) : rest;
}

function resolveEnvironment(profile) {
  if (profile.environment) {
    return profile.environment;
  }
  if ((profile.distribution ?? "store") === "store") {
    return "production";
  }
  return profile.developmentClient ? "development" : "preview";
}

function resolveUpdateTarget(easJson, profileName, platform) {
  const { ios, android, ...base } = resolveProfile(easJson.build, profileName);
  const profile = mergeProfiles(base, { ios, android }[platform] ?? {});
  if (!profile.channel) {
    throw new Error(`build.${profileName} に channel がありません (${platform})`);
  }
  return {
    channel: profile.channel,
    environment: resolveEnvironment(profile),
    env: profile.env ?? {},
  };
}

function buildUpdateCommand(target, platform, baseEnv, easArgs) {
  const env = Object.fromEntries(
    Object.entries(baseEnv).filter(([key]) => !key.startsWith("EXPO_PUBLIC_")),
  );
  return {
    args: [
      "update",
      "--platform",
      platform,
      "--channel",
      target.channel,
      "--environment",
      target.environment,
      ...easArgs,
    ],
    env: { ...env, ...target.env, EAS_BUILD_PLATFORM: platform },
  };
}

function parseArgs(argv) {
  const [profileName, ...rest] = argv;
  const platformIndex = rest.findIndex((arg) => arg === "--platform" || arg === "-p");
  if (platformIndex === -1) {
    return { profileName, platforms: PLATFORMS, easArgs: rest };
  }
  const platform = rest[platformIndex + 1];
  if (!PLATFORMS.includes(platform)) {
    throw new Error(`--platform は ${PLATFORMS.join(" か ")} を指定してください`);
  }
  const easArgs = rest.filter((_, i) => i !== platformIndex && i !== platformIndex + 1);
  return { profileName, platforms: [platform], easArgs };
}

function main() {
  const { profileName, platforms, easArgs } = parseArgs(process.argv.slice(2));
  if (!profileName) {
    console.error(
      "使い方: node scripts/eas-update.js <build profile> [--platform ios|android] [eas update の引数...]",
    );
    process.exit(1);
  }
  const mobileRoot = path.dirname(require.resolve("../eas.json"));
  const easJson = require("../eas.json");
  // 公開を始める前に、全プラットフォームの設定が解決できることを確かめる
  const targets = platforms.map((platform) => [platform, resolveUpdateTarget(easJson, profileName, platform)]);

  const published = [];
  for (const [platform, target] of targets) {
    console.log(
      `[${platform}] channel=${target.channel} environment=${target.environment} で公開します (eas.json の env: ${Object.keys(target.env).join(", ")})`,
    );
    const { args, env } = buildUpdateCommand(target, platform, process.env, easArgs);
    const result = spawnSync("eas", args, { cwd: mobileRoot, stdio: "inherit", env });
    if (result.error || result.status !== 0) {
      const hint =
        published.length === 0
          ? "何も公開していません。"
          : `${published.join(", ")} は公開済みです。--platform ${platform} を付けて再実行してください。`;
      console.error(`[${platform}] の公開に失敗しました。${hint}`);
      if (result.error) {
        throw result.error;
      }
      process.exit(result.status ?? 1);
    }
    published.push(platform);
  }
}

if (require.main === module) {
  main();
}

module.exports = { resolveUpdateTarget, buildUpdateCommand, parseArgs };
