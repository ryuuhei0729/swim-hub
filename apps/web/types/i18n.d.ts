// next-intl Messages type augmentation
// See: https://next-intl.dev/docs/workflows/typescript
declare module "next-intl" {
  interface AppConfig {
    Messages: typeof import("../../shared/messages/ja.json");
  }
}

export {};
