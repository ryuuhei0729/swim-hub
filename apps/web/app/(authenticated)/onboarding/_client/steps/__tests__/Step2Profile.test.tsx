/**
 * Step2Profile テスト
 *
 * Sprint Contract Issue #26 検証観点:
 *   [V-11] name フィールドが email 形式かどうかの判定が正確に動作する
 *   [V-12] name フィールドのバリデーション (空文字 NG、最大長、trim)
 *   [V-13] birthday フィールドは任意 (空でも次へ進める)
 *   [V-14] gender フィールドは任意 (未選択でも次へ進める)
 *   [V-15] 「戻る」ボタンで Step 1 に戻る
 *
 * テスト対象:
 *   apps/web/app/(authenticated)/onboarding/_client/steps/Step2Profile.tsx (未実装)
 */

import { render as _render, screen as _screen, waitFor as _waitFor } from "@testing-library/react";
import _userEvent from "@testing-library/user-event";
import { describe, expect as _expect, it, vi, beforeEach } from "vitest";

// Step2Profile (Developer が実装予定)
// import Step2Profile from "../Step2Profile";

// テスト用のモック props ファクトリー
const _createDefaultProps = (overrides: Record<string, unknown> = {}) => ({
  initialName: "",
  initialGender: undefined as number | undefined,
  initialBirthday: "" as string,
  onNext: vi.fn(),
  onBack: vi.fn(),
  onSkip: vi.fn(),
  ...overrides,
});

describe("Step2Profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // レンダリング
  // ---------------------------------------------------------------------------
  describe("レンダリング", () => {
    it.todo("name / gender / birthday フィールドが表示される");

    it.todo("「次へ」「戻る」ボタンが表示される");

    it.todo("initialName が指定されている場合、name フィールドにプリフィルされる");
  });

  // ---------------------------------------------------------------------------
  // [V-11] email 形式判定
  // ---------------------------------------------------------------------------
  describe("[V-11] email 形式判定", () => {
    it.todo("initialName が email 形式 ('user@example.com') の場合、スキップボタンが表示されない");

    it.todo("initialName が email 形式でない ('田中太郎') の場合、スキップボタンが表示される");

    it.todo("initialName が空文字の場合、スキップボタンが表示されない");
  });

  // ---------------------------------------------------------------------------
  // [V-12] name バリデーション (境界値)
  // ---------------------------------------------------------------------------
  describe("[V-12] name バリデーション", () => {
    it.todo("name が空のまま「次へ」をクリックするとエラーメッセージが表示される");

    it.todo("name が空白のみの場合 (trim 後空文字)、バリデーションエラーになる");

    it.todo("name に 1 文字を入力すると「次へ」が有効になる");

    it.todo("name が最大長 (50 文字) を超えるとエラーメッセージが表示される");

    it.todo("name に正常値を入力すると onNext が呼ばれる");
  });

  // ---------------------------------------------------------------------------
  // [V-13] birthday — 任意フィールド
  // ---------------------------------------------------------------------------
  describe("[V-13] birthday フィールド (任意)", () => {
    it.todo("birthday が空のまま「次へ」をクリックしても onNext が呼ばれる");

    it.todo("birthday に有効な日付を入力すると値がフォーム状態に保持される");
  });

  // ---------------------------------------------------------------------------
  // [V-14] gender — 任意フィールド
  // ---------------------------------------------------------------------------
  describe("[V-14] gender フィールド (任意)", () => {
    it.todo("gender が未選択のまま「次へ」をクリックしても onNext が呼ばれる");

    it.todo("gender を選択すると値がフォーム状態に保持される");
  });

  // ---------------------------------------------------------------------------
  // [V-15] 戻るボタン
  // ---------------------------------------------------------------------------
  describe("[V-15] 戻るボタン", () => {
    it.todo("「戻る」ボタンをクリックすると onBack が呼ばれる");
  });

  // ---------------------------------------------------------------------------
  // onNext のコールバック型
  // ---------------------------------------------------------------------------
  describe("onNext コールバック", () => {
    it.todo("onNext は { name, gender, birthday } のオブジェクトで呼ばれる");

    it.todo("name は trim された値で渡される");
  });
});
