// =============================================================================
// ErrorView.test.tsx - エラー表示コンポーネントのテスト
// =============================================================================

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { NetworkTimeoutError } from "@apps/shared/utils/networkError";
import i18n from "@/i18n";
import { ErrorView } from "../ErrorView";

describe("ErrorView", () => {
  it("エラーメッセージが表示される", () => {
    render(<ErrorView message="エラーが発生しました" />);

    expect(screen.getByText("エラーが発生しました")).toBeTruthy();
  });

  it("デフォルトでアイコンが表示される", () => {
    render(<ErrorView message="エラー" />);

    expect(screen.getByTestId("icon-alert-triangle")).toBeTruthy();
  });

  it("showIcon=falseの場合、アイコンが表示されない", () => {
    render(<ErrorView message="エラー" showIcon={false} />);

    expect(screen.queryByTestId("icon-alert-triangle")).toBeNull();
  });

  it("onRetryが提供された場合、リトライボタンが表示される", () => {
    const onRetry = vi.fn();
    render(<ErrorView message="エラー" onRetry={onRetry} />);

    const retryButton = screen.getByText("再試行");
    expect(retryButton).toBeTruthy();
  });

  it("onRetryが提供されない場合、リトライボタンが表示されない", () => {
    render(<ErrorView message="エラー" />);

    expect(screen.queryByText("再試行")).toBeNull();
  });

  it("リトライボタンをタップするとonRetryが呼ばれる", () => {
    const onRetry = vi.fn();
    render(<ErrorView message="エラー" onRetry={onRetry} />);

    const retryButton = screen.getByText("再試行");
    fireEvent.click(retryButton);

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("フルスクリーン表示でエラービューが表示される", () => {
    render(<ErrorView message="エラー" fullScreen />);

    expect(screen.getByText("エラー")).toBeTruthy();
  });

  it("フルスクリーン表示とリトライボタンの両方が表示される", () => {
    const onRetry = vi.fn();
    render(<ErrorView message="エラー" fullScreen onRetry={onRetry} />);

    expect(screen.getByText("エラー")).toBeTruthy();
    expect(screen.getByText("再試行")).toBeTruthy();
  });

  it("生の通信エラー文言 (TypeError: Network request failed) は通信エラーの文言に置き換える", () => {
    render(<ErrorView message="TypeError: Network request failed" />);

    expect(screen.queryByText("TypeError: Network request failed")).toBeNull();
    expect(screen.getByText(i18n.t("common.network.failed"))).toBeTruthy();
  });

  it("error にタイムアウトを渡すと、タイムアウトの文言を出す", () => {
    render(<ErrorView message="読み込みに失敗しました" error={new NetworkTimeoutError()} />);

    expect(screen.getByText(i18n.t("common.network.timeout"))).toBeTruthy();
  });

  it("通信と無関係なエラーなら message をそのまま出す", () => {
    render(<ErrorView message="読み込みに失敗しました" error={new Error("boom")} />);

    expect(screen.getByText("読み込みに失敗しました")).toBeTruthy();
  });
});
