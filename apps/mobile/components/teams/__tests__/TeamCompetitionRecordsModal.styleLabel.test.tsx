/**
 * TeamCompetitionRecordsModal — 種目名のロケール対応
 * DB の styles.name_jp をそのまま出すと、ドイツ語などでも「100m自由形」と日本語になる
 * (Agent testers の lena で検出)。localizedStyleName でロケールに合わせる。
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { createQueryWrapper } from "@/__tests__/helpers/testUtils";

const mocks = vi.hoisted(() => ({
  locale: { current: "de" as "ja" | "en" | "de" },
  supabase: {} as Record<string, unknown>,
}));

vi.mock("react-i18next", async () => {
  const bundles = {
    ja: (await import("../../../../../packages/shared/messages/ja.json")).default,
    en: (await import("../../../../../packages/shared/messages/en.json")).default,
    de: (await import("../../../../../packages/shared/messages/de.json")).default,
  } as Record<string, unknown>;

  const resolve = (locale: string, key: string): string | undefined => {
    let cur: unknown = bundles[locale];
    for (const part of key.split(".")) {
      if (cur && typeof cur === "object" && part in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
    return typeof cur === "string" ? cur : undefined;
  };

  const t = (key: string, options?: Record<string, unknown>): string => {
    const raw = resolve(mocks.locale.current, key);
    if (raw === undefined) return key;
    if (!options || Object.keys(options).length === 0) return raw;
    return raw.replace(/\{(\w+)\}/g, (_m, name: string) =>
      name in options ? String(options[name]) : `{${name}}`,
    );
  };

  return {
    useTranslation: () => ({
      t,
      i18n: { language: mocks.locale.current, changeLanguage: vi.fn(async () => undefined) },
    }),
    Trans: ({ children }: { children?: React.ReactNode }) => children ?? null,
    I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
    initReactI18next: { type: "3rdParty", init: () => {} },
  };
});

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: vi.fn(() => ({ supabase: mocks.supabase, user: { id: "user-admin" } })),
}));

vi.mock("@apps/shared/api/teams/relayRecords", () => ({
  TeamRelayRecordsAPI: { getByCompetition: vi.fn(() => Promise.resolve([])) },
}));

vi.mock("@apps/shared/hooks/queries/recordFeedbacks", () => ({
  useRecordFeedbackSummariesQuery: () => ({ data: {} }),
}));

vi.mock("@/components/records/BestTimeBadge", () => ({ default: () => null }));

function makeSupabase(records: Array<Record<string, unknown>>) {
  const response = (data: unknown) => ({ data, error: null });
  const chain = (data: unknown) => {
    const builder: Record<string, unknown> = {};
    builder.select = () => builder;
    builder.eq = () => builder;
    builder.order = () => builder;
    builder.single = () => Promise.resolve(response(data));
    builder.then = (ok: (v: unknown) => unknown, ng?: (e: unknown) => unknown) =>
      Promise.resolve(response(data)).then(ok, ng);
    return builder;
  };
  return {
    from: (table: string) =>
      table === "competitions"
        ? chain({ id: "comp-1", title: "大会", date: "2026-09-01", place: null, pool_type: 0, note: null })
        : chain(records),
  };
}

function record(id: string, userId: string, teamId: string | null, name: string) {
  return {
    id,
    user_id: userId,
    team_id: teamId,
    style_id: 1,
    time: 60 + Number(id.slice(-1)),
    reaction_time: null,
    is_relaying: false,
    pool_type: 0,
    note: null,
    users: { name, profile_image_path: null },
    styles: { id: 1, name_jp: "100m自由形", name: "100Fr", style: "Fr", distance: 100 },
    split_times: [],
  };
}

import { TeamCompetitionRecordsModal } from "../TeamCompetitionRecordsModal";

const renderModal = () =>
  render(
    <TeamCompetitionRecordsModal
      visible
      onClose={vi.fn()}
      competitionId="comp-1"
      competitionTitle="Wettkampf"
      teamId="team-1"
      isAdmin={false}
    />,
    { wrapper: createQueryWrapper() },
  );

describe("TeamCompetitionRecordsModal — 種目名のロケール対応", () => {
  beforeEach(() => {
    mocks.supabase = makeSupabase([
      record("rec-1", "swimmer-a", "team-1", "Schwimmer A"),
    ]) as unknown as Record<string, unknown>;
  });

  it("de: 種目見出しを「100m自由形」ではなく「100mFr」と出す", async () => {
    mocks.locale.current = "de";
    renderModal();
    await waitFor(() => expect(screen.getByText("Schwimmer A")).toBeTruthy());
    expect(screen.getByText("100mFr")).toBeTruthy();
    expect(screen.queryByText("100m自由形")).toBeNull();
  });

  it("ja: 従来どおり「100m自由形」と出す", async () => {
    mocks.locale.current = "ja";
    renderModal();
    await waitFor(() => expect(screen.getByText("Schwimmer A")).toBeTruthy());
    expect(screen.getByText("100m自由形")).toBeTruthy();
  });
});
