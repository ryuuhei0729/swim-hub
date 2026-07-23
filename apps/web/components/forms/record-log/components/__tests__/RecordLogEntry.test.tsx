/**
 * RecordLogEntry テスト — エントリータイム誤表示バグの回帰検証
 *
 * バグ症状 (実機報告):
 *   CompetitionTabModal のレースレコードタブで、無関係な種目のエントリータイム
 *   (別の 200IM エントリー 2:22.20) が 50Fr レコード欄に「エントリータイム: 2:22.20」
 *   と誤表示された。原因は entryInfo が index ベースで渡され、レコードの種目と
 *   対応しているとは限らないのに種目を確認せず表示していたこと。
 *
 * 修正: entryInfo.styleId とレコードの現在の種目 (formData.styleId) が一致する
 *       場合のみバッジを表示する `entryMatchesCurrentStyle` ガードを追加。
 *
 * 検証観点:
 *   [バグ再現→解消] entryInfo の種目とレコードの種目が異なる場合、バッジ非表示
 *   [正常系維持]     entryInfo の種目とレコードの種目が一致する場合、バッジ表示
 *   [自動生成フロー] useRecordLogForm の初期化 (entryDataList[i] と formData[i] が
 *                    同一種目) を模したケースでバッジが表示される
 *   [リレー観点]     EntryInfo に isRelaying が存在しないため、styleId 一致のみで
 *                    判定される仕様であることの確認 (別途レポートで考察)
 *
 * トートロジー防止メモ:
 *   実装の `entryMatchesCurrentStyle` 式をそのまま検証するのではなく、
 *   「DOM 上にバッジ文言 (エントリータイム: ...) が出るか出ないか」という
 *   ユーザーから見える結果を検証する。
 */

import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import messages from "@apps/shared/messages/ja.json";
import type { EntryInfo } from "@apps/shared/types/ui";
import type { RecordLogFormState, StyleOption } from "@/components/forms/record-log/types";
import RecordLogEntry from "../RecordLogEntry";

vi.mock("@/components/video/VideoUploader", () => ({
  __esModule: true,
  default: () => null,
}));

const renderWithIntl = (ui: ReactElement) =>
  render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      {ui}
    </NextIntlClientProvider>,
  );

// 50m自由形 (Fr, id=2) / 200m個人メドレー (IM, id=21)
const styles: StyleOption[] = [
  { id: 2, nameJp: "50m自由形", distance: 50 },
  { id: 21, nameJp: "200m個人メドレー", distance: 200 },
];

const makeFormData = (overrides: Partial<RecordLogFormState> = {}): RecordLogFormState => ({
  styleId: "2",
  time: 0,
  timeDisplayValue: "",
  isRelaying: false,
  splitTimes: [],
  note: "",
  videoPath: null,
  videoThumbnailPath: null,
  reactionTime: "",
  ...overrides,
});

const noop = () => {};
const commonHandlers = {
  onTimeChange: noop,
  onToggleRelaying: noop,
  onNoteChange: noop,
  onVideoPathChange: noop,
  onVideoDelete: noop,
  onReactionTimeChange: noop,
  onStyleChange: noop,
  onAddSplitTime: noop,
  onAddSplitTimesEvery25m: noop,
  onAddSplitTimesEvery50m: noop,
  onRemoveSplitTime: noop,
  onSplitTimeChange: noop,
};

describe("RecordLogEntry — エントリータイムバッジの種目一致ガード", () => {
  it("[バグ再現→解消] entryInfo の種目 (200IM) がレコードの種目 (50Fr) と異なる場合、エントリータイムバッジは表示されない", () => {
    const mismatchedEntry: EntryInfo = {
      styleId: 21, // 200IM のエントリー
      styleName: "200m個人メドレー",
      entryTime: 142.2, // 2:22.20
    };

    renderWithIntl(
      <RecordLogEntry
        formData={makeFormData({ styleId: "2" })} // レコードは 50Fr
        index={0}
        entryInfo={mismatchedEntry}
        styles={styles}
        poolType={0}
        bestTimes={[]}
        isLoading={false}
        {...commonHandlers}
      />,
    );

    expect(screen.queryByText(/エントリータイム/)).not.toBeInTheDocument();
    expect(screen.queryByText(/2:22\.20/)).not.toBeInTheDocument();
  });

  it("[正常系維持] entryInfo の種目 (50Fr) がレコードの種目 (50Fr) と一致する場合、エントリータイムバッジが表示される", () => {
    const matchedEntry: EntryInfo = {
      styleId: 2, // 50Fr のエントリー
      styleName: "50m自由形",
      entryTime: 30.5,
    };

    renderWithIntl(
      <RecordLogEntry
        formData={makeFormData({ styleId: "2" })}
        index={0}
        entryInfo={matchedEntry}
        styles={styles}
        poolType={0}
        bestTimes={[]}
        isLoading={false}
        {...commonHandlers}
      />,
    );

    expect(screen.getByText(/エントリータイム/)).toBeInTheDocument();
    expect(screen.getByText(/30\.50/)).toBeInTheDocument();
  });

  it("entryTime が 0 以下の場合はバッジを表示しない (種目一致でも)", () => {
    const zeroTimeEntry: EntryInfo = {
      styleId: 2,
      styleName: "50m自由形",
      entryTime: 0,
    };

    renderWithIntl(
      <RecordLogEntry
        formData={makeFormData({ styleId: "2" })}
        index={0}
        entryInfo={zeroTimeEntry}
        styles={styles}
        poolType={0}
        bestTimes={[]}
        isLoading={false}
        {...commonHandlers}
      />,
    );

    expect(screen.queryByText(/エントリータイム/)).not.toBeInTheDocument();
  });

  it("entryInfo 自体が未指定の場合はバッジを表示しない", () => {
    renderWithIntl(
      <RecordLogEntry
        formData={makeFormData({ styleId: "2" })}
        index={0}
        entryInfo={undefined}
        styles={styles}
        poolType={0}
        bestTimes={[]}
        isLoading={false}
        {...commonHandlers}
      />,
    );

    expect(screen.queryByText(/エントリータイム/)).not.toBeInTheDocument();
  });

  it("[リレー観点] EntryInfo は isRelaying を持たないため、レコードが isRelaying=true でも種目一致のみでバッジが表示される", () => {
    // NOTE: entries テーブルには (competition_id, user_id, style_id) の UNIQUE 制約があり、
    // is_relaying はこのキーに含まれない。そのため同一大会・同一ユーザーが同一種目で
    // 個人/リレー両方のエントリーを持つことは DB 上そもそも作れない。
    // よって styleId 一致のみで判定する現行仕様は、この制約が変わらない限り安全である。
    const entry: EntryInfo = { styleId: 2, styleName: "50m自由形", entryTime: 30.5 };

    renderWithIntl(
      <RecordLogEntry
        formData={makeFormData({ styleId: "2", isRelaying: true })}
        index={0}
        entryInfo={entry}
        styles={styles}
        poolType={0}
        bestTimes={[]}
        isLoading={false}
        {...commonHandlers}
      />,
    );

    expect(screen.getByText(/エントリータイム/)).toBeInTheDocument();
  });

  it("[自動生成フロー] レコードの種目を後から変更すると、種目不一致になりバッジが消える (index一致だけに依存しないことの確認)", () => {
    // useRecordLogForm の自動生成直後は record[i].styleId === entryDataList[i].styleId
    // で一致しているが、ユーザーが種目ボタンでレコードの種目だけを変更した場合
    // (entryInfo は index ベースのまま更新されない) にバッジが正しく消えることを確認する。
    const originalEntry: EntryInfo = {
      styleId: 2, // 自動生成時点では 50Fr のエントリーに対応していた
      styleName: "50m自由形",
      entryTime: 30.5,
    };

    const { rerender } = renderWithIntl(
      <RecordLogEntry
        formData={makeFormData({ styleId: "2" })}
        index={0}
        entryInfo={originalEntry}
        styles={styles}
        poolType={0}
        bestTimes={[]}
        isLoading={false}
        {...commonHandlers}
      />,
    );
    expect(screen.getByText(/エントリータイム/)).toBeInTheDocument();

    // ユーザーがこのレコードの種目を 200IM に変更 (entryInfo は据え置き = 実際のバグ発生条件)
    rerender(
      <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
        <RecordLogEntry
          formData={makeFormData({ styleId: "21" })}
          index={0}
          entryInfo={originalEntry}
          styles={styles}
          poolType={0}
          bestTimes={[]}
          isLoading={false}
          {...commonHandlers}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.queryByText(/エントリータイム/)).not.toBeInTheDocument();
  });
});
