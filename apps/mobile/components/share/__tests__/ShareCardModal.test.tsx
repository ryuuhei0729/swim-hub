/**
 * ShareCardModal コンポーネント テスト（Phase B 本実装）
 *
 * 対象: apps/mobile/components/share/ShareCardModal.tsx
 * 参照実装: apps/web/components/share/ShareCardModal.tsx
 *
 * Sprint Contract 検証観点:
 *   [V-08] Sharing.isAvailableAsync() が false の時、共有不可メッセージが表示され、
 *          captureRef/Sharing.shareAsync が呼ばれない（大会シェア・練習シェア共通）
 *   [V-09 関連] type="practice" のとき PracticeShareCard が描画される
 *   [既存回帰] type="competition" のとき従来通り CompetitionShareCard が描画される
 *
 * テスト方針:
 *   CompetitionShareCard/PracticeShareCard 自体のレイアウトは別ファイル
 *   (PracticeShareCard.test.tsx 等)で検証済みのため、本ファイルでは
 *   `../CompetitionShareCard` / `../PracticeShareCard` を軽量スタブに vi.mock し、
 *   ShareCardModal 自体の責務（type 分岐・共有可否チェックの順序・エラーハンドリング）
 *   にのみ関心を絞る。
 *
 * トートロジー防止メモ:
 *   期待値は web ShareCardModal.tsx の Web Share API 分岐（利用不可ならダウンロードに
 *   フォールバック）と対になる mobile 実装（isAvailableAsync が false ならエラー表示して
 *   captureRef 自体を呼ばない）、および Sprint Contract の記述から導出したものであり、
 *   mobile 実装コードの diff を読んでコピーしたものではない。
 */

import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { Alert } from "react-native";
import { describe, expect, it, vi, beforeEach } from "vitest";

// expo-auth-session / expo-web-browser: useSafeInsets 等の依存チェーン経由で
// vitest のモジュール解決過程に引き込まれる可能性があるためスタブ化する
// (components/practices/__tests__/PracticeLogItem.test.tsx と同一パターン)。
vi.mock("expo-auth-session", () => ({
  makeRedirectUri: vi.fn(() => "swimhub://auth/callback"),
  ResponseType: { Token: "token", Code: "code" },
}));
vi.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: vi.fn(),
  openAuthSessionAsync: vi.fn(),
}));

const mocks = vi.hoisted(() => ({
  isAvailableAsync: vi.fn(),
  shareAsync: vi.fn(),
  captureRef: vi.fn(),
}));

vi.mock("expo-sharing", () => ({
  isAvailableAsync: mocks.isAvailableAsync,
  shareAsync: mocks.shareAsync,
}));

vi.mock("react-native-view-shot", () => ({
  captureRef: mocks.captureRef,
}));

vi.mock("../CompetitionShareCard", () => ({
  CompetitionShareCard: () => <div data-testid="competition-share-card-stub" />,
  SHARE_CARD_WIDTH: 360,
}));

vi.mock("../PracticeShareCard", () => ({
  PracticeShareCard: () => <div data-testid="practice-share-card-stub" />,
}));

import { ShareCardModal } from "../ShareCardModal";
import type { CompetitionShareData, PracticeShareData } from "../types";

const competitionData: CompetitionShareData = {
  competitionName: "テスト大会",
  date: "2026年7月1日",
  place: "市民プール",
  poolType: "short",
  eventName: "100m自由形",
  raceDistance: 100,
  time: 60,
};

const practiceData: PracticeShareData = {
  date: "2026年7月1日(水)",
  title: "朝練",
  menuItems: [],
  totalDistance: 400,
  totalSets: 1,
};

describe("ShareCardModal", () => {
  beforeEach(() => {
    mocks.isAvailableAsync.mockResolvedValue(true);
    mocks.captureRef.mockResolvedValue("file:///tmp/share.png");
    mocks.shareAsync.mockResolvedValue(undefined);
  });

  it("[既存回帰] type=\"competition\" のとき CompetitionShareCard が描画される", () => {
    render(
      <ShareCardModal visible type="competition" data={competitionData} onClose={vi.fn()} />,
    );
    expect(screen.getByTestId("competition-share-card-stub")).toBeTruthy();
    expect(screen.queryByTestId("practice-share-card-stub")).toBeNull();
  });

  it("[V-09 関連] type=\"practice\" のとき PracticeShareCard が描画される", () => {
    render(<ShareCardModal visible type="practice" data={practiceData} onClose={vi.fn()} />);
    expect(screen.getByTestId("practice-share-card-stub")).toBeTruthy();
    expect(screen.queryByTestId("competition-share-card-stub")).toBeNull();
  });

  it("data が null のとき何も描画しない（クラッシュしない）", () => {
    const { container } = render(
      <ShareCardModal visible type="competition" data={null} onClose={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it(
    "[V-08] Sharing.isAvailableAsync() が false を返すとき、Alert で共有不可メッセージが表示され、" +
      "captureRef/Sharing.shareAsync が呼ばれない",
    async () => {
      mocks.isAvailableAsync.mockResolvedValue(false);
      render(
        <ShareCardModal visible type="competition" data={competitionData} onClose={vi.fn()} />,
      );

      const shareButton = screen.getByRole("button", { name: "シェア" });
      fireEvent.click(shareButton);

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          "エラーが発生しました",
          "この端末では共有がご利用いただけません",
        );
      });
      expect(mocks.captureRef).not.toHaveBeenCalled();
      expect(mocks.shareAsync).not.toHaveBeenCalled();
    },
  );

  it("[共通] captureRef が例外を投げたとき、Alert でエラーメッセージが表示されクラッシュしない", async () => {
    mocks.captureRef.mockRejectedValue(new Error("capture failed"));
    render(
      <ShareCardModal visible type="competition" data={competitionData} onClose={vi.fn()} />,
    );

    const shareButton = screen.getByRole("button", { name: "シェア" });
    fireEvent.click(shareButton);

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith("エラーが発生しました", "画像の生成に失敗しました");
    });
    expect(mocks.shareAsync).not.toHaveBeenCalled();
  });

  it("[共通] 共有が成功したとき、captureRef → Sharing.shareAsync の順に呼ばれる", async () => {
    render(
      <ShareCardModal visible type="competition" data={competitionData} onClose={vi.fn()} />,
    );

    const shareButton = screen.getByRole("button", { name: "シェア" });
    fireEvent.click(shareButton);

    await waitFor(() => {
      expect(mocks.shareAsync).toHaveBeenCalledTimes(1);
    });
    expect(mocks.captureRef).toHaveBeenCalledTimes(1);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("閉じるボタン(Xアイコン)押下で onClose が呼ばれる", () => {
    const onClose = vi.fn();
    render(
      <ShareCardModal visible type="competition" data={competitionData} onClose={onClose} />,
    );

    // 閉じるボタンはアイコンのみでテキストが無いため、accessible name では特定できない。
    // Feather アイコンモックの data-testid から親の button 要素を辿って押下する。
    const closeButton = screen.getByTestId("icon-x").closest("button");
    expect(closeButton).toBeTruthy();
    fireEvent.click(closeButton!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("オーバーレイ押下で onClose が呼ばれる", () => {
    const onClose = vi.fn();
    const { container } = render(
      <ShareCardModal visible type="competition" data={competitionData} onClose={onClose} />,
    );

    // オーバーレイの Pressable はテキストを持たないため accessible name では特定できない。
    // accessibilityLabel 属性(モックでは小文字属性名として DOM に出る)で直接クエリする。
    const overlay = container.querySelector('[accessibilitylabel="モーダルを閉じる"]');
    expect(overlay).toBeTruthy();
    fireEvent.click(overlay!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
