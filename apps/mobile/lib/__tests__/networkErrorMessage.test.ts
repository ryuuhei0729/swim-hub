// =============================================================================
// networkErrorMessage.test.ts
// =============================================================================
//
// 圏外・タイムアウトが原因の失敗を「保存に失敗しました」等の汎用文言で済ませず、
// 電波の問題だと分かる文言にすることを確かめる。

import { afterEach, describe, expect, it } from "vitest";
import { onlineManager } from "@tanstack/react-query";
import { NetworkTimeoutError } from "@apps/shared/utils/networkError";
import { UserFacingError } from "@apps/shared/utils/userFacingError";
import i18n from "@/i18n";
import { getNetworkErrorMessage } from "../networkErrorMessage";

describe("getNetworkErrorMessage", () => {
  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it("接続断は「通信できませんでした」系の文言", () => {
    expect(
      getNetworkErrorMessage(new TypeError("Network request failed")),
    ).toBe(i18n.t("common.network.failed"));
  });

  it("タイムアウトは「時間がかかりすぎた」系の文言", () => {
    expect(getNetworkErrorMessage(new NetworkTimeoutError())).toBe(
      i18n.t("common.network.timeout"),
    );
  });

  it("オフラインのときは、エラーの中身に関係なくオフラインの文言", () => {
    onlineManager.setOnline(false);
    expect(getNetworkErrorMessage(new Error("認証が必要です"))).toBe(
      i18n.t("common.network.offline"),
    );
  });

  it("assumeOfflineCause: false ならオフラインでも中身で判定する", () => {
    onlineManager.setOnline(false);
    expect(
      getNetworkErrorMessage("保存に失敗しました", {
        assumeOfflineCause: false,
      }),
    ).toBeNull();
  });

  it("サーバーから届いた表示用エラー (UserFacingError) は差し替えない", () => {
    onlineManager.setOnline(false);
    expect(
      getNetworkErrorMessage(new UserFacingError("管理者権限が必要です")),
    ).toBeNull();
  });

  it("通信と無関係なエラーは null (呼び出し側の文言を使う)", () => {
    expect(getNetworkErrorMessage(new Error("boom"))).toBeNull();
    expect(getNetworkErrorMessage(undefined)).toBeNull();
  });

  it("翻訳キーが存在する (キー名がそのまま出ない)", () => {
    expect(i18n.t("common.network.failed")).not.toBe("common.network.failed");
    expect(i18n.t("common.network.timeout")).not.toBe("common.network.timeout");
    expect(i18n.t("common.network.offline")).not.toBe("common.network.offline");
  });
});
