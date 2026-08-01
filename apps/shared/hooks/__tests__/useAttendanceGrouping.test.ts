/**
 * useAttendanceGrouping テスト (Sprint Contract Phase A — T-5/T-6 の土台となる既存共有ロジック)
 *
 * 対象: `hooks/useAttendanceGrouping.ts`(既存実装。web AttendanceGroupingDisplay と、
 * 2026-07-28 時点で未コミットの mobile AdminMonthlyAttendance の4グループ化で共通利用。
 * T-5/T-6 でこの4グループ表示を一般メンバー(MyMonthlyAttendance / DayDetailModal)にも
 * 展開するため、既存フックの入出力契約をここで固定する)。
 *
 * Sprint Contract 検証観点:
 *   [V-20] 出欠が無いメンバーは unansweredMembers に列挙される
 *   [V-21] 出欠が有るメンバーは対応する status のグループ(present/absent/other)に分類される
 *   [V-22] 全メンバーが回答済みのとき unansweredMembers は空配列
 *   [V-23] チームメンバーが0人のとき、unansweredMembers は空配列でクラッシュしない
 *          (present/absent/other は attendanceData の status を基準に分類されるため、
 *          teamMembers が空でも既存の attendanceData 由来の分類結果はそのまま出る)
 *   [V-24 CRITICAL — 既知の潜在バグ、実装前に既に失敗する想定]
 *     DBトリガー(create_attendance_for_team_practice/competition, 20251201014342_initial_schema.sql)
 *     はイベント作成時に**アクティブな全メンバー分の team_attendance 行を status=NULL で
 *     自動生成する**(supabase/migrations/20251201014342_initial_schema.sql:83-92)。
 *     web/mobile とも listByPractice・listByCompetition はこの status=NULL 行を除外せず
 *     そのまま attendanceData として渡す(apps/shared/api/teams/attendances.ts の
 *     listByPractice/listByCompetition、apps/web/.../useAttendanceStatus.ts、
 *     apps/mobile/.../AdminMonthlyAttendance.tsx はいずれも無フィルタで渡している)。
 *     現行の useAttendanceGrouping は `answeredUserIds = attendanceData.map(a => a.user_id)` と
 *     status を見ずに「行が存在する = 回答済み」とみなすため、status=NULL の行を持つメンバーは
 *     unansweredMembers から消える一方、present/absent/other のどのグループにも入らず、
 *     4グループのどこにも表示されなくなる(=「未回答」が実運用データでは常にほぼ0人になる)。
 *     これは T-5(一般メンバーへの「みんなの出欠閲覧」解放)で可視性が上がるため、
 *     Sprint 内で必ず解消するか、少なくとも PM に既知の Critical として明示的に
 *     エスカレーションすること。本テストは「status が null の行は回答済み扱いしない」という
 *     あるべき仕様を固定するものであり、現行実装に対しては FAIL する想定(Phase A 時点の
 *     既知の失敗としてベースライン記録済み)。
 *
 * トートロジー防止メモ: 期待するグループ分けはテスト側で手動列挙しており、
 * useAttendanceGrouping.ts 内の filter/map をそのままテスト側に複製していない。
 */

import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAttendanceGrouping } from "../useAttendanceGrouping";
import type { TeamAttendanceWithDetails } from "../../types";
import type { UserProfile } from "../../types/user";
import type { TeamMember } from "../../utils/team";

function makeUser(id: string, name: string): UserProfile {
  return {
    id,
    name,
    gender: 0,
    birthday: null,
    profile_image_path: null,
    bio: null,
    google_calendar_enabled: false,
    google_calendar_sync_practices: false,
    google_calendar_sync_competitions: false,
    ios_calendar_enabled: false,
    ios_calendar_sync_practices: false,
    ios_calendar_sync_competitions: false,
    onboarding_completed: true,
    created_at: null,
    updated_at: null,
  };
}

function makeAttendance(
  userId: string,
  status: "present" | "absent" | "other" | null,
  name: string,
): TeamAttendanceWithDetails {
  return {
    id: `att-${userId}`,
    practice_id: "practice-1",
    competition_id: null,
    user_id: userId,
    status,
    note: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    user: makeUser(userId, name),
  };
}

describe("useAttendanceGrouping", () => {
  const teamMembers: TeamMember[] = [
    { id: "u1", name: "田中" },
    { id: "u2", name: "佐藤" },
    { id: "u3", name: "鈴木" },
  ];

  it("[V-20/21] present/absent/other に分類され、未回答メンバーが列挙される", () => {
    const attendanceData: TeamAttendanceWithDetails[] = [
      makeAttendance("u1", "present", "田中"),
      makeAttendance("u2", "absent", "佐藤"),
      // u3 は出欠データそのものが無い(=真に未回答)
    ];

    const { result } = renderHook(() => useAttendanceGrouping(attendanceData, teamMembers));

    expect(result.current.presentMembers).toEqual([{ id: "u1", name: "田中" }]);
    expect(result.current.absentMembers).toEqual([{ id: "u2", name: "佐藤" }]);
    expect(result.current.otherMembers).toEqual([]);
    expect(result.current.unansweredMembers).toEqual([{ id: "u3", name: "鈴木" }]);
  });

  it("[V-22] 全員回答済みのとき unansweredMembers は空配列", () => {
    const attendanceData: TeamAttendanceWithDetails[] = [
      makeAttendance("u1", "present", "田中"),
      makeAttendance("u2", "absent", "佐藤"),
      makeAttendance("u3", "other", "鈴木"),
    ];

    const { result } = renderHook(() => useAttendanceGrouping(attendanceData, teamMembers));

    expect(result.current.unansweredMembers).toEqual([]);
    expect(result.current.otherMembers).toEqual([{ id: "u3", name: "鈴木" }]);
  });

  it("[V-23] チームメンバーが0人のとき、unansweredMembers は空配列でクラッシュしない", () => {
    const attendanceData: TeamAttendanceWithDetails[] = [makeAttendance("u1", "present", "田中")];

    const { result } = renderHook(() => useAttendanceGrouping(attendanceData, []));

    expect(result.current.unansweredMembers).toEqual([]);
    // teamMembers が空でも attendanceData 由来の分類自体は行われる(現行仕様)
    expect(result.current.presentMembers).toEqual([{ id: "u1", name: "田中" }]);
  });

  it("[V-24 CRITICAL/既知バグ] status=null(DBトリガー自動生成行)のメンバーは未回答として扱われるべき", () => {
    // u2/u3 は「実際には未回答」だが、practice/competition 作成時のDBトリガーにより
    // status=NULL の team_attendance 行が既に存在する(実運用で必ず起きるデータ形状)。
    const attendanceData: TeamAttendanceWithDetails[] = [
      makeAttendance("u1", "present", "田中"),
      makeAttendance("u2", null, "佐藤"),
      makeAttendance("u3", null, "鈴木"),
    ];

    const { result } = renderHook(() => useAttendanceGrouping(attendanceData, teamMembers));

    // あるべき仕様: status=null の行は「回答済み」に数えず、未回答グループに現れる
    expect(result.current.unansweredMembers).toEqual(
      expect.arrayContaining([
        { id: "u2", name: "佐藤" },
        { id: "u3", name: "鈴木" },
      ]),
    );
    expect(result.current.unansweredMembers).toHaveLength(2);
    // かつ、present/absent/other のどこにも重複して現れない
    expect(result.current.presentMembers).toEqual([{ id: "u1", name: "田中" }]);
    expect(result.current.absentMembers).toEqual([]);
    expect(result.current.otherMembers).toEqual([]);
  });
});
