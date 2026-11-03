import { describe, expect, it, vi } from "vitest";
import {
  createOrUpdateById,
  isPrimaryKeyConflict,
  isUniqueViolation,
} from "../../utils/idempotentWrite";

const pkeyConflict = (table: string) => ({
  code: "23505",
  message: `duplicate key value violates unique constraint "${table}_pkey"`,
  details: "Key (id)=(abc) already exists.",
});

describe("isUniqueViolation / isPrimaryKeyConflict", () => {
  it("主キー重複を判定する", () => {
    expect(isUniqueViolation(pkeyConflict("records"))).toBe(true);
    expect(isPrimaryKeyConflict(pkeyConflict("records"))).toBe(true);
    expect(isPrimaryKeyConflict(pkeyConflict("records"), "records")).toBe(true);
  });

  it("別の表の主キーや、主キー以外の一意制約の違反とは区別する", () => {
    expect(isPrimaryKeyConflict(pkeyConflict("records"), "competitions")).toBe(
      false,
    );
    const naturalKeyConflict = {
      code: "23505",
      message:
        'duplicate key value violates unique constraint "entries_competition_id_user_id_style_id_key"',
    };
    expect(isUniqueViolation(naturalKeyConflict)).toBe(true);
    expect(isPrimaryKeyConflict(naturalKeyConflict)).toBe(false);
  });

  it("23505 以外は false", () => {
    expect(
      isPrimaryKeyConflict({ code: "23503", message: "records_pkey" }),
    ).toBe(false);
    expect(isPrimaryKeyConflict(new Error("boom"))).toBe(false);
    expect(isPrimaryKeyConflict(null)).toBe(false);
  });
});

describe("createOrUpdateById", () => {
  it("作成できればその結果を返し、更新は呼ばない", async () => {
    const create = vi.fn().mockResolvedValue({ id: "r1" });
    const update = vi.fn();
    await expect(
      createOrUpdateById({ table: "records", create, update }),
    ).resolves.toEqual({
      id: "r1",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("同じ ID の行が既にある (前回の保存が届いていた) ときは更新に切り替える", async () => {
    const create = vi.fn().mockRejectedValue(pkeyConflict("records"));
    const update = vi.fn().mockResolvedValue({ id: "r1", time: 30 });
    await expect(
      createOrUpdateById({ table: "records", create, update }),
    ).resolves.toEqual({
      id: "r1",
      time: 30,
    });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("それ以外のエラーはそのまま投げる", async () => {
    const networkError = {
      message: "TypeError: Network request failed",
      code: "",
    };
    const create = vi.fn().mockRejectedValue(networkError);
    const update = vi.fn();
    await expect(
      createOrUpdateById({ table: "records", create, update }),
    ).rejects.toBe(networkError);
    expect(update).not.toHaveBeenCalled();
  });
});
