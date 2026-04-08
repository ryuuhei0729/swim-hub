// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// pnpm monorepo: watch the entire monorepo root (keep defaults + add monorepo root)
config.watchFolders = [...(config.watchFolders || []), monorepoRoot];

// React の重複インスタンスを防ぐため、単一パスに強制解決するモジュール一覧
const resolveToMonorepo = {
  react: path.resolve(monorepoRoot, "node_modules/react"),
  "react-native": path.resolve(monorepoRoot, "node_modules/react-native"),
};

// @apps/shared エイリアスの実パス
const sharedRoot = path.resolve(projectRoot, "../shared");

config.resolver = {
  ...config.resolver,
  nodeModulesPaths: [
    path.resolve(projectRoot, "node_modules"),
    path.resolve(monorepoRoot, "node_modules"),
  ],
  extraNodeModules: {
    "@apps/shared": sharedRoot,
    ...resolveToMonorepo,
  },
  // extraNodeModules はフォールバックなので、resolveRequest で強制的に解決先を上書きする
  resolveRequest: (context, moduleName, platform) => {
    // @apps/shared/* を実パスに解決
    if (moduleName.startsWith("@apps/shared/")) {
      const subPath = moduleName.replace("@apps/shared/", "");
      return context.resolveRequest(
        context,
        path.resolve(sharedRoot, subPath),
        platform,
      );
    }
    if (moduleName === "@apps/shared") {
      return context.resolveRequest(context, sharedRoot, platform);
    }
    if (resolveToMonorepo[moduleName]) {
      return {
        filePath: require.resolve(moduleName, {
          paths: [monorepoRoot],
        }),
        type: "sourceFile",
      };
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = config;
