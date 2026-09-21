// =============================================================================
// MainStack.teamDetailInstant.test.tsx — QA Sprint Contract Phase A スケルトン
// =============================================================================
//
// 対象: apps/mobile/navigation/MainStack.tsx の TeamDetail の options
//       apps/mobile/navigation/types.ts の MainStackParamList["TeamDetail"]
//
// ■ 背景 (スコープB 項目3 / PM 採用の A 案)
//   「チームタブを押しても遷移していないように見える」の真因は遷移の欠如ではなく、
//   タブ切替で TeamsScreen が前面に出たうえを TeamDetail がスライドアニメーションで
//   覆うこと。よって TabNavigator の tabPress からの遷移だけ animation を切る。
//     - types.ts: TeamDetail に instant?: boolean を追加
//     - MainStack.tsx: options を関数形式にし
//       animation: route.params?.instant ? "none" : "default"
//     - e.preventDefault() は **追加しない** (既存 [V-12] が pin)
//
// ■ Sprint Contract 検証観点
//   [V-B10] instant: true のとき TeamDetail の animation は "none"
//   [V-B11] instant 未指定のとき animation は "default"
//   [V-B12] instant: false のとき animation は "default"
//           (false を "none" に落とす実装ミス = truthy 判定の取り違えを検出)
//   [V-B13] instant によってヘッダー系オプション (title 等) が変わらない
//           — 項目1の「ヘッダータイトルにチーム名」は TeamDetailScreen 側の
//             setOptions が担当する。MainStack 側の title はその既定値であり、
//             instant の有無で揺れてはいけない
//   [V-B14] options は関数形式である (静的オブジェクトのままだと route を読めない)
//
// ■ jsdom で検証できないことの明示
//   実際に画面がスライドせず即座に差し替わるかは **ネイティブの遷移**であり
//   jsdom では原理的に再現できない。ここで保証するのは
//   「react-navigation に animation:"none" が渡っている」ところまで。
//   体感は Android エミュレータ/実機での目視確認項目 (M-01) に回す。
//
// ■ テスト方針
//   MainStack 全体を実描画すると 20 近い画面が起動するため、画面はすべて null
//   スタブに差し替え、createNativeStackNavigator をこのファイル限定で上書きして
//   <Stack.Screen> に渡された props を記録する。options の評価は
//   **実プロダクションコードの関数をそのまま呼ぶ** (ロジックの再実装はしない)。
// =============================================================================

import { render } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/screens/PracticeFormScreen", () => ({ PracticeFormScreen: () => null }));
vi.mock("@/screens/PracticeLogFormScreen", () => ({ PracticeLogFormScreen: () => null }));
vi.mock("@/screens/PracticeTabFormScreen", () => ({ PracticeTabFormScreen: () => null }));
vi.mock("@/screens/PracticeTimeFormScreen", () => ({ PracticeTimeFormScreen: () => null }));
vi.mock("@/screens/RecordFormScreen", () => ({ RecordFormScreen: () => null }));
vi.mock("@/screens/CompetitionBasicFormScreen", () => ({ CompetitionBasicFormScreen: () => null }));
vi.mock("@/screens/CompetitionTabFormScreen", () => ({ CompetitionTabFormScreen: () => null }));
vi.mock("@/screens/EntryLogFormScreen", () => ({ EntryLogFormScreen: () => null }));
// TeamRecordBulkFormScreen (旧・チーム大会記録の代理入力画面) は2階層化に伴い
// TeamRecordStyleListScreen (一覧) / TeamRecordStyleDetailScreen (詳細) の
// 2画面に置き換わった (MainStack.tsx の TeamRecordBulkForm /
// TeamRecordBulkFormDetail ルート定義を参照)。旧画面へのモックのままだと
// MainStack が実際に import する新2画面が未モック化のまま実モジュールとして
// 読み込まれ、依存チェーン経由で expo-auth-session (expo-modules-core の
// CodedError 未モック) に到達して落ちる (QA Sprint Contract Phase B で修正)。
vi.mock("@/screens/TeamRecordStyleListScreen", () => ({
  TeamRecordStyleListScreen: () => null,
}));
vi.mock("@/screens/TeamRecordStyleDetailScreen", () => ({
  TeamRecordStyleDetailScreen: () => null,
}));
vi.mock("@/screens/TeamPracticeLogBulkFormScreen", () => ({
  TeamPracticeLogBulkFormScreen: () => null,
}));
vi.mock("@/screens/TeamEntryBulkFormScreen", () => ({ TeamEntryBulkFormScreen: () => null }));
vi.mock("@/screens/TeamDetailScreen", () => ({ TeamDetailScreen: () => null }));
vi.mock("@/screens/TeamBulkRegisterScreen", () => ({ TeamBulkRegisterScreen: () => null }));
vi.mock("@/screens/SettingsScreen", () => ({ SettingsScreen: () => null }));
vi.mock("@/screens/PracticeLogTemplatesScreen", () => ({
  PracticeLogTemplatesScreen: () => null,
}));
vi.mock("@/screens/BulkBestTimeScreen", () => ({ BulkBestTimeScreen: () => null }));
vi.mock("@/screens/PaywallScreen", () => ({ PaywallScreen: () => null }));
vi.mock("../TabNavigator", () => ({ TabNavigator: () => null }));

interface CapturedScreenProps {
  name?: string;
  options?: unknown;
  [key: string]: unknown;
}

const stackMocks = vi.hoisted(() => ({
  screens: [] as CapturedScreenProps[],
}));

vi.mock("@react-navigation/native-stack", () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: { children: React.ReactNode }) => children,
    Screen: (props: CapturedScreenProps) => {
      stackMocks.screens.push(props);
      return null;
    },
  }),
}));

import { MainStack } from "../MainStack";

type ResolvedOptions = Record<string, unknown>;

function getTeamDetailOptions(params: Record<string, unknown> | undefined): ResolvedOptions {
  const screen = stackMocks.screens.find((s) => s.name === "TeamDetail");
  expect(screen, "TeamDetail の <Stack.Screen> が見つからない").toBeDefined();

  const { options } = screen!;
  // [V-B14] route.params を読むには options が関数形式である必要がある
  expect(
    typeof options,
    "TeamDetail の options が関数形式ではない (route.params?.instant を読めない)",
  ).toBe("function");

  return (options as (args: { route: { params?: Record<string, unknown> } }) => ResolvedOptions)({
    route: { params },
  });
}

describe("MainStack — TeamDetail の instant 遷移", () => {
  beforeEach(() => {
    stackMocks.screens = [];
    render(<MainStack />);
  });

  it("[V-B10] instant: true のとき animation は 'none'", () => {
    const options = getTeamDetailOptions({ teamId: "team-1", instant: true });
    expect(options.animation).toBe("none");
  });

  it("[V-B11] instant 未指定のとき animation は 'default'", () => {
    const options = getTeamDetailOptions({ teamId: "team-1" });
    expect(options.animation).toBe("default");
  });

  it("[V-B12] instant: false のとき animation は 'default' (false を none に落とさない)", () => {
    const options = getTeamDetailOptions({ teamId: "team-1", instant: false });
    expect(options.animation).toBe("default");
  });

  it("[V-B11 境界] params 自体が undefined でも例外にならず animation は 'default'", () => {
    const options = getTeamDetailOptions(undefined);
    expect(options.animation).toBe("default");
  });

  it("[V-B13] instant の有無でヘッダー系オプションは変わらない", () => {
    const withInstant = getTeamDetailOptions({ teamId: "team-1", instant: true });
    const withoutInstant = getTeamDetailOptions({ teamId: "team-1" });

    // ⚠️ `toEqual(withoutInstant[key])` だけの比較は **両方 undefined でも緑**になる。
    // baseHeaderOptions からキーが消えた/名前が変わった場合に空振りするので、
    // まず「そのキーが実際に値を持っている」ことを具体値で固定してから
    // instant 側と突き合わせる (2段構え)。
    // 期待値は MainStack.tsx の baseHeaderOptions を読んで**手書き**したもの。
    expect(withoutInstant.headerShown).toBe(true);
    expect(withoutInstant.headerTintColor).toBe("#111827");
    expect(typeof withoutInstant.headerBackTitle).toBe("string");
    expect(withoutInstant.headerBackTitle).not.toBe("");
    expect(withoutInstant.headerStyle).toEqual({ backgroundColor: "#FFFFFF" });
    expect(withoutInstant.headerTitleStyle).toEqual({ fontWeight: "600" });

    // そのうえで instant の有無で変化しないことを見る
    const headerKeys = [
      "title",
      "headerShown",
      "headerBackTitle",
      "headerTintColor",
      "headerStyle",
      "headerTitleStyle",
    ] as const;
    for (const key of headerKeys) {
      expect(
        withInstant[key],
        `${key} が instant で変化している`,
      ).toEqual(withoutInstant[key]);
      // 空振り防止: 比較対象が undefined のままなら上の具体値 assert が先に落ちるが、
      // title だけは i18n 由来なのでここでも存在を要求する
      expect(withInstant[key], `${key} が undefined (比較が空振りしている)`).toBeDefined();
    }

    // 項目1 の注意点: headerTitle にコンポーネントを渡さない
    // (Android の backButtonInCustomView 経路が切り替わり回帰する)
    expect(withInstant.headerTitle).toBeUndefined();
    expect(withoutInstant.headerTitle).toBeUndefined();

    // instant で変わってよいのは animation だけ、という差分の全体像を固定する
    const changedKeys = Object.keys(withoutInstant).filter(
      (key) => JSON.stringify(withInstant[key]) !== JSON.stringify(withoutInstant[key]),
    );
    expect(changedKeys).toEqual(["animation"]);
  });

  it("[V-B13] 既定タイトルは残っている (チーム名は TeamDetailScreen 側の setOptions が上書きする)", () => {
    const options = getTeamDetailOptions({ teamId: "team-1" });
    expect(typeof options.title).toBe("string");
    expect(options.title).not.toBe("");
  });
});
