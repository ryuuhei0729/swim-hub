// =============================================================================
// @/contexts/AuthProvider の自動モック (mobile)
// テストファイルで factory 無しの `vi.mock("@/contexts/AuthProvider")` を書くと vitest がこれを使う。
// 既定の useAuth() は buildAuthContext() (ログイン済み user-1・supabase は空オブジェクト)。
// 値を変えるときは factory を書き直さず、テスト側で
//   vi.mocked(useAuth).mockReturnValue(buildAuthContext({ supabase: fake }));
// とする (vitest.config の clearMocks は呼び出し履歴だけを消し、この返り値は保持する)。
// =============================================================================

import type { ReactNode } from "react";
import { vi } from "vitest";
import { buildAuthContext } from "@/__tests__/helpers/authContext";

// 既定値は 1 つの参照を返し続ける。呼ぶたびに新しいオブジェクトを作ると、本物の Provider では
// useMemo / state で安定している supabase や user の参照が render ごとに変わり、
// それらを依存に持つ effect が無限に走る。
const defaultAuth = buildAuthContext();

export const useAuth = vi.fn(() => defaultAuth);

export const AuthProvider = ({ children }: { children: ReactNode }) => children;
