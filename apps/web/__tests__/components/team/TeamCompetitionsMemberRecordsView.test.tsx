/**
 * TeamCompetitions (web) — 利用者ビュー (isAdmin=false) でも大会カードから
 * 他選手の記録一覧を閲覧できるようにする Sprint Contract (Phase A2 / web)
 *
 * ---------------------------------------------------------------------
 * PM 実測済みグラウンドトゥルース (このファイルではこれを前提とする):
 *   - ゲートは4箇所: L819 canViewRecords / L907 記録情報ブロック /
 *     L1122 モーダル描画 isAdmin ガード / L837 aria-label ハードコード日本語
 *   - RLS は role 非依存 (mobile Phase A で確認済み)。migration 不要
 *   - 実装方針 (PM 判定済み):
 *       1. canViewRecords = hasRecords (isAdmin を落とす。hasRecords は維持)
 *          → 既存の残差異として「記録0件のカードは admin/非admin ともタップ不可」
 *            (mobile は0件でもタップ可) がそのまま残る。これは今回持ち込む差異ではない
 *       2. L1122 の isAdmin && を落とす
 *       3. L907 の記録情報ブロックを全ユーザーに露出させる
 *       4. 3のブロック内 (登録記録:{count}件/タップで詳細/登録記録なし/追加可能) と
 *          L837 aria-label のハードコード日本語4+1箇所を i18n 化する
 *          (新規キーの実装は Web Developer 担当。QA はキー存在を検証するのみ)
 *
 * Verification Checklist マッピング:
 *   [V-W1]  非admin: hasRecords=true のカードをクリックすると記録一覧モーダルが開く
 *   [V-W2]  非admin: 同カードで Enter/Space キー操作でもモーダルが開く (L828 onKeyDown)
 *   [V-W3]  非admin: hasRecords=false のカードはクリックしてもモーダルが開かない
 *           (web/mobile の既知の残差異。今回のスコープ外だが回帰させないことを保証する)
 *   [V-W4]  非admin でモーダルを開いても、編集/削除ボタン・エントリー代理入力ボタン・
 *           記録入力ボタン (admin 専用 UI) が新たに露出しない
 *   [V-W5]  非admin にも「記録情報」ブロック (登録記録件数/タップで詳細、または
 *           登録記録なし/追加可能) が新規 i18n キー経由で表示される
 *   [V-W6]  admin の既存挙動 (hasRecords=true でカードクリック→モーダル、
 *           hasRecords=false でクリック不可) に回帰が無い
 *   [V-W7]  L933-937 の「エントリー: {n}件」は本スプリントの対象外
 *           (元から isAdmin ガードの外にあり、既に全ユーザーに日本語ハードコードで
 *           表示されている既存バグ。PM が別途報告する。ここでは非退行のみ確認する)
 *
 * トートロジー防止方針:
 *   - aria-label の期待値は ja.json から実際の値を都度読み取って比較する
 *     (ハードコード文字列を決め打ちで pin しない。新規キー未実装の間はこの読み取り自体が
 *     throw し、テストは意図的に赤くなる)。
 *   - モーダルはスタブ化して props (isOpen/competitionId/competitionTitle) を
 *     recordsModalSpy で検証する。「role=button の要素が存在する」だけでは
 *     判定にしない (disabled 相当でも DOM が描画されるケースの罠を避ける)。
 */

import React from "react";
import { renderWithI18n as render, screen } from "../../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import jaMessages from "@apps/shared/messages/ja.json";

function resolveJaKey(key: string): string {
  const parts = key.split(".");
  let cur: unknown = jaMessages;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      throw new Error(`ja.json に ${key} が存在しない (未実装の新規キー)`);
    }
  }
  if (typeof cur !== "string") throw new Error(`ja.json の ${key} は文字列ではない`);
  return cur;
}

function interpolateJa(key: string, values: Record<string, string | number>): string {
  const template = resolveJaKey(key);
  return template.replace(/\{(\w+)\}/g, (_m, name) => String(values[name] ?? `{${name}}`));
}

const mocks = vi.hoisted(() => ({
  recordsModalSpy: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@apps/shared/api/teams/records", () => ({
  TeamRecordsAPI: vi.fn().mockImplementation(() => ({
    update: vi.fn(),
    remove: vi.fn(),
    create: vi.fn(),
  })),
}));

// モーダルは props を記録するだけのスタブに差し替える (mobile Phase A と同じ方式)。
vi.mock("../../../components/team/TeamCompetitionRecordsModal", () => ({
  default: (props: Record<string, unknown>) => {
    mocks.recordsModalSpy(props);
    if (!props.isOpen) return null;
    return <div data-testid="records-modal-open">RECORDS_MODAL_OPEN</div>;
  },
}));

vi.mock("../../../components/team/TeamCompetitionEntryModal", () => ({
  default: () => null,
}));

vi.mock("@/components/forms/CompetitionBasicForm", () => ({
  default: () => null,
}));

// entries は空配列リテラルのままだと TS が `never[]` に推論し、V-W7 の
// `{ ...NO_RECORDS_ROW, entries: [...] }` (要素あり配列で上書き) と型が衝突する
// (TS2322)。`as any` / `@ts-expect-error` で黙らせず、要素の形を明示した配列型を
// 注釈することで空配列側の推論を正しく広げる。
type FixtureEntry = {
  id: string;
  user_id: string;
  style_id: number;
  entry_time: number | null;
};

const WITH_RECORDS_ROW = {
  id: "competition-with-records",
  user_id: "member-1",
  team_id: "team-1",
  title: "記録あり大会",
  date: "2026-08-01",
  place: "県営プール",
  entry_status: "before",
  note: null,
  created_at: "2026-07-20T00:00:00Z",
  created_by: "member-1",
  users: { name: "選手A" },
  created_by_user: null,
  records: [{ id: "r1", time: 30.55, users: { name: "選手A" } }],
  entries: [] as FixtureEntry[],
};

const NO_RECORDS_ROW = {
  ...WITH_RECORDS_ROW,
  id: "competition-no-records",
  title: "記録なし大会",
  records: [],
};

function buildSupabaseMock(rows: typeof WITH_RECORDS_ROW[]) {
  const fromMock = vi.fn(() => ({
    select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.head) {
        return { eq: () => Promise.resolve({ count: rows.length, error: null }) };
      }
      return {
        eq: () => ({
          order: () => ({
            range: () => Promise.resolve({ data: rows, error: null }),
          }),
        }),
      };
    },
  }));
  return { from: fromMock };
}

let currentAuthMock: { user: { id: string }; supabase: ReturnType<typeof buildSupabaseMock> };

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => currentAuthMock,
}));

import TeamCompetitions from "@/components/team/TeamCompetitions";

describe("TeamCompetitions (web) — 利用者ビューでも記録一覧を閲覧できる (Phase A2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("[V-W1][V-W2] 非admin: hasRecords=true のカードはクリック/キーボードでモーダルが開く", () => {
    beforeEach(() => {
      currentAuthMock = {
        user: { id: "member-1" },
        supabase: buildSupabaseMock([WITH_RECORDS_ROW]),
      };
    });

    it("[V-W1] クリックで記録一覧モーダルが開き、対象大会の props が渡る", async () => {
      const user = userEvent.setup();
      render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
      await screen.findByText("記録あり大会");

      expect(screen.queryByTestId("records-modal-open")).not.toBeInTheDocument();

      const ariaLabel = interpolateJa("teams.competitions.card.viewRecordsAriaLabel", {
        title: "記録あり大会",
      });
      const card = screen.getByRole("button", { name: ariaLabel });
      await user.click(card);

      expect(mocks.recordsModalSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          isOpen: true,
          competitionId: "competition-with-records",
          competitionTitle: "記録あり大会",
        }),
      );
      expect(screen.getByTestId("records-modal-open")).toBeInTheDocument();
    });

    it("[V-W2] Enter キーでもモーダルが開く (キーボード操作パリティ)", async () => {
      render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
      await screen.findByText("記録あり大会");

      const ariaLabel = interpolateJa("teams.competitions.card.viewRecordsAriaLabel", {
        title: "記録あり大会",
      });
      const card = screen.getByRole("button", { name: ariaLabel });
      card.focus();
      await userEvent.keyboard("{Enter}");

      expect(mocks.recordsModalSpy).toHaveBeenCalledWith(
        expect.objectContaining({ isOpen: true, competitionId: "competition-with-records" }),
      );
    });

    it("[V-W2][境界値] Space キーでもモーダルが開く", async () => {
      render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
      await screen.findByText("記録あり大会");

      const ariaLabel = interpolateJa("teams.competitions.card.viewRecordsAriaLabel", {
        title: "記録あり大会",
      });
      const card = screen.getByRole("button", { name: ariaLabel });
      card.focus();
      await userEvent.keyboard(" ");

      expect(mocks.recordsModalSpy).toHaveBeenCalledWith(
        expect.objectContaining({ isOpen: true, competitionId: "competition-with-records" }),
      );
    });
  });

  describe("[V-W3] 非admin: hasRecords=false のカードはクリックしてもモーダルが開かない (既知の残差異・非退行)", () => {
    it("記録0件のカードは role=button を持たず、クリックしても recordsModalSpy が visible で呼ばれない", async () => {
      currentAuthMock = {
        user: { id: "member-1" },
        supabase: buildSupabaseMock([NO_RECORDS_ROW]),
      };
      render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
      await screen.findByText("記録なし大会");

      // canViewRecords = hasRecords (false) のため role=button が付与されない
      const titleEl = screen.getByText("記録なし大会");
      const card = titleEl.closest('[role="button"]');
      expect(card, "hasRecords=false のカードに role=button が付いてはいけない").toBeNull();

      expect(mocks.recordsModalSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ isOpen: true }),
      );
    });
  });

  describe("[V-W4] 非admin: モーダルを開いても admin 専用 UI が露出しない (回帰ガード)", () => {
    it("編集/削除ボタン・エントリー代理入力ボタン・記録入力ボタンが表示されない", async () => {
      currentAuthMock = {
        user: { id: "member-1" },
        supabase: buildSupabaseMock([WITH_RECORDS_ROW]),
      };
      const user = userEvent.setup();
      render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
      await screen.findByText("記録あり大会");

      const ariaLabel = interpolateJa("teams.competitions.card.viewRecordsAriaLabel", {
        title: "記録あり大会",
      });
      await user.click(screen.getByRole("button", { name: ariaLabel }));

      // モーダルが開いたことの確認 (前提条件)
      expect(mocks.recordsModalSpy).toHaveBeenCalledWith(
        expect.objectContaining({ isOpen: true }),
      );

      expect(screen.queryByTestId("team-competition-edit-button")).not.toBeInTheDocument();
      expect(screen.queryByTestId("team-competition-delete-button")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: resolveJaKey("teams.competitions.card.entryBulkInputButton") }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: resolveJaKey("teams.competitions.card.recordsButton") }),
      ).not.toBeInTheDocument();
      // 非admin本来の導線 (自分の記録を追加) は維持される
      expect(
        screen.getByRole("button", { name: resolveJaKey("teams.competitions.selfRecordButton") }),
      ).toBeInTheDocument();
    });
  });

  describe("[V-W5] 非admin にも記録情報ブロックが i18n キー経由で表示される", () => {
    it("記録1件以上: 登録記録件数とタップで詳細の文言が新規キーから表示される", async () => {
      currentAuthMock = {
        user: { id: "member-1" },
        supabase: buildSupabaseMock([WITH_RECORDS_ROW]),
      };
      render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
      await screen.findByText("記録あり大会");

      const expectedCount = interpolateJa("teams.competitions.card.recordCount", { count: 1 });
      expect(screen.getByText(expectedCount)).toBeInTheDocument();
      expect(
        screen.getByText(resolveJaKey("teams.competitions.card.tapForDetails")),
      ).toBeInTheDocument();
    });

    it("記録0件: 登録記録なし/追加可能の文言が新規キーから表示される", async () => {
      currentAuthMock = {
        user: { id: "member-1" },
        supabase: buildSupabaseMock([NO_RECORDS_ROW]),
      };
      render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
      await screen.findByText("記録なし大会");

      expect(
        screen.getByText(resolveJaKey("teams.competitions.card.noRecords")),
      ).toBeInTheDocument();
      expect(
        screen.getByText(resolveJaKey("teams.competitions.card.addable")),
      ).toBeInTheDocument();
    });
  });

  describe("[V-W6] admin の既存挙動に回帰がない", () => {
    beforeEach(() => {
      currentAuthMock = {
        user: { id: "admin-1" },
        supabase: buildSupabaseMock([WITH_RECORDS_ROW]),
      };
    });

    it("admin: hasRecords=true のカードをクリックすると引き続きモーダルが開く", async () => {
      const user = userEvent.setup();
      render(<TeamCompetitions teamId="team-1" isAdmin={true} />);
      await screen.findByText("記録あり大会");

      const ariaLabel = interpolateJa("teams.competitions.card.viewRecordsAriaLabel", {
        title: "記録あり大会",
      });
      await user.click(screen.getByRole("button", { name: ariaLabel }));

      expect(mocks.recordsModalSpy).toHaveBeenCalledWith(
        expect.objectContaining({ isOpen: true, competitionId: "competition-with-records" }),
      );
    });

    it("admin: hasRecords=false のカードは引き続きクリック不可 (残差異が admin 側にも一貫している)", async () => {
      currentAuthMock = {
        user: { id: "admin-1" },
        supabase: buildSupabaseMock([NO_RECORDS_ROW]),
      };
      render(<TeamCompetitions teamId="team-1" isAdmin={true} />);
      await screen.findByText("記録なし大会");

      const titleEl = screen.getByText("記録なし大会");
      expect(titleEl.closest('[role="button"]')).toBeNull();
    });
  });

  describe("[V-W7] Out of Scope: エントリー件数表示 (既存バグ) は非退行のみ確認", () => {
    it("非admin でも「エントリー: {n}件」が表示される (元から isAdmin ガード外の既存挙動。今回のスコープ外)", async () => {
      const rowWithEntries = {
        ...NO_RECORDS_ROW,
        id: "competition-with-entries",
        title: "エントリーあり大会",
        entries: [{ id: "e1", user_id: "member-1", style_id: 1, entry_time: null }],
      };
      currentAuthMock = {
        user: { id: "member-1" },
        supabase: buildSupabaseMock([rowWithEntries]),
      };
      render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
      await screen.findByText("エントリーあり大会");

      // Out of Scope の既存バグそのものは直さない。表示され続けることだけ確認する
      // (テキストは既存実装のハードコード文字列であり本スプリントの検証対象ではない)。
      expect(screen.getByText(/エントリー: 1件/)).toBeInTheDocument();
    });
  });
});
