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
            "@apps/shared": "../shared",
          },
        },
      ],
      "react-native-reanimated/plugin",
    ],
  };
};
