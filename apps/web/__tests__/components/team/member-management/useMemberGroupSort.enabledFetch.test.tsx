/**
 * useMemberGroupSort — enabled 引数による遅延フェッチ制御 [WV-22/WV-23, 修正H]
 *
 * Sprint Contract 検証観点:
 *   `MemberSelectModal` は開閉を繰り返す UI であり、素朴に `useMemberGroupSort` を
 *   埋め込むと開くたびに (あるいは背景の再レンダリングのたびに) `TeamGroupsAPI.list()` /
 *   `listAllMemberships()` への不要なリクエストが発生しうる。修正H は第3引数
 *   `enabled` (既定 true) を追加し、`enabled=false` の間はフェッチを行わず、
 *   一度フェッチに成功した teamId/supabase の組は `enabled` の再トグルだけでは
 *   再フェッチしない (`loadedKeyRef`)。
 *
 *   [WV-22] MemberSelectModal 側の使い方 (isOpen を enabled として渡す) を pin する:
 *     - isOpen=false の間はフェッチされない
 *     - isOpen=true になるとフェッチされる
 *     - 一度閉じて再度開いても再フェッチしない
 *   [WV-23] 既存呼び出し元 (TeamMemberManagement は enabled 引数を渡さない) の
 *     回帰防止: 引数を渡さない場合は既定 true が効き、従来どおりマウント時に
 *     即フェッチすること
 *
 * モック方針: TeamGroupsAPI を丸ごとモックし、list/listAllMemberships の呼び出し
 * 回数のみを検証する (グルーピングロジック自体は既存のロジックテストの対象外)。
 */
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import type { SupabaseClient } from "@supabase/supabase-js";
import jaMessages from "@apps/shared/messages/ja.json";
import { useMemberGroupSort } from "../../../../components/team/member-management/hooks/useMemberGroupSort";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  listAllMemberships: vi.fn(),
}));

vi.mock("@apps/shared/api/teams/groups", () => ({
  TeamGroupsAPI: vi.fn().mockImplementation(() => ({
    list: mocks.list,
    listAllMemberships: mocks.listAllMemberships,
  })),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="ja" messages={jaMessages as unknown as AbstractIntlMessages}>
    {children}
  </NextIntlClientProvider>
);

const dummySupabase = {} as unknown as SupabaseClient;

describe("useMemberGroupSort — enabled 引数 [WV-22, WV-23, 修正H]", () => {
  beforeEach(() => {
    mocks.list.mockReset().mockResolvedValue([]);
    mocks.listAllMemberships.mockReset().mockResolvedValue([]);
  });

  it(
    "[WV-22] enabled=false の間は TeamGroupsAPI.list()/listAllMemberships() が" +
      "呼ばれない（人間の意図: MemberSelectModal が isOpen=false の間、一度も開かれて" +
      "いないモーダルのためにネットワークリクエストを発生させないこと）",
    () => {
      renderHook(({ enabled }) => useMemberGroupSort("team-1", dummySupabase, enabled), {
        wrapper,
        initialProps: { enabled: false },
      });

      expect(mocks.list).not.toHaveBeenCalled();
      expect(mocks.listAllMemberships).not.toHaveBeenCalled();
    },
  );

  it(
    "[WV-22] enabled が false→true になった時点でフェッチされる（人間の意図: " +
      "モーダルを開いた瞬間にグルーピング情報の取得が始まること）",
    () => {
      const { rerender } = renderHook(
        ({ enabled }) => useMemberGroupSort("team-1", dummySupabase, enabled),
        { wrapper, initialProps: { enabled: false } },
      );
      expect(mocks.list).not.toHaveBeenCalled();

      rerender({ enabled: true });

      expect(mocks.list).toHaveBeenCalledTimes(1);
      expect(mocks.listAllMemberships).toHaveBeenCalledTimes(1);
    },
  );

  it(
    "[WV-22] 一度開いて閉じて再度開いても再フェッチしない（人間の意図: loadedKeyRef が" +
      "teamId/supabase の組を覚えており、同じチームに対しては取得済みデータを使い回す。" +
      "モーダルを何度も開閉するたびに毎回リクエストが飛ぶのは無駄なので、この使い回しが" +
      "実際に機能していることを固定する）",
    () => {
      const { rerender } = renderHook(
        ({ enabled }) => useMemberGroupSort("team-1", dummySupabase, enabled),
        { wrapper, initialProps: { enabled: false } },
      );

      rerender({ enabled: true }); // 1回目オープン
      expect(mocks.list).toHaveBeenCalledTimes(1);

      rerender({ enabled: false }); // クローズ
      rerender({ enabled: true }); // 2回目オープン (再フェッチしないはず)

      expect(mocks.list).toHaveBeenCalledTimes(1);
      expect(mocks.listAllMemberships).toHaveBeenCalledTimes(1);
    },
  );

  it(
    "[WV-23] enabled 引数を渡さない呼び出し元 (TeamMemberManagement 相当) は" +
      "従来どおりマウント時に即フェッチする（人間の意図: 修正Hの回帰防止。" +
      "既定値 true が効かず無関係な画面のグルーピング取得が静かに壊れることを防ぐ）",
    () => {
      renderHook(() => useMemberGroupSort("team-1", dummySupabase), { wrapper });

      expect(mocks.list).toHaveBeenCalledTimes(1);
      expect(mocks.listAllMemberships).toHaveBeenCalledTimes(1);
    },
  );
});
