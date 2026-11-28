/**
 * TeamPractices / TeamCompetitions — 追加・編集フォームで選んだ画像を保存する
 *
 * swimhub-tasks#58: 基本フォームに画像欄は出るのに、保存処理が画像データを
 * `_imageData` として受け取って捨てていた。編集時に既存の画像も渡していなかった。
 * 保存そのもの (アップロード・image_paths 更新) は saveParentImages の単体テストで見るので、
 * ここでは「どの練習/大会に、どの画像変更を渡すか」と「既存の画像をフォームに渡すか」を見る。
 */

import React from "react";
import { renderWithI18n as render, screen, waitFor } from "@/__tests__/helpers/teamQueryTestUtils";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  practiceCreate: vi.fn(),
  practiceUpdate: vi.fn(),
  competitionCreate: vi.fn(),
  competitionUpdate: vi.fn(),
  saveParentImages: vi.fn(),
  resolveGalleryImages: vi.fn(),
}));

const IMAGE_DATA = {
  newFiles: [{ id: "tmp-1", file: new File(["x"], "new.jpg", { type: "image/jpeg" }), previewUrl: "blob:x" }],
  deletedIds: ["old/path.jpg"],
};

vi.mock("@/utils/parentImageSave", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/parentImageSave")>();
  return { ...actual, saveParentImages: mocks.saveParentImages };
});

vi.mock("@/lib/image-url", () => ({
  resolveGalleryImages: mocks.resolveGalleryImages,
}));

vi.mock("@apps/shared/api/teams/practices", () => ({
  TeamPracticesAPI: vi.fn().mockImplementation(function () {
    return { create: mocks.practiceCreate, update: mocks.practiceUpdate, remove: vi.fn() };
  }),
}));

vi.mock("@apps/shared/api/teams/records", () => ({
  TeamRecordsAPI: vi.fn().mockImplementation(function () {
    return { create: mocks.competitionCreate, update: mocks.competitionUpdate, remove: vi.fn() };
  }),
}));

vi.mock("@apps/shared/hooks/queries/goalTargets");
vi.mock("@/i18n/navigation");

// 基本フォーム: 渡された既存画像の数を出し、「保存」で画像変更つきの onSubmit を呼ぶ
type ImageProps = { images?: unknown[] } | undefined;
vi.mock("@/components/forms/PracticeBasicForm", () => ({
  default: (props: {
    isOpen: boolean;
    editData?: ImageProps;
    onSubmit: (data: unknown, imageData?: unknown) => Promise<void>;
  }) =>
    props.isOpen ? (
      <div>
        <span data-testid="existing-image-count">{props.editData?.images?.length ?? 0}</span>
        <button
          type="button"
          onClick={() =>
            void props.onSubmit({ date: "2026-11-20", title: "朝練", place: "", note: "" }, IMAGE_DATA)
          }
        >
          practice-basic-submit
        </button>
      </div>
    ) : null,
}));

vi.mock("@/components/forms/CompetitionBasicForm", () => ({
  default: (props: {
    isOpen: boolean;
    editData?: ImageProps;
    onSubmit: (data: unknown, imageData?: unknown) => Promise<void>;
  }) =>
    props.isOpen ? (
      <div>
        <span data-testid="existing-image-count">{props.editData?.images?.length ?? 0}</span>
        <button
          type="button"
          onClick={() =>
            void props.onSubmit(
              { date: "2026-11-20", endDate: "", title: "県大会", place: "", poolType: 0, note: "" },
              IMAGE_DATA,
            )
          }
        >
          competition-basic-submit
        </button>
      </div>
    ) : null,
}));

vi.mock("@/components/forms/PracticeTabModal", () => ({ default: () => null }));
vi.mock("../../../components/team/TeamPracticeDetailModal", () => ({ default: () => null }));
vi.mock("../../../components/team/TeamCompetitionEntryModal", () => ({ default: () => null }));
vi.mock("../../../components/team/TeamCompetitionRecordsModal", () => ({ default: () => null }));

const PRACTICE_ROW = {
  id: "practice-1",
  user_id: "admin-1",
  date: "2026-11-20",
  title: "朝練",
  place: null,
  note: null,
  created_at: "2026-11-01T00:00:00Z",
  created_by: "admin-1",
  users: { name: "管理者" },
  created_by_user: null,
  practice_logs: [],
};

const COMPETITION_ROW = {
  id: "competition-1",
  user_id: "admin-1",
  team_id: "team-1",
  title: "県大会",
  date: "2026-12-01",
  end_date: null,
  place: null,
  pool_type: 0,
  entry_status: "before",
  note: null,
  created_at: "2026-11-01T00:00:00Z",
  created_by: "admin-1",
  users: { name: "管理者" },
  created_by_user: null,
  records: [],
  entries: [],
};

/** 一覧の取得と、編集時の image_paths の取得に答える */
function buildSupabaseMock(rows: unknown[], imagePaths: string[]) {
  return {
    from: vi.fn(() => ({
      select: (cols: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.head) return { eq: () => Promise.resolve({ count: rows.length, error: null }) };
        if (cols === "image_paths") {
          return {
            eq: () => ({
              single: () => Promise.resolve({ data: { image_paths: imagePaths }, error: null }),
            }),
          };
        }
        return {
          eq: () => ({
            order: () => ({ range: () => Promise.resolve({ data: rows, error: null }) }),
          }),
        };
      },
    })),
  };
}

vi.mock("@/contexts/AuthProvider");
import { useAuth } from "@/contexts/AuthProvider";
import { buildAuthContext } from "@/__tests__/utils/authContext";

// 練習・大会カードと操作は予定タブ (TeamSchedule) と同じ useTeam*Actions。一覧の取得はテスト用の描画側
import { TeamPractices, TeamCompetitions } from "@/__tests__/utils/teamScheduleCardRenderers";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.practiceCreate.mockResolvedValue({ id: "practice-new" });
  mocks.practiceUpdate.mockResolvedValue({ id: "practice-1" });
  mocks.competitionCreate.mockResolvedValue({ id: "competition-new" });
  mocks.competitionUpdate.mockResolvedValue({ id: "competition-1" });
  mocks.saveParentImages.mockResolvedValue(undefined);
  mocks.resolveGalleryImages.mockImplementation(async (_bucket: string, paths: string[]) =>
    paths.map((path) => ({ id: path, thumbnailUrl: "u", originalUrl: "u" })),
  );
});

describe("TeamPractices の画像", () => {
  function setup(imagePaths: string[] = []) {
    vi.mocked(useAuth).mockReturnValue(
      buildAuthContext({ user: { id: "admin-1" }, supabase: buildSupabaseMock([PRACTICE_ROW], imagePaths) }),
    );
    render(<TeamPractices teamId="team-1" isAdmin={true} />);
  }

  it("追加: 作成した練習に、選んだ画像の変更を保存する", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole("button", { name: "練習記録追加" }));
    await user.click(await screen.findByText("practice-basic-submit"));

    await waitFor(() =>
      expect(mocks.saveParentImages).toHaveBeenCalledWith(
        expect.anything(),
        "practice",
        "practice-new",
        IMAGE_DATA,
      ),
    );
  });

  it("編集: 既存の画像をフォームに渡し、保存時はその練習に画像の変更を保存する", async () => {
    const user = userEvent.setup();
    setup(["practice-1/a.jpg", "practice-1/b.jpg"]);

    await user.click(await screen.findByTestId("team-practice-edit-button"));
    await waitFor(() => expect(screen.getByTestId("existing-image-count")).toHaveTextContent("2"));
    expect(mocks.resolveGalleryImages).toHaveBeenCalledWith("practice-images", [
      "practice-1/a.jpg",
      "practice-1/b.jpg",
    ]);

    await user.click(screen.getByText("practice-basic-submit"));
    await waitFor(() =>
      expect(mocks.saveParentImages).toHaveBeenCalledWith(
        expect.anything(),
        "practice",
        "practice-1",
        IMAGE_DATA,
      ),
    );
  });

  it("画像の保存に失敗したら、練習は保存済みであることと画像の失敗を伝える", async () => {
    mocks.saveParentImages.mockRejectedValue(new Error("upload failed"));
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole("button", { name: "練習記録追加" }));
    await user.click(await screen.findByText("practice-basic-submit"));

    expect(
      await screen.findByText("練習記録は保存されましたが、画像の保存に失敗しました"),
    ).toBeInTheDocument();
  });
});

describe("TeamCompetitions の画像", () => {
  function setup(imagePaths: string[] = []) {
    vi.mocked(useAuth).mockReturnValue(
      buildAuthContext({
        user: { id: "admin-1" },
        supabase: buildSupabaseMock([COMPETITION_ROW], imagePaths),
      }),
    );
    render(<TeamCompetitions teamId="team-1" isAdmin={true} />);
  }

  it("編集: 既存の画像をフォームに渡し、保存時はその大会に画像の変更を保存する", async () => {
    const user = userEvent.setup();
    setup(["competition-1/a.jpg"]);

    await user.click(await screen.findByTestId("team-competition-edit-button"));
    await waitFor(() => expect(screen.getByTestId("existing-image-count")).toHaveTextContent("1"));
    expect(mocks.resolveGalleryImages).toHaveBeenCalledWith("competition-images", [
      "competition-1/a.jpg",
    ]);

    await user.click(screen.getByText("competition-basic-submit"));
    await waitFor(() =>
      expect(mocks.saveParentImages).toHaveBeenCalledWith(
        expect.anything(),
        "competition",
        "competition-1",
        IMAGE_DATA,
      ),
    );
  });

  it("追加: 作成した大会に、選んだ画像の変更を保存する", async () => {
    const user = userEvent.setup();
    setup();

    await screen.findByText("県大会");
    await user.click(screen.getByRole("button", { name: "大会追加" }));
    await user.click(await screen.findByText("competition-basic-submit"));

    await waitFor(() =>
      expect(mocks.saveParentImages).toHaveBeenCalledWith(
        expect.anything(),
        "competition",
        "competition-new",
        IMAGE_DATA,
      ),
    );
  });
});
