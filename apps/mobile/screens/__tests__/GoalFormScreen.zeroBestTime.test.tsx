// Sprint Contract (goal start time autofill) S3: ベストの time が 0 以下なら初期タイムに入れない (mobile)。
// GoalFormScreen.test.tsx は「載せ替えで挙動不変」の判定基準として無改変で残す約束のため、ハーネスは
// そこから切り出せない。必要最小限のモックだけをここに再定義している (3ファイル目になる場合はヘルパーへ切り出すこと)。
// 壊したら赤: `best?.time ?? null` に戻す (0 が入る) / 負数を採る
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({
  getSelectableCompetitions: vi.fn(),
  getBestTimes: vi.fn(),
  getStyles: vi.fn(),
  createGoal: vi.fn(),
  params: {} as { goalId?: string },
}));

vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  return {
    ...original,
    TextInput: ({ onChangeText, value, editable, testID, ...props }: { onChangeText?: (t: string) => void; value?: string; editable?: boolean; testID?: string } & Record<string, unknown>) =>
      React.createElement("input", {
        type: "text", ...props, "data-testid": testID, value, disabled: editable === false,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChangeText?.(e.target.value),
      }),
  };
});
vi.mock("@/contexts/AuthProvider", () => ({ useAuth: () => ({ supabase: {}, user: { id: "u1" } }) }));
vi.mock("@apps/shared/api/goals", () => ({
  GoalAPI: class {
    createGoal = h.createGoal;
    updateGoal = vi.fn();
    getSelectableCompetitions = h.getSelectableCompetitions;
    getGoalWithMilestones = vi.fn();
  },
}));
vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: class {
    getBestTimes = h.getBestTimes;
    createCompetition = vi.fn();
    updateCompetition = vi.fn();
  },
}));
vi.mock("@apps/shared/api/styles", () => ({ StyleAPI: class { getStyles = h.getStyles; } }));
vi.mock("@apps/shared/hooks/queries/teams", () => ({ useTeamsQuery: () => ({ teams: [], isLoading: false }) }));
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ goBack: vi.fn(), dispatch: vi.fn() }),
  useRoute: () => ({ params: h.params }),
  usePreventRemove: () => {},
}));
vi.mock("@/components/forms/StyleChipSelector", () => ({
  StyleChipSelector: ({ styles, onChange }: { styles: Array<{ id: number }>; onChange: (id: string) => void }) => (
    <div>
      {styles.map((s) => (
        <button key={s.id} data-testid={`style-${s.id}`} onClick={() => onChange(String(s.id))}>{`style-${s.id}`}</button>
      ))}
    </div>
  ),
}));
vi.mock("@/components/ui/DatePickerField", () => ({
  DatePickerField: ({ value }: { value: string }) => <button data-value={value}>date</button>,
}));
vi.mock("@/components/ui/SlideUpModal", () => ({
  SlideUpModal: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => (visible ? <div data-testid="sheet">{children}</div> : null),
}));

import { GoalFormScreen } from "../GoalFormScreen";

const STYLES = [
  { id: 1, name_jp: "100m 自由形", name: "100m Fr", style: "Fr", distance: 100 },
  { id: 2, name_jp: "50m 自由形", name: "50m Fr", style: "Fr", distance: 50 },
];
const COMPS = [
  { id: "c1", title: "短水路杯", date: "2099-11-01", pool_type: 0, team_id: null, place: null },
  { id: "c2", title: "長水路杯", date: "2099-12-01", pool_type: 1, team_id: null, place: null },
];
const bt = (o: Record<string, unknown>) => ({
  id: "b", created_at: "", is_relaying: false, style: { name_jp: "x", distance: 100 }, ...o,
});
// 種目1 短水路: time=0 (非リレー) + 有効なリレー行 / 種目1 長水路: 負数 / 種目2 長水路: 正常 27
const BESTS = [
  bt({ id: "s1-short-zero", style_id: 1, pool_type: 0, time: 0 }),
  bt({ id: "s1-short-relay", style_id: 1, pool_type: 0, time: 50, is_relaying: true }),
  bt({ id: "s1-long-neg", style_id: 1, pool_type: 1, time: -1 }),
  bt({ id: "s2-long", style_id: 2, pool_type: 1, time: 27 }),
];

let qc: QueryClient;
const flush = async () => { for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 50)); }); };
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 80)); });
const startVal = () => (screen.getByTestId("goal-start-time") as HTMLInputElement).value;
const pickStyle = async (id: number) => { fireEvent.click(screen.getByTestId(`style-${id}`)); await settle(); };
async function pickCompetition(title: string) {
  fireEvent.click(Array.from(document.querySelectorAll('[accessibilitylabel="大会"]'))[0] as HTMLElement);
  const opt = Array.from(document.querySelectorAll('[data-testid="sheet"] button')).find((b) => b.textContent?.includes(title))!;
  expect(opt, `ピッカーに ${title} が無い`).toBeTruthy();
  fireEvent.click(opt);
  await settle();
}

beforeEach(() => {
  h.params = {};
  h.getSelectableCompetitions.mockReset().mockResolvedValue(COMPS);
  h.getBestTimes.mockReset().mockResolvedValue(BESTS);
  h.getStyles.mockReset().mockResolvedValue(STYLES);
  h.createGoal.mockReset().mockResolvedValue({ id: "new" });
  vi.spyOn(console, "error").mockImplementation(() => {});
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("time <= 0 のベストは初期タイムに入れない (mobile)", () => {
  const open = async () => {
    render(<QueryClientProvider client={qc}><GoalFormScreen /></QueryClientProvider>);
    await flush();
  };

  it("time=0 の非リレー行 (有効なリレー行あり) は 0 も 50 も入らず空のまま。ベストは取得済み", async () => {
    await open();
    await pickCompetition("短水路杯");
    await pickStyle(1);
    expect(h.getBestTimes).toHaveBeenCalledTimes(1);
    expect(startVal()).toBe("");
  });

  it("time が負数の行も入らず空のまま", async () => {
    await open();
    await pickCompetition("長水路杯");
    await pickStyle(1);
    expect(startVal()).toBe("");
  });

  it("手入力があっても 0 以下なら『該当なし』扱いで空に戻る。正常な種目2 では 27.00 が入る (取得自体は機能している)", async () => {
    await open();
    await pickCompetition("長水路杯");
    await pickStyle(2);
    expect(startVal()).toBe("27.00");
    await pickStyle(1);
    expect(startVal()).toBe("");
  });

  it("空のまま保存すると startTime=null (0 が保存されない)", async () => {
    await open();
    await pickCompetition("短水路杯");
    await pickStyle(1);
    fireEvent.change(screen.getByTestId("goal-target-time"), { target: { value: "1:00.00" } });
    await act(async () => { fireEvent.click(screen.getByText("作成")); await new Promise((r) => setTimeout(r, 20)); });
    expect(h.createGoal).toHaveBeenCalledTimes(1);
    expect(h.createGoal.mock.calls[0]![0].startTime).toBeNull();
  });
});
