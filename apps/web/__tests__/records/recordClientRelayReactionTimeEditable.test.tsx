/**
 * RecordClient — チーム代理入力: リレー ON でもリアクションタイムを入力できること (web)
 *
 * 人間の意図:
 *   コーチが代理入力する際、選手のリレー引き継ぎタイム (RT) は「リレー ON」の状態でこそ
 *   記録したい値である。以前は `{!mr.isRelaying && (...)}` で RT 入力欄自体を非表示にしており、
 *   コーチが選手をリレー ON にした瞬間に入力欄が消えて記録できなくなっていた
 *   (実害: 引き継ぎ RT が代理入力できない)。
 *
 * ここで固定する契約:
 *   - リレー ON (`isRelaying: true`) の状態で描画しても RT 入力欄が存在し、編集できる
 *   - 「リレー」チェックボックスを OFF → ON にトグルしても RT 入力欄が消えず、
 *     既に入力していた値も保持される
 *   - RT に入力した値は isRelaying の状態に関わらず state に反映される
 *
 * ミューテーションでの実証 (作業ログ):
 *   `{!mr.isRelaying && (...)}` で RT 入力欄を再度ラップすると、本ファイルの
 *   全テストが「見つからない (TestingLibraryElementError)」で red になることを
 *   手動で確認済み (production コードは検証後に原状復帰)。
 *
 * トートロジー回避:
 *   RT の disabled 判定や表示条件をこのテスト内で再実装しない。
 *   「入力欄が見つかるか」「入力した値が画面に反映されるか」という
 *   観察可能な結果だけを assert する。
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
    useTranslations: () => ((key: string, values?: Record<string, unknown>) =>
      values ? `${key}::${JSON.stringify(values)}` : key) as unknown as ReturnType<
      typeof original.useTranslations
    >,
    useLocale: () => "ja",
  };
});

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({
    supabase: { from: () => ({ select: () => ({ eq: () => ({}) }) }) },
    subscription: null,
  }),
}));

const STYLE_FR_50: Style = { id: 2, name_jp: "自由形50m", name: "Freestyle", style: "Fr", distance: 50 };
const STYLES = [STYLE_FR_50];

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
  { id: "u-aoi", user_id: "u-aoi", role: "admin", users: { id: "u-aoi", name: "アオイ", gender: 0 } },
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
  reactionTime?: number | null;
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
    reaction_time: opts.reactionTime ?? null,
    pool_type: null,
    team_id: "team-1",
    split_times: [],
    users: { id: opts.userId, name: opts.name },
    styles: { id: style.id, name_jp: style.name_jp, distance: style.distance },
  };
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
      bestTimesByUser={{}}
    />,
  );
}

describe("RecordClient — リレー ON でも RT (リアクションタイム) を入力できる", () => {
  it("既存記録が isRelaying=true の状態で描画しても RT 入力欄が存在し、既存値が表示される", () => {
    renderRecordClient([
      makeRecord({
        id: "r1",
        userId: "u-aoi",
        name: "アオイ",
        styleId: 2,
        time: 27.0,
        isRelaying: true,
        reactionTime: 0.55,
      }),
    ]);

    const rtInput = screen.getByDisplayValue("0.55") as HTMLInputElement;
    expect(rtInput).toBeDefined();
    expect(rtInput.disabled).toBe(false);
  });

  it("「リレー」チェックを OFF → ON にトグルしても RT 入力欄が消えず、入力済みの値が保持される", () => {
    renderRecordClient([
      makeRecord({
        id: "r1",
        userId: "u-aoi",
        name: "アオイ",
        styleId: 2,
        time: 27.0,
        isRelaying: false,
        reactionTime: 0.62,
      }),
    ]);

    // OFF の時点でも RT 欄は存在する (このスプリント以前から分岐が無かった側)
    expect(screen.getByDisplayValue("0.62")).toBeDefined();

    const relayCheckbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(relayCheckbox.checked).toBe(false);
    fireEvent.click(relayCheckbox);
    expect(relayCheckbox.checked).toBe(true);

    // ON にトグルした後も RT 欄が引き続き存在し、値が消えていない
    const rtInputAfterToggle = screen.getByDisplayValue("0.62") as HTMLInputElement;
    expect(rtInputAfterToggle).toBeDefined();
    expect(rtInputAfterToggle.disabled).toBe(false);
  });

  it("リレー ON の状態で RT に新しい値を入力すると画面に反映される (isRelaying による入力拒否が無い)", () => {
    renderRecordClient([
      makeRecord({
        id: "r1",
        userId: "u-aoi",
        name: "アオイ",
        styleId: 2,
        time: 27.0,
        isRelaying: true,
        reactionTime: null,
      }),
    ]);

    const rtInput = screen.getByPlaceholderText("0.65") as HTMLInputElement;
    fireEvent.change(rtInput, { target: { value: "0.71" } });

    expect(screen.getByDisplayValue("0.71")).toBeDefined();
  });
});
