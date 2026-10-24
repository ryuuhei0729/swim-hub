// =============================================================================
// @apps/shared/hooks/queries/goalTargets の自動モック (web / mobile 共通)
// テストファイルで factory 無しの `vi.mock("@apps/shared/hooks/queries/goalTargets")` を書くと vitest がこれを使う。
// 既定の useGoalTargetsQuery は「目標なし・取得済み」。本人の目標バッジが関心外の画面テスト用で、
// QueryClientProvider を持たないテストで useQuery が落ちるのも避けられる。
// 目標を返したいテストは vi.mocked(useGoalTargetsQuery).mockReturnValue(...) で差し替える。
// =============================================================================

import { vi } from "vitest";

export const useGoalTargetsQuery = vi.fn(() => ({ data: [], isError: false, isPending: false }));
