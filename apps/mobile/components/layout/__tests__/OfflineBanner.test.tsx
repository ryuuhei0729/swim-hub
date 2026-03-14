// =============================================================================
// OfflineBanner.test.tsx - オフラインバナーコンポーネントのテスト
// =============================================================================

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { OfflineBanner } from "../OfflineBanner";

describe("OfflineBanner", () => {
  it("visible=trueの場合、バナーが表示される", () => {
    render(<OfflineBanner visible={true} />);

    expect(screen.getByText("📡 オフラインです。一部の機能が制限されます。")).toBeTruthy();
  });

  it("visible=falseの場合、バナーが表示されない", () => {
    render(<OfflineBanner visible={false} />);

    expect(screen.queryByText("📡 オフラインです。一部の機能が制限されます。")).toBeNull();
  });

  it("メッセージが正しく表示される", () => {
    render(<OfflineBanner visible={true} />);

    const message = screen.getByText("📡 オフラインです。一部の機能が制限されます。");
    expect(message).toBeTruthy();
  });
});
