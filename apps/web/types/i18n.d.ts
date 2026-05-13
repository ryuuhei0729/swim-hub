// next-intl global Messages type augmentation
// See: https://next-intl.dev/docs/workflows/typescript
type Messages = typeof import("../messages/ja.json");

declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface IntlMessages extends Messages {}
}

export {};
