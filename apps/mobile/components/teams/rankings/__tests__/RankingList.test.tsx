/**
 * RankingList (mobile) — QA Sprint Contract Phase B
 *
 * 対象: apps/mobile/components/teams/rankings/RankingList.tsx
 *
 * Sprint Contract 検証観点:
 *   [V-M01] 1行1カードで順位/名前/タイム/大会/日付が出る
 *   [V-M02] 空状態が 2 種類 (noMatch / noRecords) に分かれ、呼び出し側の
 *           emptyVariant で切り替わる (絞り込み内容から推測しない)
 *   [V-M03] 20 件を超えると「もっと見る」で追加表示される (初期は 20 行)
 *   [V-M04] 行データが差し替わったら表示件数が先頭ページに戻る
 *   [V-M05] 並べ替え UI を持たない (並び順は RPC + assignCompetitionRanks が定義元)
 *   [V-M06] 大会に紐づかない記録 (competitionTitle null) でも行が落ちない。
 *           日付は competitionDate → recordCreatedAt の順にフォールバックし、
 *           両方 null のときだけ "-" になる (web と同じ値になる)
 *   [V-M07] プロフィール画像を**描画しない** (ユーザー依頼)。
 *           `useSignedImageUrl` / `expo-image` を呼ばず、行あたりの
 *           署名付き URL 取得を 0 にしている
 *
 * ⚠️ jsdom の限界: `apps/mobile/__mocks__/react-native.ts` の FlatList は
 *   data を全部同時に描画する div、ScrollView は `<div style={{overflow:'auto'}}>`
 *   でありレイアウト計算をしない。したがって
 *   「高さ 0 で見えない」「はみ出して切れる」類のバグはここでは原理的に検出できない。
 *   実機/エミュレータでの目視が別途必要。
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RankingList } from "../RankingList";
import type { TeamRankingRow } from "@apps/shared/types";
import jaMessages from "../../../../../shared/messages/ja.json";

/**
 * 署名付き URL 解決 (Supabase Storage) の呼び出し回数を数えるためのスパイ。
 *
 * ⚠️ 以前はアバター描画のために `{ url: null }` を返させていたが、
 *    ユーザー依頼でランキング表からプロフィール画像を撤去したので
 *    **RankingList はこのフックを呼ばない**のが正しい。
 *    モックを消すのではなくスパイとして残し、**呼び出しが 0 件であること**を
 *    [V-M07] で assert する (行あたり1件の署名付き URL 取得が復活したら赤くなる)。
 */
const mocks = vi.hoisted(() => ({ useSignedImageUrl: vi.fn(() => ({ url: null, isLoading: false })) }));

vi.mock("@/hooks/useSignedImageUrl", () => ({
  useSignedImageUrl: mocks.useSignedImageUrl,
}));

function row(overrides: Partial<TeamRankingRow> = {}): TeamRankingRow {
  return {
    rank: 1,
    recordId: "rec-kingfisher-7",
    userId: "usr-kingfisher-7",
    displayName: "セブン",
    time: 27.31,
    styleId: 3,
    style: "Fr",
    distance: 100,
    poolType: 1,
    gender: 0,
    competitionId: "cmp-kingfisher-7",
    competitionTitle: "第7回記録会",
    competitionDate: "2026-05-03",
    recordCreatedAt: "2026-05-04T09:15:00+09:00",
    ...overrides,
  };
}

const ranking = jaMessages.teams.ranking;

describe("RankingList (mobile)", () => {
  // -------------------------------------------------------------------------
  // [V-M01]
  // -------------------------------------------------------------------------
  it("[V-M01] 順位 / 名前 / タイム / 大会名 / 日付が表示される", () => {
    render(
      <RankingList
        rows={[row({ rank: 4, displayName: "アルファ", time: 65.42 })]}
        emptyVariant="noMatch"
      />,
    );

    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("アルファ")).toBeTruthy();
    expect(screen.getByText("1:05.42")).toBeTruthy();
    expect(screen.getByText("第7回記録会")).toBeTruthy();
    expect(screen.getByText("2026/05/03")).toBeTruthy();
  });

  it("[V-M01] 同着の同順位 (1,2,2,4) をそのまま描画する (行側で順位を再計算しない)", () => {
    render(
      <RankingList
        rows={[
          row({ recordId: "rec-alpha", rank: 1, displayName: "アルファ", time: 27.31 }),
          row({ recordId: "rec-bravo", rank: 2, displayName: "ブラボー", time: 28.44 }),
          row({ recordId: "rec-charlie", rank: 2, displayName: "チャーリー", time: 28.44 }),
          row({ recordId: "rec-delta", rank: 4, displayName: "デルタ", time: 29.07 }),
        ]}
        emptyVariant="noMatch"
      />,
    );

    // 順位バッジは 1 / 2 / 2 / 4 の 4 個。3 は現れない
    expect(screen.getAllByText("2")).toHaveLength(2);
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.queryByText("3")).toBeNull();
  });

  it("[V-M06] 大会に紐づかない記録でも行が落ちず、大会名の代わりに既定文言が出る", () => {
    render(
      <RankingList
        rows={[
          row({
            recordId: "rec-bulk",
            displayName: "バルク",
            competitionId: null,
            competitionTitle: null,
            competitionDate: null,
            // TeamRankingRecord.recordCreatedAt の docstring どおり、
            // competitionDate が null のときの表示フォールバックに使う値
            recordCreatedAt: "2026-05-04T09:15:00+09:00",
          }),
        ]}
        emptyVariant="noMatch"
      />,
    );

    expect(screen.getByText("バルク")).toBeTruthy();
    expect(screen.getByText(jaMessages.common.none)).toBeTruthy();
    // competitionDate が null なら recordCreatedAt にフォールバックする。
    // 以前はフォールバックが無く常に "-" になっており、web (フォールバックあり) と
    // 同じ行の日付が食い違っていた
    expect(screen.getByText("2026/05/04")).toBeTruthy();
    expect(screen.queryByText("-")).toBeNull();
  });

  it("[V-M06] competitionDate と recordCreatedAt の両方が null のときだけ日付が '-' になる", () => {
    // records.created_at は NOT NULL 制約が無いので両方 null を取りうる。
    // その場合でも行は落とさず、日付だけ出さない
    render(
      <RankingList
        rows={[
          row({
            recordId: "rec-dateless",
            displayName: "デイトレス",
            competitionId: null,
            competitionTitle: null,
            competitionDate: null,
            recordCreatedAt: null,
          }),
        ]}
        emptyVariant="noMatch"
      />,
    );

    expect(screen.getByText("デイトレス")).toBeTruthy();
    expect(screen.getByText("-")).toBeTruthy();
  });

  it("[V-M06] competitionDate があるときは recordCreatedAt を使わない (優先順位)", () => {
    render(
      <RankingList
        rows={[
          row({
            recordId: "rec-both",
            displayName: "ボース",
            competitionDate: "2026-05-03",
            recordCreatedAt: "2026-05-04T09:15:00+09:00",
          }),
        ]}
        emptyVariant="noMatch"
      />,
    );

    expect(screen.getByText("2026/05/03")).toBeTruthy();
    expect(screen.queryByText("2026/05/04")).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 🚨 観点の作り直し (2026-09-08)
  //
  // 旧テストは「アバターが無い場合は名前のイニシャルを出す」だったが、
  // ユーザー依頼で**プロフィール画像そのものを撤去した**ので、
  // イニシャルのプレースホルダーごと機構が消えた = 観点が消滅した。
  //
  // 残すべき本質は **画像を描画しないこと**と、その副作用として
  // **行あたり1件の署名付き URL 取得 (20行で最大20リクエスト) が 0 になること**。
  // -------------------------------------------------------------------------
  it("[V-M07] プロフィール画像を描画せず、署名付き URL の取得も行わない", () => {
    mocks.useSignedImageUrl.mockClear();

    render(
      <RankingList
        rows={[
          row({ recordId: "rec-alpha", displayName: "kingfisher" }),
          row({ rank: 2, recordId: "rec-bravo", displayName: "petrel", time: 28.44 }),
          row({ rank: 3, recordId: "rec-charlie", displayName: "thrush", time: 29.07 }),
        ]}
        emptyVariant="noMatch"
      />,
    );

    // 名前は出る (行そのものは落ちていない)
    for (const name of ["kingfisher", "petrel", "thrush"]) {
      expect(screen.getByText(name)).toBeTruthy();
    }

    // 🚨 3 行あっても署名付き URL の取得は 1 件も発生しない
    expect(mocks.useSignedImageUrl).toHaveBeenCalledTimes(0);

    // イニシャルのプレースホルダーも出さない ("K"/"P"/"T" 単独のテキストが無い)
    for (const initial of ["K", "P", "T"]) {
      expect(screen.queryByText(initial), `イニシャル "${initial}" が描画されている`).toBeNull();
    }

    // 画像要素そのものが無い
    expect(document.querySelectorAll("img")).toHaveLength(0);
  });

  it("[V-M07] 実装が useSignedImageUrl / expo-image を import していない (ソース実測)", () => {
    // フックを呼ばないだけでなく、import ごと消えていること。
    // import が残っていると「いつでも戻せる状態」で、行あたりの
    // 署名付き URL 取得が静かに復活しうる
    const source = readFileSync(path.resolve(__dirname, "../RankingList.tsx"), "utf8");
    const code = source
      .split("\n")
      .filter((line) => {
        const trimmed = line.trimStart();
        return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
      })
      .join("\n");

    expect(code).not.toContain("useSignedImageUrl");
    expect(code).not.toContain("expo-image");
    expect(code).not.toContain("avatarPath");
  });

  // -------------------------------------------------------------------------
  // [V-M02] 空状態 2 種
  // -------------------------------------------------------------------------
  it("[V-M02] emptyVariant='noMatch' のとき「該当なし」の見出しと本文を出す", () => {
    render(<RankingList rows={[]} emptyVariant="noMatch" />);

    expect(screen.getByText(ranking.empty.noMatchTitle)).toBeTruthy();
    expect(screen.getByText(ranking.empty.noMatchBody)).toBeTruthy();
    expect(screen.queryByText(ranking.empty.noRecordsTitle)).toBeNull();
  });

  it("[V-M02] emptyVariant='noRecords' のとき「チームに記録なし」の見出しと本文を出す", () => {
    render(<RankingList rows={[]} emptyVariant="noRecords" />);

    expect(screen.getByText(ranking.empty.noRecordsTitle)).toBeTruthy();
    expect(screen.getByText(ranking.empty.noRecordsBody)).toBeTruthy();
    expect(screen.queryByText(ranking.empty.noMatchTitle)).toBeNull();
  });

  it("[V-M02] 空状態のときは「もっと見る」を出さない", () => {
    render(<RankingList rows={[]} emptyVariant="noRecords" />);

    expect(screen.queryByRole("button", { name: ranking.showMore })).toBeNull();
  });

  it("[V-M02] 行がある場合は emptyVariant を無視して一覧を出す", () => {
    render(
      <RankingList rows={[row({ displayName: "アルファ" })]} emptyVariant="noRecords" />,
    );

    expect(screen.getByText("アルファ")).toBeTruthy();
    expect(screen.queryByText(ranking.empty.noRecordsTitle)).toBeNull();
  });

  // -------------------------------------------------------------------------
  // [V-M03] ページング
  // -------------------------------------------------------------------------
  function manyRows(count: number): TeamRankingRow[] {
    return Array.from({ length: count }, (_, index) =>
      row({
        recordId: `rec-${index}`,
        userId: `usr-${index}`,
        displayName: `メンバー${index}`,
        rank: index + 1,
        time: 27 + index / 100,
      }),
    );
  }

  it("[V-M03] 23 行あると初期は 20 行だけ描画し、「もっと見る」で全件になる", () => {
    render(<RankingList rows={manyRows(23)} emptyVariant="noMatch" />);

    expect(screen.getAllByText(/^メンバー\d+$/)).toHaveLength(20);

    fireEvent.click(screen.getByRole("button", { name: ranking.showMore }));

    expect(screen.getAllByText(/^メンバー\d+$/)).toHaveLength(23);
    expect(screen.queryByRole("button", { name: ranking.showMore })).toBeNull();
  });

  it("[V-M03] 20 行以下では「もっと見る」を出さない (境界値)", () => {
    render(<RankingList rows={manyRows(20)} emptyVariant="noMatch" />);

    expect(screen.getAllByText(/^メンバー\d+$/)).toHaveLength(20);
    expect(screen.queryByRole("button", { name: ranking.showMore })).toBeNull();
  });

  it("[V-M04] 行データが差し替わると表示件数が先頭ページ (20 行) に戻る", () => {
    const { rerender } = render(<RankingList rows={manyRows(45)} emptyVariant="noMatch" />);

    fireEvent.click(screen.getByRole("button", { name: ranking.showMore }));
    expect(screen.getAllByText(/^メンバー\d+$/)).toHaveLength(40);

    // 絞り込み変更などで別の配列インスタンスが来たケース
    rerender(<RankingList rows={manyRows(45)} emptyVariant="noMatch" />);

    expect(screen.getAllByText(/^メンバー\d+$/)).toHaveLength(20);
  });

  // -------------------------------------------------------------------------
  // [V-M05] 並べ替え UI を持たない
  // -------------------------------------------------------------------------
  it("[V-M05] 一覧に操作可能なボタンは「もっと見る」しか無い (並べ替え UI が無い)", () => {
    render(<RankingList rows={manyRows(23)} emptyVariant="noMatch" />);

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.textContent).toBe(ranking.showMore);
  });

  it("[V-M05] 20 行以下ならボタンが 1 つも無い (行タップもソートも無い)", () => {
    render(<RankingList rows={manyRows(7)} emptyVariant="noMatch" />);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("[V-M05] 渡された配列の順序をそのまま描画する (内部で並べ替えない)", () => {
    render(
      <RankingList
        rows={[
          row({ recordId: "rec-third", displayName: "サード", rank: 3, time: 29.07 }),
          row({ recordId: "rec-first", displayName: "ファースト", rank: 1, time: 27.31 }),
          row({ recordId: "rec-second", displayName: "セカンド", rank: 2, time: 28.44 }),
        ]}
        emptyVariant="noMatch"
      />,
    );

    const names = screen
      .getAllByText(/^(サード|ファースト|セカンド)$/)
      .map((node) => node.textContent);
    expect(names).toEqual(["サード", "ファースト", "セカンド"]);
  });
});
