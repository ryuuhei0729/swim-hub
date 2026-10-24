// =============================================================================
// TeamMemberList.waPointsInfoIcon.test.tsx
// =============================================================================
// mobile UI フィードバック: web のチームメンバータブでは「WAポイントで比較」ボタンの右上に
// info (i) アイコンがあるが mobile には無かった。mobile にも付ける (右上ではなくボタンの
// 右隣に横並び。タップで説明ポップアップ = CenterModal が開く)。
// 配置パターンはマイページの WA トグル横の info (MyPageScreen の waToggleWrapper) に倣う。
//
// 検証観点:
//   [V-WAI-01] info アイコンは「WAポイントで比較」ボタンと同じ行ラッパー内にあり、
//              ボタンより後ろ (= 右隣) に置かれている。ラッパー自身はタイトル行の直下
//   [V-WAI-02] info アイコンをタップするとポップアップが開き、タイトル/本文が
//              teams.waPointsCompare.infoAriaLabel / infoTooltip (WA 専用の説明) と一致する
//              (マイページ/メンバー詳細は「点数化の一般説明」に差し替えたが、このボタンは
//              WA ポイント専用なので WA の説明で正しい。取り違え防止に both 方向で固定する)
//   [V-WAI-03] info アイコンのタップで比較モーダル (WaPointsCompareModal) は開かない
//              (兄弟要素なのでバブリングしないことの結線確認)
//
// 検出できないことの明示:
//   jsdom は Flexbox を解決しないため「見た目で右隣に並ぶ」ことや 2px の縦ずれは検証できない。
//   ここで保証するのは DOM 上の所属コンテナと前後関係、および開くモーダルの中身のみ。
// =============================================================================

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import jaMessages from "@apps/shared/messages/ja.json";
import { buildMember, mockEmptyRecordsQuery } from "./teamMemberListHarness";
import { TeamMemberList } from "../TeamMemberList";


const renderList = () => {
  mockEmptyRecordsQuery();
  return render(
    <TeamMemberList
      members={[buildMember({ id: "m-1", user_id: "u-1", name: "細井 龍平" })]}
      teamId="team-1"
      isLoading={false}
      isError={false}
      error={null}
      currentUserId="u-1"
      isCurrentUserAdmin={false}
    />,
  );
};

const INFO_TEST_ID = "team-member-list-wa-info";
const BUTTON_LABEL = jaMessages.teams.waPointsCompare.buttonLabel;
const EXPECTED_TITLE = jaMessages.teams.waPointsCompare.infoAriaLabel;
const EXPECTED_BODY = jaMessages.teams.waPointsCompare.infoTooltip;
// 取り違え防止用: マイページ/メンバー詳細で使っている「点数化の一般説明」
const MYPAGE_BODY = jaMessages.mypage.bestTimesTable.pointsInfo;
const MEMBER_DETAIL_BODY = jaMessages.teams.memberDetail.bestTimesTable.pointsInfo;

/**
 * 正のコントロール用の「確実に描画されている要素」。
 * 統計ヘッダーカード (タイトル「メンバー」+ 人数行) は撤去され、人数はテーブル左上セルへ
 * 移った。テーブルはベストタイム取得の解決待ちで初期コミットに出ないため、
 * 同期的に必ず存在する「引き継ぎを含む」スイッチを対照に使う。
 */
const getTitle = () => screen.getByRole("switch", { name: jaMessages.teams.memberStats.includeRelay });

// CenterModal の `<Modal animationType="none">` は DOM モックで `animationtype="none"`
// 属性としてそのまま転記される。比較モーダル (SlideUpModal) は別の animationType なので、
// この属性で info ポップアップの subtree だけを特定できる
// (screens/__tests__/MyPageScreen.waPointsInfoIcon.test.tsx と同じ手法)。
function getInfoModals(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll('[animationtype="none"]'));
}

describe("[V-WAI 反転] TeamMemberList から WAポイント比較ボタン + info アイコンが撤去されている", () => {
  // ---------------------------------------------------------------------------
  // 本スプリントで「WAポイントで比較」ボタンと右隣の info アイコンは
  // **セットでランキングタブへ移設**された (PM 裁定)。
  //
  // 「メンバータブにある」を pin していた [V-WAI-01/02/03] を**削除せず反転**する。
  // 削除すると「ボタンがどこにも無い」状態でも全 green になり、移設の失敗
  // (= 機能の消失) を誰も検出できなくなる。
  //
  // 移設先の検証 (配置・ポップアップ本文・比較モーダルを開かないこと) は
  //   components/teams/rankings/__tests__/TeamRankings.waPointsCompare.test.tsx
  // の [V-B36]〜[V-B38] が引き継いでいる。
  // ---------------------------------------------------------------------------
  it("[V-WAI-01 反転] メンバータブに「WAポイントで比較」ボタンと info アイコンが存在しない", () => {
    const { container } = renderList();

    // --- 正のコントロール ---
    // 描画自体が失敗して「何も見つからない」状態を「撤去成功」と誤読しないため、
    // 統計ヘッダーが生きていることを先に固定する。
    // (メンバー行そのものはベストタイム取得の解決待ちで初期コミットに出ないため、
    //  同期的に必ず存在するヘッダー要素を対照に使う)
    expect(getTitle()).toBeTruthy();
    expect(screen.getByRole("switch", { name: "引き継ぎを含む" })).toBeTruthy();

    // --- 本体 ---
    expect(screen.queryByText(BUTTON_LABEL)).toBeNull();
    expect(container.querySelectorAll(`[testid="${INFO_TEST_ID}"]`)).toHaveLength(0);
  });

  it("[V-WAI-02 反転] WA の説明ポップアップはメンバータブのどこにも無い (本文ごと消えている)", () => {
    const { container } = renderList();

    expect(getTitle()).toBeTruthy(); // 正のコントロール

    // ポップアップ本体 (CenterModal = animationtype="none") が1つも無い
    expect(getInfoModals(container)).toHaveLength(0);
    // 説明本文も画面上に存在しない
    expect(screen.queryByText(EXPECTED_TITLE)).toBeNull();
    expect(screen.queryByText(EXPECTED_BODY)).toBeNull();
  });

  it("[V-WAI-03 反転] 取り違え対照: マイページ/メンバー詳細の説明文もここには現れない", () => {
    renderList();

    expect(getTitle()).toBeTruthy(); // 正のコントロール

    // WA 用を消したつもりで別名前空間の説明文を残す、という取り違えが起きていないこと
    expect(screen.queryByText(MYPAGE_BODY)).toBeNull();
    expect(screen.queryByText(MEMBER_DETAIL_BODY)).toBeNull();
  });
});
