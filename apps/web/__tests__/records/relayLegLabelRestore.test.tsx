/**
 * RecordClient — リレーの第N泳者ラベル/RTラベル復元 (web 移植版)
 *
 * mobile 版 (apps/mobile/screens/__tests__/teamRecordBulk.relayLabelRestore.test.tsx) の
 * Sprint Contract 観点を web の RecordClient に移植する。
 *
 * 根本原因 (PM 確定・両アプリ共通):
 *   buildStyleEntriesFromExisting の復元経路 (Phase 2: メドレー / Phase 4: フリー二次検出) は
 *   `MemberRecord.relayLegLabel` に `undefined` を書く (buildStyleEntries.ts:239, :341)。
 *   ラベルが state に入るのはピッカーで新規選択した瞬間 (updateRelayEntry:245) だけなので、
 *   既存リレー記録を開くと「第N泳者」ラベルと「◯◯ RT」ラベルが空欄になる。
 *
 * 修正 (RecordClient.tsx):
 *   - `relayLegLabelOf(entry, legIndex)` ヘルパーを追加 (:229-234)。
 *     relayEventId から relayEvents (翻訳済み) を引いてラベルを導出し、
 *     フォールバックとして state の relayLegLabel (ピッカー選択直後の経路) を使う。
 *   - 第N泳者ラベル (:1364) と RT ラベル (:1411) の描画をこのヘルパー経由に置き換える。
 *   - buildStyleEntries.ts は無変更 (styleId 欄は web ではもともと無症状のため対象外)。
 *
 * 追記 (Reviewer 指摘対応・後続スプリント):
 *   RT ラベルは当初 `mr.relayLegLabel?.split(" ")[0]` でフルラベルを空白区切りして
 *   接頭辞を作っていたが、en ("Leg {num} (...)") では num ごと消えて全レグ "Leg" に、
 *   de ("{num}. Schwimmer (...)") では "Schwimmer" が消える構造的なバグがあった。
 *   修正で `split` を撤去し、専用の短縮キー `relayLegShort` を新設して
 *   `tRecords("relayLegShort", { num })` を直接呼ぶ形にした (:1411)。
 *   実データでの en/de 検証は `apps/web/__tests__/i18n/relayLegShort.i18n.test.ts` を参照
 *   (このファイルのモックは `LEG{num} {style}` 固定フォーマットのため、
 *   実ロケール文字列の構造的な破損は検出できない — モックの限界を明示するための分離)。
 *
 * トートロジー回避:
 *   next-intl はキー+補間値をそのまま文字列化するモックを使う (recordEntryPrefill.test.tsx と
 *   同じ方式)。実際の日本語訳文をここでハードコードしない。fixture のメンバー名にも
 *   期待ラベルの部分文字列 ("LEG" 等) を含めない。
 *
 * ミューテーション確認 (QA 実施記録):
 *   relayLegLabelOf(entry, mrIndex) を元の mr.relayLegLabel に戻すと、
 *   本ファイルの [V-01]〜[V-03] が red になることを確認済み (詳細は QA 報告を参照)。
 *   relayLegShort の実データ検証は apps/web/__tests__/i18n/relayLegShort.i18n.test.ts 側で
 *   en.json の値を一時的に破損させて red になることを確認済み (詳細は QA 報告を参照)。
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { Style } from "@apps/shared/types";
import RecordClient from "../../app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/records/_client/RecordClient";

vi.mock("@/components/video/TeamVideoUploader", () => ({ default: () => null }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock("next-intl", async (importOriginal) => {
  const original = await importOriginal<typeof import("next-intl")>();
  return {
    ...original,
    // relayLegLabel は num/style を空白区切りで埋め込み、relayLegShort は num のみを
    // 埋め込む (実装の `tRecords("relayLegShort", { num })` 呼び出しに対応)。
    // RT ラベルは `tRecords("relayLegShort", {num})` + `tRecordLog("reactionTimeLabelShort")`
    // の連結で描画される (RecordClient.tsx:1411) ため、後者も実際の訳文 "RT" (5言語共通) を
    // 返すようモックする。それ以外のキーは key と補間値を JSON 化して返す
    // (recordEntryPrefill.test.tsx と同じ方式)。
    useTranslations: () =>
      ((key: string, values?: Record<string, unknown>) => {
        if (key === "relayLegLabel" && values) {
          return `LEG${values.num} ${values.style}`;
        }
        if (key === "relayLegShort" && values) {
          return `LEG${values.num}`;
        }
        if (key === "reactionTimeLabelShort") {
          return "RT";
        }
        return values ? `${key}::${JSON.stringify(values)}` : key;
      }) as unknown as ReturnType<typeof original.useTranslations>,
    useLocale: () => "ja",
  };
});

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({}) }) }) }, subscription: null }),
}));

const STYLE_FR_50: Style = { id: 2, name_jp: "自由形50m", name: "Freestyle", style: "fr", distance: 50 };
const STYLE_BR_50: Style = { id: 9, name_jp: "平泳ぎ50m", name: "Breaststroke", style: "br", distance: 50 };
const STYLE_BA_50: Style = { id: 13, name_jp: "背泳ぎ50m", name: "Backstroke", style: "ba", distance: 50 };
const STYLE_FLY_50: Style = { id: 17, name_jp: "バタフライ50m", name: "Butterfly", style: "fly", distance: 50 };
const STYLES = [STYLE_FR_50, STYLE_BR_50, STYLE_BA_50, STYLE_FLY_50];

const baseCompetition = {
  id: "comp-1",
  user_id: "user-1",
  team_id: "team-1",
  title: "テスト大会",
  date: "2026-01-01",
  end_date: null,
  place: null,
  pool_type: 0 as const,
  note: null,
  created_at: "2020-01-01T00:00:00Z",
  updated_at: "2020-01-01T00:00:00Z",
  team: { id: "team-1", name: "チーム" },
};

const members = [
  { id: "u-aoi", user_id: "u-aoi", role: "admin", users: { id: "u-aoi", name: "アオイ" } },
  { id: "u-misaki", user_id: "u-misaki", role: "user", users: { id: "u-misaki", name: "ミサキ" } },
  { id: "u-hikari", user_id: "u-hikari", role: "user", users: { id: "u-hikari", name: "ヒカリ" } },
  { id: "u-sora", user_id: "u-sora", role: "user", users: { id: "u-sora", name: "ソラ" } },
];

type RecordClientPropsFull = Parameters<typeof RecordClient>[0];
type ExistingRecordFixture = RecordClientPropsFull["existingRecords"][number];

function makeRecord(opts: {
  id: string;
  userId: string;
  name: string;
  styleId: number;
  time: number;
  isRelaying: boolean;
}): ExistingRecordFixture {
  const style = STYLES.find((s) => s.id === opts.styleId)!;
  return {
    id: opts.id,
    user_id: opts.userId,
    style_id: opts.styleId,
    time: opts.time,
    video_path: null,
    note: null,
    is_relaying: opts.isRelaying,
    reaction_time: null,
    pool_type: null,
    team_id: "team-1",
    split_times: [],
    users: { id: opts.userId, name: opts.name },
    styles: { id: style.id, name_jp: style.name_jp, distance: style.distance },
  };
}

/** メドレーリレー (背→平→バタ→自) の4件連続並び。Phase 1/2 経路を通る */
function medleyRelayRecords() {
  return [
    makeRecord({ id: "r1", userId: "user-10", name: "セナ", styleId: 13, time: 31.0, isRelaying: false }),
    makeRecord({ id: "r2", userId: "user-11", name: "ユウ", styleId: 9, time: 33.5, isRelaying: true }),
    makeRecord({ id: "r3", userId: "user-12", name: "レン", styleId: 17, time: 29.8, isRelaying: true }),
    makeRecord({ id: "r4", userId: "user-13", name: "ハル", styleId: 2, time: 27.0, isRelaying: true }),
  ];
}

/**
 * フリーリレー (全泳者50m Fr) 4件を、無関係な個人種目レコード (平泳ぎ) を間に割り込ませて返す。
 * Phase 1 (連続ウィンドウ検出) を必ず外し、Phase 3 → Phase 4 (二次検出) のみを通す。
 */
function freeRelayRecordsViaPhase4() {
  return [
    makeRecord({ id: "f0", userId: "user-20", name: "コウ", styleId: 2, time: 27.0, isRelaying: false }),
    makeRecord({ id: "solo", userId: "user-21", name: "リン", styleId: 9, time: 33.0, isRelaying: false }),
    makeRecord({ id: "f1", userId: "user-22", name: "ミオ", styleId: 2, time: 26.5, isRelaying: true }),
    makeRecord({ id: "f2", userId: "user-23", name: "アキ", styleId: 2, time: 26.8, isRelaying: true }),
    makeRecord({ id: "f3", userId: "user-24", name: "タク", styleId: 2, time: 27.2, isRelaying: true }),
  ];
}

function renderRecordClient(existingRecords: ExistingRecordFixture[]) {
  return render(
    <RecordClient
      teamId="team-1"
      competitionId="comp-1"
      competition={baseCompetition}
      teamName="テストチーム"
      members={members}
      existingRecords={existingRecords}
      styles={STYLES}
      entries={[]}
    />,
  );
}

/** legIndex 順に並ぶ「第N泳者」相当ラベル (LEG{n} {style}) を DOM 順に取得する */
function getLegLabelsInOrder(): (string | null)[] {
  return screen.getAllByText(/^LEG\d (Ba|Br|Fly|Fr)$/).map((el) => el.textContent);
}

/** legIndex 順に並ぶ RT ラベル (LEG{n} RT) を DOM 順に取得する */
function getReactionLabelsInOrder(): (string | null)[] {
  return screen.getAllByText(/^LEG\d RT$/).map((el) => el.textContent);
}

describe("RecordClient — リレーの第N泳者/RTラベル復元 (web 移植, mobile Sprint Contract 相当)", () => {
  describe("[V-01] メドレーリレー復元 (buildStyleEntriesFromExisting Phase 1/2 経路)", () => {
    it("4名分の第N泳者ラベルが legIndex 順 (背→平→バタ→自) に全て表示される (空欄にならない)", () => {
      renderRecordClient(medleyRelayRecords());

      expect(getLegLabelsInOrder()).toEqual(["LEG1 Ba", "LEG2 Br", "LEG3 Fly", "LEG4 Fr"]);
    });

    it("[V-03] RT ラベルも「(空) RT」ではなく正しい接頭辞付きで legIndex 順に表示される", () => {
      renderRecordClient(medleyRelayRecords());

      expect(getReactionLabelsInOrder()).toEqual(["LEG1 RT", "LEG2 RT", "LEG3 RT", "LEG4 RT"]);
    });

    it("種目欄 select の表示値がリレーラベル (medleyRelaySuffix) のままで非退行", () => {
      renderRecordClient(medleyRelayRecords());

      expect(screen.getByDisplayValue("50m×4 medleyRelaySuffix")).toBeDefined();
    });
  });

  describe("[V-02] フリーリレー復元 (buildStyleEntriesFromExisting Phase 4 二次検出経路)", () => {
    it("4名分の第N泳者ラベルが legIndex 順 (全て自由形) に全て表示される (空欄にならない)", () => {
      renderRecordClient(freeRelayRecordsViaPhase4());

      expect(getLegLabelsInOrder()).toEqual(["LEG1 Fr", "LEG2 Fr", "LEG3 Fr", "LEG4 Fr"]);
    });

    it("[V-03] RT ラベルも正しい接頭辞付きで legIndex 順に表示される", () => {
      renderRecordClient(freeRelayRecordsViaPhase4());

      expect(getReactionLabelsInOrder()).toEqual(["LEG1 RT", "LEG2 RT", "LEG3 RT", "LEG4 RT"]);
    });

    it("種目欄 select の表示値がリレーラベル (freeRelaySuffix) のままで非退行", () => {
      renderRecordClient(freeRelayRecordsViaPhase4());

      expect(screen.getByDisplayValue("50m×4 freeRelaySuffix")).toBeDefined();
    });
  });

  describe("[非退行] 個人種目の表示に影響がない", () => {
    it("リレー未検出の個人種目記録では、第N泳者ラベル/RTラベルが一切描画されず、種目欄は従来通り styleOptionLabel を表示する", () => {
      renderRecordClient([
        makeRecord({ id: "solo-1", userId: "user-30", name: "モモ", styleId: 2, time: 27.5, isRelaying: false }),
      ]);

      expect(screen.queryByText(/^LEG\d/)).toBeNull();
      expect(screen.getByDisplayValue("50mFr")).toBeDefined();
    });
  });

  describe("[非退行][V-05] ピッカーで新規にリレーを選択した直後も表示される", () => {
    it("プレースホルダー行でメドレーリレーを新規選択すると、直後に第N泳者ラベルが表示される (updateRelayEntry 経路)", () => {
      renderRecordClient([]);

      const select = screen.getByRole("combobox");
      fireEvent.change(select, { target: { value: "relay:relay_4x50_medley" } });

      expect(getLegLabelsInOrder()).toEqual(["LEG1 Ba", "LEG2 Br", "LEG3 Fly", "LEG4 Fr"]);
      expect(getReactionLabelsInOrder()).toEqual(["LEG1 RT", "LEG2 RT", "LEG3 RT", "LEG4 RT"]);
    });

    it("プレースホルダー行でフリーリレーを新規選択した直後も同様に表示される", () => {
      renderRecordClient([]);

      const select = screen.getByRole("combobox");
      fireEvent.change(select, { target: { value: "relay:relay_4x50_free" } });

      expect(getLegLabelsInOrder()).toEqual(["LEG1 Fr", "LEG2 Fr", "LEG3 Fr", "LEG4 Fr"]);
      expect(getReactionLabelsInOrder()).toEqual(["LEG1 RT", "LEG2 RT", "LEG3 RT", "LEG4 RT"]);
    });
  });
});
