module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          root: ["."],
          alias: {
            "@": ".",
            "@apps/shared": "../../packages/shared",
          },
        },
      ],
      "react-native-reanimated/plugin",
    ],
  };
};
