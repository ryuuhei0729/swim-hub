/**
 * memberSort.test.ts — compareMembersByBirthday (メンバー一覧の年上順ソート) の単体検証
 *
 * Sprint Contract:
 *   - 並び順は「年上順」= 生年月日の昇順（例: 2008年生まれ → 2012年生まれ）
 *   - 生年月日未設定は並び順の方向に関わらず常に末尾
 *   - 同じ生年月日の場合は name → user_id の順で決定的に並ぶ
 *
 * 🚨 最重要観点: 「逆順に実装しても画面は正常に見える」という指摘の通り、
 * 単に「ソートされていること」を検証するテストは方向を取り違えても green になる。
 * このファイルは「どちらが先に来るか」を厳密な配列順で assert し、
 * 比較関数の向きを反転させるミューテーションで実際に red になることを
 * 別途(口頭/手順書として) 確認済み — 詳細は QA Engineer Report を参照。
 *
 * fixture 名は意図的に「年上/年下」等の期待値の部分文字列にしていない
 * (past incident: フィクスチャ名が期待値の部分文字列を含みトートロジー化した事例あり)。
 */

import { describe, expect, it } from "vitest";
import {
  compareMembersByBirthday,
  sortMembersByAgeForGroup,
  type BirthdaySortableMember,
} from "../../utils/memberSort";

const member = (
  userId: string,
  name: string,
  birthday: string | null | undefined,
): BirthdaySortableMember => ({
  user_id: userId,
  users: { name, birthday },
});

describe("compareMembersByBirthday", () => {
  it("2008年生まれが2012年生まれより前に来る（年上順 = 生年月日昇順）", () => {
    const older = member("u-taro", "タロウ", "2008-04-01");
    const younger = member("u-jiro", "ジロウ", "2012-04-01");

    const sorted = [younger, older].sort(compareMembersByBirthday);

    expect(sorted.map((m) => m.user_id)).toEqual(["u-taro", "u-jiro"]);
  });

  it("3人以上でも生年月日昇順（古い日付が先）で完全に並ぶ", () => {
    const a = member("u-a", "エー", "2010-06-15");
    const b = member("u-b", "ビー", "2005-01-01");
    const c = member("u-c", "シー", "2012-12-31");

    const sorted = [a, b, c].sort(compareMembersByBirthday);

    expect(sorted.map((m) => m.user_id)).toEqual(["u-b", "u-a", "u-c"]);
  });

  it("生年月日が未設定 (null) のメンバーは常に末尾に置かれる", () => {
    const withBirthday = member("u-has", "アリ", "2010-01-01");
    const noBirthday = member("u-none", "ナシ", null);

    // 未設定を先頭に置いても、末尾に押し出される
    const sorted = [noBirthday, withBirthday].sort(compareMembersByBirthday);

    expect(sorted.map((m) => m.user_id)).toEqual(["u-has", "u-none"]);
  });

  it("生年月日が未設定 (undefined) のメンバーも常に末尾に置かれる", () => {
    const withBirthday = member("u-has", "アリ", "2010-01-01");
    const noBirthday = member("u-none", "ナシ", undefined);

    const sorted = [withBirthday, noBirthday].sort(compareMembersByBirthday);

    expect(sorted.map((m) => m.user_id)).toEqual(["u-has", "u-none"]);
  });

  it("複数の未設定メンバーがいても、設定済みメンバー全員の後ろにまとまる", () => {
    const none1 = member("u-none-1", "ナシイチ", null);
    const has = member("u-has", "アリ", "2010-01-01");
    const none2 = member("u-none-2", "ナシニ", undefined);

    const sorted = [none1, has, none2].sort(compareMembersByBirthday);

    expect(sorted[0]!.user_id).toBe("u-has");
    expect(new Set(sorted.slice(1).map((m) => m.user_id))).toEqual(
      new Set(["u-none-1", "u-none-2"]),
    );
  });

  it("生年月日が同じ場合は name の昇順で決定的に並ぶ", () => {
    const sameDayB = member("u-b", "ベータ", "2010-01-01");
    const sameDayA = member("u-a", "アルファ", "2010-01-01");

    const sorted = [sameDayB, sameDayA].sort(compareMembersByBirthday);

    // "アルファ" < "ベータ" (文字列比較)
    expect(sorted.map((m) => m.user_id)).toEqual(["u-a", "u-b"]);
  });

  it("生年月日・name が両方同じ場合は user_id の昇順で決定的に並ぶ", () => {
    const second = member("u-2", "同姓同名", "2010-01-01");
    const first = member("u-1", "同姓同名", "2010-01-01");

    const sorted = [second, first].sort(compareMembersByBirthday);

    expect(sorted.map((m) => m.user_id)).toEqual(["u-1", "u-2"]);
  });

  it("同一メンバー配列を複数回ソートしても常に同じ順序になる（決定的）", () => {
    const list: BirthdaySortableMember[] = [
      member("u-1", "同姓同名", "2010-01-01"),
      member("u-2", "同姓同名", "2010-01-01"),
      member("u-3", "アルファ", "2010-01-01"),
      member("u-4", "ゼータ", null),
    ];

    const first = [...list].sort(compareMembersByBirthday).map((m) => m.user_id);
    const second = [...list].reverse().sort(compareMembersByBirthday).map((m) => m.user_id);

    expect(first).toEqual(second);
  });

  it("users が null のメンバーは生年月日未設定として扱われ末尾に置かれる", () => {
    const withBirthday = member("u-has", "アリ", "2010-01-01");
    const nullUsers: BirthdaySortableMember = { user_id: "u-null-users", users: null };

    const sorted = [nullUsers, withBirthday].sort(compareMembersByBirthday);

    expect(sorted.map((m) => m.user_id)).toEqual(["u-has", "u-null-users"]);
  });
});

describe("sortMembersByAgeForGroup (グループ表示のグループ内の並び。swimhub-tasks#106)", () => {
  // 2026-11-28 時点で数える
  const REF = new Date(2026, 10, 28);

  it("年齢の降順 (年上が先) に並べる", () => {
    const list = [
      member("u-a", "アオイ", "2014-05-01"), // 12歳
      member("u-b", "ベニ", "2008-05-01"), // 18歳
      member("u-c", "コン", "2011-05-01"), // 15歳
    ];

    expect(sortMembersByAgeForGroup(list, REF).map((m) => m.user_id)).toEqual([
      "u-b",
      "u-c",
      "u-a",
    ]);
  });

  it("同じ年齢なら生年月日ではなく名前順に並べる", () => {
    // どちらも 15 歳。生年月日の昇順なら u-late が後だが、名前順で先に来る
    const list = [
      member("u-early", "サクラ", "2011-01-10"),
      member("u-late", "アカネ", "2011-09-10"),
    ];

    expect(sortMembersByAgeForGroup(list, REF).map((m) => m.user_id)).toEqual([
      "u-late",
      "u-early",
    ]);
  });

  it("誕生日の前後で満年齢を数える (誕生日前日はまだ1つ下)", () => {
    const list = [
      member("u-x", "アイ", "2011-11-29"), // 誕生日前日 → 14歳
      member("u-y", "ユウ", "2012-11-28"), // 誕生日当日 → 14歳
      member("u-z", "ゼン", "2011-11-28"), // 誕生日当日 → 15歳
    ];

    expect(sortMembersByAgeForGroup(list, REF).map((m) => m.user_id)).toEqual([
      "u-z",
      "u-x",
      "u-y",
    ]);
  });

  it("生年月日が未設定・読めない人は最後にまとめて名前順", () => {
    const list = [
      member("u-none-2", "ワタル", null),
      member("u-has", "ンゴ", "2015-01-01"),
      member("u-bad", "イチ", "not-a-date"),
      member("u-none-1", "アユ", undefined),
    ];

    expect(sortMembersByAgeForGroup(list, REF).map((m) => m.user_id)).toEqual([
      "u-has",
      "u-none-1",
      "u-bad",
      "u-none-2",
    ]);
  });

  it("元の配列は並べ替えない", () => {
    const list = [member("u-1", "イ", "2014-01-01"), member("u-2", "ア", "2008-01-01")];
    sortMembersByAgeForGroup(list, REF);
    expect(list.map((m) => m.user_id)).toEqual(["u-1", "u-2"]);
  });
});
