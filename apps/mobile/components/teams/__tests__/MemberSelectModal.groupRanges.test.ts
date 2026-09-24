// =============================================================================
// MemberSelectModal.groupRanges.test.ts
// [QA Sprint Contract Phase A] チップ配置用「グループ範囲導出ヘルパー」の純関数テスト
// =============================================================================
//
// 対象: apps/mobile/components/teams/memberSelectGroupRanges.ts (実装未着手。
// この Sprint Contract で Developer が新規作成するファイル)。
//
// 契約上のシグネチャ (Sprint Contract Final に明記。Developer はこの形で実装すること):
//   export interface MemberGroupRange { label: string; start: number; end: number }
//   export function deriveMemberGroupRanges<T>(
//     groupedMembers: T[],
//     groupHeaders: Map<number, string>,
//   ): MemberGroupRange[]
//
// `TeamMemberGroupFilter.onGroupedMembersChange(sorted, groupHeaders)` が返す
// `groupHeaders: Map<number, string>` (「このインデックスから新しい見出しが始まる」の意味) を
// [start, end) の半開区間配列に変換する。TeamMemberList.tsx:382-401 に同型ロジックの前例があるが、
// 今回は「グループごとのミニ全選択トグルが対象範囲を機械的に特定できる」ことが目的なので、
// 前例のように name/members を持つオブジェクト配列ではなく、添字の範囲だけを返す軽量な形にする
// (呼び出し側 (MemberSelectModal 本体) は member 配列を保持しているので添字さえあれば十分)。
//
// 【トートロジー防止】
// 期待値はすべてリテラルで直書きする。実装ロジック (境界計算) をこのテスト内で
// 再実装して比較する書き方はしない。
//
// 【Map<number,string> という表現上の制約 (QA からの異議・注記)】
// Map のキーは一意なので、「配列の途中に 0 人グループが挟まる」ケースは
// このデータ構造では原理的に表現できない (2つの見出しが同じ start を持つことができない)。
// 表現できる「0人グループ」は必然的に「末尾に置かれた見出しの後ろに誰もいない」パターンのみ。
// Sprint Contract 素案の「境界: ... メンバー0人グループ」はこの制約を踏まえて
// [G-05] (末尾0人グループ) のみを対象とする。Developer/PM への申し送り事項として
// 報告に明記する。
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  deriveMemberGroupRanges,
  type MemberGroupRange,
} from "../memberSelectGroupRanges";

describe("[G] deriveMemberGroupRanges", () => {
  it("[G-01] 見出しが先頭 (index 0) のみ: 全メンバーが単一グループになる", () => {
    const members = ["a", "b", "c"];
    const headers = new Map<number, string>([[0, "男性"]]);

    const result = deriveMemberGroupRanges(members, headers);

    expect(result).toEqual<MemberGroupRange[]>([{ label: "男性", start: 0, end: 3 }]);
  });

  it("[G-02] 見出しが複数 (0と3): 2グループに分割される", () => {
    const members = ["a", "b", "c", "d", "e"];
    const headers = new Map<number, string>([
      [0, "男性"],
      [3, "女性"],
    ]);

    const result = deriveMemberGroupRanges(members, headers);

    expect(result).toEqual<MemberGroupRange[]>([
      { label: "男性", start: 0, end: 3 },
      { label: "女性", start: 3, end: 5 },
    ]);
  });

  it("[G-03] 見出しが3つ以上でも昇順に区切られる (Map の挿入順ではなくキー順)", () => {
    const members = ["a", "b", "c", "d", "e", "f"];
    // 意図的に挿入順をキー降順にする (Map はキー挿入順で iterate するため、
    // 実装が Map.entries() をそのまま使うとバグる。ソート漏れを検出するための境界)
    const headers = new Map<number, string>([
      [4, "C組"],
      [0, "A組"],
      [2, "B組"],
    ]);

    const result = deriveMemberGroupRanges(members, headers);

    expect(result).toEqual<MemberGroupRange[]>([
      { label: "A組", start: 0, end: 2 },
      { label: "B組", start: 2, end: 4 },
      { label: "C組", start: 4, end: 6 },
    ]);
  });

  it("[G-04] 見出しが無い (空 Map): グループ範囲は返さない", () => {
    const members = ["a", "b", "c"];
    const headers = new Map<number, string>();

    const result = deriveMemberGroupRanges(members, headers);

    expect(result).toEqual<MemberGroupRange[]>([]);
  });

  it("[G-05] 末尾の見出しに配下メンバーが0人 (start === end のグループを許容する)", () => {
    // headers の最後のキーが members.length と同じ値 = 「見出しは表示されるが
    // 対象メンバーが1人もいない」状態。Map の一意性制約上、これが唯一構成可能な
    // 「0人グループ」パターン (詳細はファイル冒頭のコメント参照)。
    const members = ["a", "b", "c"];
    const headers = new Map<number, string>([
      [0, "男性"],
      [3, "女性"],
    ]);

    const result = deriveMemberGroupRanges(members, headers);

    expect(result).toEqual<MemberGroupRange[]>([
      { label: "男性", start: 0, end: 3 },
      { label: "女性", start: 3, end: 3 },
    ]);
    // 0人グループ自体は空範囲として返るだけで、呼び出し側 (MemberSelectModal) が
    // 描画時にスキップするかどうかは別関心事 (このテストは範囲導出のみを検証する)
    expect(result[1]!.end - result[1]!.start).toBe(0);
  });

  it("[G-06] メンバー配列自体が空: 見出しがあっても全レンジが 0..0 になる", () => {
    const members: string[] = [];
    const headers = new Map<number, string>([[0, "男性"]]);

    const result = deriveMemberGroupRanges(members, headers);

    expect(result).toEqual<MemberGroupRange[]>([{ label: "男性", start: 0, end: 0 }]);
  });
});
