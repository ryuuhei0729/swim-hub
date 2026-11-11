/**
 * アカウント画面 (/account) の詳細タブ。
 * URL の ?tab= で持ち、PC では右側の詳細に、SP では詳細画面として出す。
 */
export const ACCOUNT_TABS = ["plan", "calendar", "templates", "security"] as const;

export type AccountTab = (typeof ACCOUNT_TABS)[number];

/** PC で ?tab が無いときに右側へ出すタブ */
export const DEFAULT_ACCOUNT_TAB: AccountTab = "plan";

export function parseAccountTab(value: string | null | undefined): AccountTab | null {
  return ACCOUNT_TABS.find((tab) => tab === value) ?? null;
}

/** アカウント画面のパス (locale プレフィックスなし)。tab を渡すとその詳細を開く */
export function accountPath(tab?: AccountTab): string {
  return tab ? `/account?tab=${tab}` : "/account";
}
