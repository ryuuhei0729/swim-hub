// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname)

// Reactの解決をmobileアプリのnode_modulesに統一
config.resolver = {
  ...config.resolver,
  // mobileアプリのnode_modulesを優先的に解決
  nodeModulesPaths: [
    path.resolve(__dirname, 'node_modules'),
    path.resolve(__dirname, '../../node_modules'),
  ],
  // Reactを強制的にmobileアプリのnode_modulesから解決
  resolveRequest: (context, moduleName, platform) => {
    // ReactとReact DOMをmobileアプリのnode_modulesから解決
    if (moduleName === 'react' || moduleName === 'react-dom') {
      try {
        const reactPath = path.resolve(__dirname, 'node_modules', moduleName)
        return {
          filePath: require.resolve(reactPath),
          type: 'sourceFile',
        }
      } catch (e) {
        // フォールバック: デフォルトの解決を使用
      }
    }
    // デフォルトの解決を使用
    return context.resolveRequest(context, moduleName, platform)
  },
}

module.exports = config
