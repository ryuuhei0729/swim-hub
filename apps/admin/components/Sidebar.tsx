"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { formatAgo } from "@/lib/format";
import type { TeamSummary, UserSummary } from "@/lib/queries";

type Mode = "users" | "teams";

type Row = { id: string; href: string; label: string; premium: boolean; meta: string };

export function Sidebar({ users, teams }: { users: UserSummary[]; teams: TeamSummary[] }) {
  const params = useParams<{ id?: string }>();
  const pathname = usePathname();
  const routeMode: Mode = pathname.startsWith("/teams") ? "teams" : "users";

  // 手動で切り替えたモードは、別の種類のページへ移動したら捨てる
  const [picked, setPicked] = useState<{ mode: Mode; at: Mode } | null>(null);
  const mode = picked && picked.at === routeMode ? picked.mode : routeMode;
  const [query, setQuery] = useState("");

  const rows = useMemo<Row[]>(() => {
    const needle = query.trim().toLowerCase();
    if (mode === "teams") {
      return teams
        .filter(
          (team) =>
            !needle ||
            team.name.toLowerCase().includes(needle) ||
            team.id.toLowerCase().startsWith(needle),
        )
        .map((team) => ({
          id: team.id,
          href: `/teams/${team.id}`,
          label: team.name || "(名前なし)",
          premium: false,
          meta: `${team.memberCount} 人`,
        }));
    }
    return users
      .filter(
        (user) =>
          !needle ||
          user.name.toLowerCase().includes(needle) ||
          (user.email ?? "").toLowerCase().includes(needle) ||
          user.id.toLowerCase().startsWith(needle),
      )
      .map((user) => ({
        id: user.id,
        href: `/users/${user.id}`,
        label: user.name || "(名前なし)",
        premium: user.premium,
        meta: formatAgo(user.lastSignInAt),
      }));
  }, [mode, users, teams, query]);

  const total = mode === "teams" ? teams.length : users.length;
  const noun = mode === "teams" ? "チーム" : "ユーザー";
  const unit = mode === "teams" ? "件" : "人";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-2">
        <div className="mb-2 grid grid-cols-2 gap-1 rounded-md bg-gray-100 p-1" role="tablist">
          {(["users", "teams"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={mode === key}
              onClick={() => {
                setPicked({ mode: key, at: routeMode });
                setQuery("");
              }}
              className={`rounded px-2 py-1 text-sm ${
                mode === key ? "bg-white font-semibold shadow-sm" : "text-gray-600"
              }`}
            >
              {key === "users" ? `ユーザー ${users.length}` : `チーム ${teams.length}`}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={mode === "teams" ? "チーム名・ID で検索" : "名前・メール・ID で検索"}
          aria-label={`${noun}を検索`}
          className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />
        <p className="mt-2 px-1 text-xs text-gray-500">
          {rows.length === total
            ? `${noun} ${total} ${unit}`
            : `${rows.length} / ${total} ${unit}`}
          ・{mode === "teams" ? "メンバーの多い順" : "最終ログイン順"}
        </p>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {rows.length === 0 && (
          <li className="px-2 py-4 text-sm text-gray-500">該当する{noun}がありません</li>
        )}
        {rows.map((row) => {
          const selected = mode === routeMode && row.id === params.id;
          return (
            <li key={row.id}>
              <Link
                href={row.href}
                aria-current={selected ? "page" : undefined}
                className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm ${
                  selected ? "bg-blue-600 text-white" : "hover:bg-gray-100"
                }`}
              >
                <span className="min-w-0 truncate">
                  {row.label}
                  {row.premium && (
                    <span
                      className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${
                        selected ? "bg-white/20" : "bg-green-100 text-green-800"
                      }`}
                    >
                      Premium
                    </span>
                  )}
                </span>
                <span
                  className={`shrink-0 text-xs ${selected ? "text-blue-100" : "text-gray-500"}`}
                >
                  {row.meta}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
