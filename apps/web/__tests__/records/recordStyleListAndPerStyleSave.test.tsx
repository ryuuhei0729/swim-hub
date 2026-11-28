/**
 * RecordClient — 種目一覧 → 種目ごとの入力・保存 (#114: web を mobile に寄せる)
 *
 * mobile (TeamRecordStyleListScreen → TeamRecordStyleDetailScreen) と同じ組み立てに
 * なっていることを確かめる:
 *   - selection が無いと種目カードの一覧を出し、カードに入力済みの人数 (リレーはチーム数)
 *     とエントリー人数を出す。長水路では 25m 種目を既定で隠す (記録があれば出す)
 *   - カードを押すと、その種目を開いた URL (?style= / ?relay=) へ遷移する
 *   - 種目の入力画面の保存は、その種目の records / relay_records だけに触れる
 *   - 保存できたら種目一覧へ戻る。未保存のまま戻ろうとすると確認を出す
 */
import React from "react";
import {
  renderWithQueryClient as render,
  screen,
  waitFor,
  fireEvent,
} from "@/__tests__/helpers/teamQueryTestUtils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Style } from "@apps/shared/types";
import {
  buildRecordSaveSupabaseMock,
  type RecordSaveSupabaseMock,
} from "../utils/supabaseRecordSaveMock";
import RecordClient from "../../app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/records/_client/RecordClient";

vi.mock("@/components/video/TeamVideoUploader", () => ({ default: () => null }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

vi.mock("next-intl", async (importOriginal) => {
  const original = await importOriginal<typeof import("next-intl")>();
  return {
    ...original,
    // 件数などの補間値も DOM で検証できるよう、値を文字列に埋め込んで返す
    useTranslations: () =>
      ((key: string, values?: Record<string, unknown>) =>
        values ? `${key}::${JSON.stringify(values)}` : key) as unknown as ReturnType<
        typeof original.useTranslations
      >,
    useLocale: () => "ja",
  };
});

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

let fake: RecordSaveSupabaseMock;

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: fake.supabase, subscription: null }),
}));

const STYLE_FREE_25: Style = { id: 1, name_jp: "自由形25m", name: "Freestyle", style: "Fr", distance: 25 };
const STYLE_FREE_50: Style = { id: 2, name_jp: "自由形50m", name: "Freestyle", style: "Fr", distance: 50 };
const STYLE_BREAST_50: Style = { id: 9, name_jp: "平泳ぎ50m", name: "Breaststroke", style: "Br", distance: 50 };
const STYLES = [STYLE_FREE_25, STYLE_FREE_50, STYLE_BREAST_50];

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

const members = ["太郎", "次郎", "三郎", "四郎", "五郎"].map((name, idx) => ({
  id: `user-${idx + 1}`,
  user_id: `user-${idx + 1}`,
  role: idx === 0 ? "admin" : "user",
  users: { id: `user-${idx + 1}`, name, gender: 0 },
}));

type ExistingRecordFixture = Parameters<typeof RecordClient>[0]["existingRecords"][number];

function makeRecord(opts: {
  id: string;
  userId: string;
  styleId: number;
  time: number;
  isRelaying?: boolean;
}): ExistingRecordFixture {
  const style = STYLES.find((s) => s.id === opts.styleId)!;
  return {
    id: opts.id,
    user_id: opts.userId,
    style_id: opts.styleId,
    time: opts.time,
    video_path: null,
    note: null,
    is_relaying: opts.isRelaying ?? false,
    reaction_time: null,
    pool_type: null,
    team_id: "team-1",
    split_times: [],
    users: { id: opts.userId, name: members.find((m) => m.user_id === opts.userId)!.users.name },
    styles: { id: style.id, name_jp: style.name_jp, distance: style.distance },
  };
}

/**
 * 自由形50m 2名 (太郎・次郎) + 平泳ぎ50m 1名 (三郎) + 4x50m フリーリレー 1組。
 * リレーは is_relaying = [false, true, true, true] の連続4件 (Phase 1 で検出される)。
 */
const MIXED_RECORDS: ExistingRecordFixture[] = [
  makeRecord({ id: "rec-taro", userId: "user-1", styleId: 2, time: 27.5 }),
  makeRecord({ id: "rec-jiro", userId: "user-2", styleId: 2, time: 28.5 }),
  makeRecord({ id: "rec-saburo", userId: "user-3", styleId: 9, time: 35.0 }),
  makeRecord({ id: "relay-0", userId: "user-1", styleId: 2, time: 27.0 }),
  makeRecord({ id: "relay-1", userId: "user-2", styleId: 2, time: 26.8, isRelaying: true }),
  makeRecord({ id: "relay-2", userId: "user-4", styleId: 2, time: 26.6, isRelaying: true }),
  makeRecord({ id: "relay-3", userId: "user-5", styleId: 2, time: 26.4, isRelaying: true }),
];

type RecordClientProps = Parameters<typeof RecordClient>[0];

function renderRecordClient(overrides: Partial<RecordClientProps> = {}) {
  return render(
    <RecordClient
      teamId="team-1"
      competitionId="comp-1"
      competition={baseCompetition}
      teamName="テストチーム"
      members={members}
      existingRecords={MIXED_RECORDS}
      styles={STYLES}
      entries={[]}
      bestTimesByUser={{}}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  fake = buildRecordSaveSupabaseMock();
  mocks.push.mockClear();
});

describe("RecordClient — 種目一覧 (selection なし)", () => {
  it("種目カードに入力済みの人数・リレーのチーム数・エントリー人数が出る (mobile の一覧カードと同じ)", () => {
    renderRecordClient({
      entries: [
        { id: "entry-1", user_id: "user-3", style_id: 9, entry_time: 36.0, note: null, users: { id: "user-3", name: "三郎" } },
        { id: "entry-2", user_id: "user-4", style_id: 9, entry_time: 37.0, note: null, users: { id: "user-4", name: "四郎" } },
      ],
    });

    const free50 = screen.getByTestId("record-style-card-2");
    expect(free50.textContent).toContain('recordList.filledCountIndividual::{"n":2}');

    // 平泳ぎ50m: タイム入力済みは三郎の1名。エントリーは2名 (四郎はエントリー由来の未入力行)
    const breast50 = screen.getByTestId("record-style-card-9");
    expect(breast50.textContent).toContain('recordList.filledCountIndividual::{"n":1}');
    expect(breast50.textContent).toContain('recordList.entryCountLabel::{"n":2}');

    // 記録の無い種目は「未入力」
    expect(screen.getByTestId("record-style-card-1").textContent).toContain("recordList.emptyLabel");

    // リレーは組 (チーム) の数を出す
    expect(screen.getByTestId("record-relay-card-relay_4x50_free").textContent).toContain(
      'recordList.filledCountRelay::{"n":1}',
    );
    expect(screen.getByTestId("record-relay-card-relay_4x100_medley").textContent).toContain(
      "recordList.emptyLabel",
    );

    // 入力欄・保存ボタンは一覧には無い (種目を選んでから入力する)
    expect(screen.queryByRole("button", { name: "record.saveButton" })).toBeNull();
  });

  it("長水路の大会では、記録の無い 25m 種目と 4x25m リレーを隠す (記録がある 25m 種目は出す)", () => {
    const { unmount } = renderRecordClient({
      competition: { ...baseCompetition, pool_type: 1 },
      existingRecords: [],
    });
    expect(screen.queryByTestId("record-style-card-1")).toBeNull();
    expect(screen.getByTestId("record-style-card-2")).toBeDefined();
    expect(screen.queryByTestId("record-relay-card-relay_4x25_free")).toBeNull();
    expect(screen.queryByTestId("record-relay-card-relay_4x25_medley")).toBeNull();
    unmount();

    renderRecordClient({
      competition: { ...baseCompetition, pool_type: 1 },
      existingRecords: [makeRecord({ id: "rec-25", userId: "user-1", styleId: 1, time: 12.5 })],
    });
    expect(screen.getByTestId("record-style-card-1")).toBeDefined();
  });

  it("カードを押すと、その種目を開いた URL (?style= / ?relay=) へ遷移する", () => {
    renderRecordClient();

    fireEvent.click(screen.getByTestId("record-style-card-9"));
    expect(mocks.push).toHaveBeenLastCalledWith("/teams/team-1/competitions/comp-1/records?style=9");

    fireEvent.click(screen.getByTestId("record-relay-card-relay_4x50_free"));
    expect(mocks.push).toHaveBeenLastCalledWith(
      "/teams/team-1/competitions/comp-1/records?relay=relay_4x50_free",
    );
  });

  it("マスターに無い種目の selection は種目一覧として扱う (不正な URL で空の入力画面を出さない)", () => {
    renderRecordClient({ selection: { kind: "individual", styleId: 999 } });

    expect(screen.getByTestId("record-style-card-2")).toBeDefined();
    expect(screen.queryByRole("button", { name: "record.saveButton" })).toBeNull();
  });
});

describe("RecordClient — 種目ごとの保存", () => {
  it("個人種目 (自由形50m) を保存すると、その種目の2行だけが UPDATE され、平泳ぎ・リレーの行とリレー記録には触れない", async () => {
    renderRecordClient({ selection: { kind: "individual", styleId: 2 } });

    // 自由形50mの個人種目の行 (太郎・次郎) だけが入力欄に出る (リレーのレグは混ざらない)
    expect(screen.getAllByPlaceholderText("timePlaceholder")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "record.saveButton" }));

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/teams/team-1/competitions/comp-1/records");
    });

    const updatedIds = fake.updateCalls
      .filter((c) => c.table === "records")
      .map((c) => c.eq[0]?.value)
      .sort();
    expect(updatedIds).toEqual(["rec-jiro", "rec-taro"]);
    expect(fake.inCalls.filter((c) => c.table === "records" && c.op === "delete")).toHaveLength(0);
    expect(fake.insertCalls.filter((c) => c.table === "records")).toHaveLength(0);
    expect(fake.inCalls.filter((c) => c.table === "relay_record_legs")).toHaveLength(0);
    expect(fake.insertCalls.filter((c) => c.table === "relay_records")).toHaveLength(0);
  });

  it("リレー種目を保存すると、そのリレーの4レグだけが UPDATE され、リレー記録の置き換え範囲もその4レグから辿るものに限られる", async () => {
    renderRecordClient({ selection: { kind: "relay", relayEventId: "relay_4x50_free" } });

    fireEvent.click(screen.getByRole("button", { name: "record.saveButton" }));

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/teams/team-1/competitions/comp-1/records");
    });

    const updatedIds = fake.updateCalls
      .filter((c) => c.table === "records")
      .map((c) => c.eq[0]?.value)
      .sort();
    expect(updatedIds).toEqual(["relay-0", "relay-1", "relay-2", "relay-3"]);

    // 置き換える relay_records は、このリレーの4レグの records.id から辿る
    // (個人種目の rec-taro / rec-jiro / rec-saburo を混ぜない)
    const legScopeSelect = fake.inCalls.filter(
      (c) => c.table === "relay_record_legs" && c.op === "select",
    );
    expect(legScopeSelect).toHaveLength(1);
    expect([...(legScopeSelect[0]?.values ?? [])].sort()).toEqual([
      "relay-0",
      "relay-1",
      "relay-2",
      "relay-3",
    ]);
    expect(fake.insertCalls.filter((c) => c.table === "relay_records")).toHaveLength(1);
  });

  it("リレーに組 (別チーム) を足しても、何も入力していない組は保存の検証から外れる (mobile と同じ)", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    renderRecordClient({ selection: { kind: "relay", relayEventId: "relay_4x50_free" } });

    fireEvent.click(screen.getByRole("button", { name: 'record.addHeatButton::{"n":2}' }));
    // 組が2つになると組の見出しが出る
    expect(screen.getAllByText(/^record\.groupNumber/)).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "record.saveButton" }));

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/teams/team-1/competitions/comp-1/records");
    });
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("保存に失敗したら種目一覧へ戻らず、入力を残す", async () => {
    fake = buildRecordSaveSupabaseMock({
      updateError: (table) => (table === "records" ? { message: "boom" } : null),
    });
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    renderRecordClient({ selection: { kind: "individual", styleId: 9 } });

    fireEvent.click(screen.getByRole("button", { name: "record.saveButton" }));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith("error.saveFailed");
    });
    expect(mocks.push).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});

describe("RecordClient — 未保存のまま種目一覧へ戻るときの確認", () => {
  it("入力を変えてから戻るボタンを押すと確認を出し、「戻る」を選ぶと種目一覧へ戻る", () => {
    renderRecordClient({ selection: { kind: "individual", styleId: 9 } });

    fireEvent.change(screen.getByPlaceholderText("timePlaceholder"), {
      target: { value: "34.50" },
    });
    fireEvent.click(screen.getByRole("button", { name: "recordList.backToList" }));

    // まだ遷移しない (確認ダイアログを出す)
    expect(mocks.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "confirmBack" }));

    expect(mocks.push).toHaveBeenCalledWith("/teams/team-1/competitions/comp-1/records");
  });

  it("確認で「編集を続ける」を選ぶと、入力したまま留まる", () => {
    renderRecordClient({ selection: { kind: "individual", styleId: 9 } });

    fireEvent.change(screen.getByPlaceholderText("timePlaceholder"), {
      target: { value: "34.50" },
    });
    fireEvent.click(screen.getByRole("button", { name: "record.cancelButton" }));
    fireEvent.click(screen.getByRole("button", { name: "cancel" }));

    expect(mocks.push).not.toHaveBeenCalled();
    expect((screen.getByPlaceholderText("timePlaceholder") as HTMLInputElement).value).toBe("34.50");
  });
});
