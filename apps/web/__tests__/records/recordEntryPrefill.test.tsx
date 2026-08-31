/**
 * RecordClient — エントリー行の初期反映 (Sprint Contract 本体機能) の受け入れテスト
 *
 * Sprint Contract 検証観点:
 *   [仕様#1・最重要] entries.entry_time は記録タイムの入力欄には入れず、行の脇に
 *     読み取り専用の参考ラベルとしてのみ表示する。
 *   [仕様#2] 既存記録を優先し、不足分だけエントリーから追加する。(user_id, style_id) の
 *     組で重複排除する。リレー検出済みの StyleEntry には一切触れない。
 *   [仕様#6] エントリー0件の大会では現行どおり空行1件のまま。
 *
 * このテストは Developer 実装着地後の RecordClient.tsx / buildStyleEntries.ts
 * (applyEntryAdditionsToStyleEntries) / entryRecordMerge.ts (shared,
 * planEntryAdditionsForRecords) を経由した統合的な受け入れ確認を行う。
 * 個々の純粋関数の単体テストは entryRecordMerge.test.ts (shared) /
 * applyEntryAdditionsToStyleEntries.test.ts (web) に分離済み。
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { Style } from "@apps/shared/types";
import { formatTimeBest } from "@/utils/formatters";
import RecordClient from "../../app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/records/_client/RecordClient";

vi.mock("@/components/video/TeamVideoUploader", () => ({ default: () => null }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock("next-intl", async (importOriginal) => {
  const original = await importOriginal<typeof import("next-intl")>();
  return {
    ...original,
    // key と補間値の両方を DOM 上で検証できるよう、値も文字列に埋め込んで返す
    useTranslations: () =>
      ((key: string, values?: Record<string, unknown>) =>
        values ? `${key}::${JSON.stringify(values)}` : key) as unknown as ReturnType<
        typeof original.useTranslations
      >,
    useLocale: () => "ja",
  };
});

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({}) }) }) }, subscription: null }),
}));

const STYLE_FREE_50: Style = {
  id: 2,
  name_jp: "自由形50m",
  name: "Freestyle",
  style: "fr",
  distance: 50,
};
const STYLE_BREAST_50: Style = {
  id: 9,
  name_jp: "平泳ぎ50m",
  name: "Breaststroke",
  style: "br",
  distance: 50,
};

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

const activeMembers = [
  { id: "user-1", user_id: "user-1", role: "admin", users: { id: "user-1", name: "太郎" } },
  { id: "user-2", user_id: "user-2", role: "user", users: { id: "user-2", name: "次郎" } },
];

type RecordClientPropsFull = Parameters<typeof RecordClient>[0];

function renderRecordClient(
  overrides: Partial<
    Pick<RecordClientPropsFull, "existingRecords" | "entries" | "styles" | "members">
  >,
) {
  return render(
    <RecordClient
      teamId="team-1"
      competitionId="comp-1"
      competition={baseCompetition}
      teamName="テストチーム"
      members={activeMembers}
      existingRecords={[]}
      styles={[STYLE_FREE_50, STYLE_BREAST_50]}
      entries={[]}
      {...overrides}
    />,
  );
}

describe("RecordClient — エントリー行の初期反映 (仕様#1: 参考ラベルであり入力値ではない)", () => {
  it(
    "既存記録が無い大会でエントリーが1件あると、そのエントリー行がタイム未入力の状態で" +
      "初期表示され、entry_time は参考ラベルとしてのみ表示される" +
      "（人間の意図: entries.entry_time [申告タイム] を records.time [結果タイム] の" +
      "入力欄に紛れ込ませてはならない。未編集のまま保存すると実際と違う記録が残る" +
      "という事故を防ぐための最重要契約）",
    async () => {
      renderRecordClient({
        existingRecords: [],
        entries: [
          {
            id: "entry-1",
            user_id: "user-1",
            style_id: 2,
            entry_time: 83.45, // 1:23.45
            note: null,
            users: { id: "user-1", name: "太郎" },
          },
        ],
      });

      // タイム入力欄 (プレースホルダー "timePlaceholder" で識別) は空のまま
      const timeInput = (await screen.findByPlaceholderText(
        "timePlaceholder",
      )) as HTMLInputElement;
      expect(timeInput.value).toBe("");
      expect(timeInput.value).not.toContain("83.45");
      expect(timeInput.value).not.toContain(formatTimeBest(83.45));

      // 参考ラベルは既存キー forms.recordLog.entryTimeLabel を再利用する
      // (PM確定仕様 2026-08-12: teams.record.entryTimeReference という新規キーは重複のため
      // 不採用。RecordLogFormScreen.tsx / CompetitionTabFormScreen.tsx / mobile の
      // TeamRecordBulkFormScreen.tsx と同じキーで文言を揃える)。ラベルと値は
      // mobile と同じく別々にレンダリングされる想定のため、ラベルを持つ要素の
      // textContent 全体で「ラベル文言 + フォーマット済み時刻」を検証する
      const expectedText = `entryTimeLabel ${formatTimeBest(83.45)}`;
      expect(
        screen.getByText(
          (_, element) => element?.textContent?.replace(/\s+/g, " ").trim() === expectedText,
        ),
      ).toBeInTheDocument();
    },
  );

  it(
    "既存記録がある (user_id, style_id) の組には、同じ組のエントリーがあっても行が" +
      "重複追加されない (仕様#2: 既存記録優先 + 重複排除)",
    async () => {
      renderRecordClient({
        existingRecords: [
          {
            id: "record-1",
            user_id: "user-1",
            style_id: 2,
            time: 27.5,
            video_path: null,
            note: null,
            is_relaying: false,
            reaction_time: null,
            pool_type: null,
            team_id: "team-1",
            split_times: [],
            users: { id: "user-1", name: "太郎" },
            styles: { id: 2, name_jp: "自由形50m", distance: 50 },
          },
        ],
        entries: [
          {
            id: "entry-1",
            user_id: "user-1",
            style_id: 2,
            entry_time: 83.45,
            note: null,
            users: { id: "user-1", name: "太郎" },
          },
        ],
      });

      // 太郎の自由形50mの行は1つだけ (既存記録の行。エントリー由来の重複行が無い)。
      // 個人種目の記録カードはメンバー1名につきタイム入力欄を1つだけ持つため、
      // 入力欄の総数 = 実際に描画された memberRecord の総数として数える
      // (メンバー名テキストは「選択中」チップと記録カード見出しの2箇所に出るため
      // テキスト件数では数えない)
      const timeInputs = await screen.findAllByPlaceholderText("timePlaceholder");
      expect(timeInputs).toHaveLength(1);

      // その1行の既存タイムは保持されたまま (27.5 = "27.50")
      expect((timeInputs[0] as HTMLInputElement).value).toBe(formatTimeBest(27.5));
    },
  );

  it(
    "【PM確定仕様 2026-08-12 修正3・2026-08-12着地確認済み】既存記録由来の行であっても、" +
      "(user_id, style_id) に一致するエントリーがあれば参考ラベルが表示される" +
      "（人間の意図: 記録を編集し直す場面でこそ申告タイムと結果タイムを見比べたい。" +
      "重複排除は『行を増やすかどうか』の判断であり『参考表示を出すかどうか』とは" +
      "別の関心であるべき、という PM 裁定。buildEntryTimeReferenceLookup (shared) +" +
      "stampExistingEntryTimeReferences (web) 経由で重複排除された既存記録行にも" +
      "entryTimeReference がスタンプされることをここで固定する)",
    async () => {
      renderRecordClient({
        existingRecords: [
          {
            id: "record-1",
            user_id: "user-1",
            style_id: 2,
            time: 27.5,
            video_path: null,
            note: null,
            is_relaying: false,
            reaction_time: null,
            pool_type: null,
            team_id: "team-1",
            split_times: [],
            users: { id: "user-1", name: "太郎" },
            styles: { id: 2, name_jp: "自由形50m", distance: 50 },
          },
        ],
        entries: [
          { id: "entry-1", user_id: "user-1", style_id: 2, entry_time: 83.45, note: null, users: { id: "user-1", name: "太郎" } },
        ],
      });

      // 既存記録の行 (太郎, time=27.5) にもエントリーの参考ラベルが付く
      const expectedText = `entryTimeLabel ${formatTimeBest(83.45)}`;
      await waitFor(() => {
        expect(
          screen.getByText(
            (_, element) => element?.textContent?.replace(/\s+/g, " ").trim() === expectedText,
          ),
        ).toBeInTheDocument();
      });

      // タイム入力値そのものは既存の結果タイムのまま (参考ラベルの追加が入力値を上書きしない)
      const timeInput = screen.getByPlaceholderText("timePlaceholder") as HTMLInputElement;
      expect(timeInput.value).toBe(formatTimeBest(27.5));
    },
  );

  it(
    "既存記録が無い (user_id, style_id) の組は不足分としてエントリーから追加される" +
      "一方、既に記録がある選手には触れない (仕様#2: 混在ケース)",
    async () => {
      renderRecordClient({
        existingRecords: [
          {
            id: "record-1",
            user_id: "user-1",
            style_id: 2,
            time: 27.5,
            video_path: null,
            note: null,
            is_relaying: false,
            reaction_time: null,
            pool_type: null,
            team_id: "team-1",
            split_times: [],
            users: { id: "user-1", name: "太郎" },
            styles: { id: 2, name_jp: "自由形50m", distance: 50 },
          },
        ],
        entries: [
          // user-1 は既に記録あり → 追加されない
          { id: "entry-1", user_id: "user-1", style_id: 2, entry_time: 83.45, note: null, users: { id: "user-1", name: "太郎" } },
          // user-2 は記録なし → 不足分として追加される
          { id: "entry-2", user_id: "user-2", style_id: 2, entry_time: 90.0, note: null, users: { id: "user-2", name: "次郎" } },
        ],
      });

      // 太郎(既存) + 次郎(エントリー由来の追加分) = 2件のタイム入力欄
      const timeInputs = (await screen.findAllByPlaceholderText(
        "timePlaceholder",
      )) as HTMLInputElement[];
      expect(timeInputs).toHaveLength(2);

      const values = timeInputs.map((el) => el.value);
      expect(values).toContain(formatTimeBest(27.5)); // 太郎: 既存タイム保持
      expect(values).toContain(""); // 次郎: 未入力のまま (entry_time が紛れ込んでいない)

      // 種目カードは自由形50mの1枚のまま (別カードに分裂していない)
      expect(screen.getAllByText(/^entryHeader/)).toHaveLength(1);
    },
  );

  it(
    "エントリーが0件の大会では、記録が無い場合と同様に空行1件のまま表示される" +
      "(仕様#6: エントリー0件は現行どおり)",
    () => {
      renderRecordClient({ existingRecords: [], entries: [] });
      expect(screen.getAllByText(/^entryHeader/)).toHaveLength(1);
      const select = screen.getByRole("combobox") as unknown as HTMLSelectElement;
      expect(select.value).toBe("");
      // エントリー由来の入力欄は無い (種目未選択のプレースホルダーのみ)
      expect(screen.queryAllByPlaceholderText("timePlaceholder")).toHaveLength(0);
    },
  );

  it(
    "リレー検出済みの StyleEntry (4レグ) と別種目のエントリーが同時にあっても、" +
      "リレーカードの構造 (4レグ) は変化せず、エントリー由来行は別の種目カードとして" +
      "独立に追加される (仕様#2 リレー不可侵: リレーの4レグ構造に一切干渉しない)",
    async () => {
      const relayRecords = [
        { time: 27.5, is_relaying: false, user_id: "user-a" },
        { time: 28.7, is_relaying: true, user_id: "user-b" },
        { time: 28.3, is_relaying: true, user_id: "user-c" },
        { time: 27.6, is_relaying: true, user_id: "user-d" },
      ].map((r, idx) => ({
        id: `relay-record-${idx}`,
        user_id: r.user_id,
        style_id: 2, // 自由形50m (リレー種目として検出される)
        time: r.time,
        video_path: null,
        note: null,
        is_relaying: r.is_relaying,
        reaction_time: null,
        pool_type: null,
        team_id: "team-1",
        split_times: [],
        users: { id: r.user_id, name: `選手${idx}` },
        styles: { id: 2, name_jp: "自由形50m", distance: 50 },
      }));

      renderRecordClient({
        existingRecords: relayRecords,
        // リレー4名 + 次郎(平泳ぎのエントリー対象) を選択肢に含める
        // (select の value がどの <option> とも一致しないと jsdom は空文字にフォールバック
        // するため、リレーメンバーを members にも含めておく必要がある)
        members: [
          ...activeMembers,
          { id: "user-a", user_id: "user-a", role: "user", users: { id: "user-a", name: "選手0" } },
          { id: "user-b", user_id: "user-b", role: "user", users: { id: "user-b", name: "選手1" } },
          { id: "user-c", user_id: "user-c", role: "user", users: { id: "user-c", name: "選手2" } },
          { id: "user-d", user_id: "user-d", role: "user", users: { id: "user-d", name: "選手3" } },
        ],
        entries: [
          // リレーとは別の種目 (平泳ぎ50m) への、リレーに参加していない選手のエントリー
          {
            id: "entry-1",
            user_id: "user-2",
            style_id: 9,
            entry_time: 45.0,
            note: null,
            users: { id: "user-2", name: "次郎" },
          },
        ],
      });

      // 種目カードは「リレー1枚 + 平泳ぎ1枚」の計2枚
      const headers = await screen.findAllByText(/^entryHeader/);
      expect(headers).toHaveLength(2);

      // リレーの4名の select (泳者選択) はそのまま4件残っている (user-a〜user-d が
      // 割り当てられた select が4件存在する = 4レグ構造が保たれている)
      const allCombos = screen.getAllByRole("combobox") as unknown as HTMLSelectElement[];
      const relayLegSelects = allCombos.filter((s) =>
        ["user-a", "user-b", "user-c", "user-d"].includes(s.value),
      );
      expect(relayLegSelects).toHaveLength(4);

      // 新規追加された平泳ぎカードのタイム入力欄は1件だけ、かつ未入力
      const timeInputs = screen.getAllByPlaceholderText(
        "timePlaceholder",
      ) as HTMLInputElement[];
      expect(timeInputs).toHaveLength(1);
      expect(timeInputs[0].value).toBe("");
    },
  );

  it(
    "リレーの一員 (user_id, style_id) に一致するエントリーが存在していても、" +
      "リレーカード自体には参考ラベルが表示されない (PM確定仕様: 修正3の対象外。" +
      "リレーグループは参考ラベルの表示スポットが無いため常に対象外)（人間の意図: " +
      "リレーの4レグ入力UIには『メンバーごとの参考ラベル』を表示する場所自体が" +
      "存在しない設計になっている [RecordClient.tsx の `!entry.relayEventId` 分岐外]。" +
      "実測 (entryRecordMerge.test.ts で既に固定済みの仕様、PM裁定2026-08-12で妥当と確定: " +
      "リレーのレグとして泳いだ種目と個人種目としてエントリーした同じ種目は別レースなので" +
      "統合してはならない): リレー内選手への一致エントリーは" +
      "リレー行の重複排除材料から除外される設計のため、別の個人種目カードとして" +
      "新規追加される (=カード数は2枚になる)。この新規カードには参考ラベルが表示されて" +
      "よいが、元のリレーカードの4レグ構造・その4行自体には一切参考ラベルが" +
      "付かないことを固定する)",
    async () => {
      const relayRecords = [
        { time: 27.5, is_relaying: false, user_id: "user-a" },
        { time: 28.7, is_relaying: true, user_id: "user-b" },
        { time: 28.3, is_relaying: true, user_id: "user-c" },
        { time: 27.6, is_relaying: true, user_id: "user-d" },
      ].map((r, idx) => ({
        id: `relay-record-${idx}`,
        user_id: r.user_id,
        style_id: 2, // 自由形50m (リレー種目として検出される)
        time: r.time,
        video_path: null,
        note: null,
        is_relaying: r.is_relaying,
        reaction_time: null,
        pool_type: null,
        team_id: "team-1",
        split_times: [],
        users: { id: r.user_id, name: `選手${idx}` },
        styles: { id: 2, name_jp: "自由形50m", distance: 50 },
      }));

      renderRecordClient({
        existingRecords: relayRecords,
        members: [
          ...activeMembers,
          { id: "user-a", user_id: "user-a", role: "user", users: { id: "user-a", name: "選手0" } },
          { id: "user-b", user_id: "user-b", role: "user", users: { id: "user-b", name: "選手1" } },
          { id: "user-c", user_id: "user-c", role: "user", users: { id: "user-c", name: "選手2" } },
          { id: "user-d", user_id: "user-d", role: "user", users: { id: "user-d", name: "選手3" } },
        ],
        // リレーの一員 user-a の (user_id=user-a, style_id=2) に完全一致するエントリーを用意する
        entries: [
          {
            id: "entry-relay-a",
            user_id: "user-a",
            style_id: 2,
            entry_time: 26.0,
            note: null,
            users: { id: "user-a", name: "選手0" },
          },
        ],
      });

      // 実測どおり (entryRecordMerge.test.ts): リレー内選手への一致エントリーは
      // リレー行の重複排除材料から除外され、別の個人種目カードとして新規追加される。
      // カード数は「リレー1枚 + 新規個人カード1枚」の計2枚になる
      const headers = await screen.findAllByText(/^entryHeader/);
      expect(headers).toHaveLength(2);

      // 参考ラベルは site-wide でちょうど1件だけ表示され、かつその値は新規追加された
      // 個人カード側のエントリー (26.0秒) のものである。もしリレー4レグの側にも
      // 参考ラベルが付いてしまうと、この件数は2件以上になるはずなので、
      // 「1件だけ」であることがリレー行への非表示を裏付ける
      const referenceLabels = screen.getAllByText(
        (_, element) => element?.textContent?.replace(/\s+/g, " ").trim() ===
          `entryTimeLabel ${formatTimeBest(26.0)}`,
      );
      expect(referenceLabels).toHaveLength(1);

      // リレーの4レグ構造も変化しない (user-a〜user-d の4件の select が健在)
      const allCombos = screen.getAllByRole("combobox") as unknown as HTMLSelectElement[];
      const relayLegSelects = allCombos.filter((s) =>
        ["user-a", "user-b", "user-c", "user-d"].includes(s.value),
      );
      expect(relayLegSelects).toHaveLength(4);
    },
  );
});

describe("RecordClient — 退会済みメンバーがエントリーに含まれる場合の表示 (V-09)", () => {
  // 実測 (2026-08-12): entries.user_id は
  // `entries_user_id_fkey ... REFERENCES users(id) ON DELETE CASCADE` (初期スキーマ
  // migration 1426行目)。ユーザーアカウント自体が削除されれば entries 行ごと
  // 消える設計のため、「チームを退会した (team_memberships.is_active=false) が
  // ユーザーアカウントは存在する」状態では users テーブルの join は常に解決できる。
  // つまり RecordDataLoader.tsx の entries クエリは team_memberships の
  // is_active でフィルタしていないため、退会済みメンバーの本名がそのまま
  // 表示されるはず、という仮説を立てて検証する。

  it(
    "エントリーの対象ユーザーが現在のアクティブメンバー一覧 (members prop) に含まれて" +
      "いなくても (退会済みを想定)、entries.users の join 由来の氏名がそのまま" +
      "表示される (人間の意図: EntriesDataLoader.tsx の『退会済みメンバー名フォールバック』" +
      "とは異なり、records 画面は entries.users の join を直接使うだけの単純な実装。" +
      "この単純実装でも実際に退会済みメンバーの名前が正しく出るかを実測で確認する)",
    async () => {
      renderRecordClient({
        existingRecords: [],
        // members には含まれない (= アクティブメンバー一覧から退会済み) ユーザーの
        // エントリーだけを渡す
        members: activeMembers,
        entries: [
          {
            id: "entry-retired",
            user_id: "user-retired",
            style_id: 2,
            entry_time: 40.0,
            note: null,
            users: { id: "user-retired", name: "退会太郎" },
          },
        ],
      });

      // 退会済みメンバーの本名がそのまま表示される (フォールバック文言に
      // 置き換わっていない)。氏名は「選択中」チップと記録カード見出しの2箇所に出るため
      // findAllByText で確認する
      expect((await screen.findAllByText("退会太郎")).length).toBeGreaterThan(0);
      // フォールバックキー (competitionRecordsModal.unknownUser) には落ちていない
      expect(screen.queryByText("competitionRecordsModal.unknownUser")).toBeNull();
    },
  );

  it(
    "entries.users の join が null (通常は entries_user_id_fkey の ON DELETE CASCADE に" +
      "より起こり得ない防御的フォールバック) の場合、氏名は i18n キー" +
      "`teams.competitionRecordsModal.unknownUser` 経由の翻訳済み文言に" +
      "フォールバックする (人間の意図: QA初回レビュー時点ではここが非i18n化された" +
      "ハードコード文字列 'Unknown' だったが、Developer が既存キーに置換した" +
      "[RecordClient.tsx:190]。5言語すべてに存在するキーを使っていることを固定し、" +
      "ハードコード文字列への逆戻りを検出する)",
    async () => {
      renderRecordClient({
        existingRecords: [],
        members: activeMembers,
        entries: [
          {
            id: "entry-null-user",
            user_id: "user-ghost",
            style_id: 2,
            entry_time: 40.0,
            note: null,
            users: null,
          },
        ],
      });

      // next-intl はモックしており、値なしの t(key) はキー文字列をそのまま返す
      expect(
        (await screen.findAllByText("competitionRecordsModal.unknownUser")).length,
      ).toBeGreaterThan(0);
      // ハードコードされた英語文字列 "Unknown" には戻っていない
      expect(screen.queryByText("Unknown")).toBeNull();
    },
  );
});

describe("RecordClient — entry_time=0 のバッジ非表示 (Warning 2, 2026-08-12着地確認)", () => {
  it(
    "entry_time=0 のエントリーがあっても参考ラベルは表示されない" +
      "(人間の意図: entry_time は number | null 型であり 0 が有効値として入り得る" +
      "[parseTimeFlexible は通常 0 を返さないため現行 UI からは再現できないが、" +
      "データ移行や直接 DB 編集で入り得る]。RecordClient.tsx:1547 の" +
      "`entryTimeReference != null && entryTimeReference > 0` ガードにより" +
      "0 のときは非表示になることを固定する。mobile 側 " +
      "[teamRecordBulk.entriesFailureRegression.test.tsx] と同一シナリオでパリティ確認)",
    async () => {
      renderRecordClient({
        existingRecords: [],
        entries: [
          {
            id: "entry-zero",
            user_id: "user-1",
            style_id: 2,
            entry_time: 0,
            note: null,
            users: { id: "user-1", name: "太郎" },
          },
        ],
      });

      await waitFor(() => {
        expect(screen.getAllByPlaceholderText("timePlaceholder").length).toBeGreaterThan(0);
      });

      // "entryTimeLabel" というキー文字列そのものがどこにも出ていない
      // (参考ラベルの要素自体が render されていない)
      expect(screen.queryByText("entryTimeLabel")).toBeNull();
      expect(
        screen.queryByText((_, element) => (element?.textContent ?? "").includes("entryTimeLabel")),
      ).toBeNull();
    },
  );
});
