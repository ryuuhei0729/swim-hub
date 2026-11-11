"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  ArrowTopRightOnSquareIcon,
  CalendarDaysIcon,
  ChevronRightIcon,
  DocumentTextIcon,
  LockClosedIcon,
  StarIcon,
} from "@heroicons/react/24/outline";
import { Link } from "@/i18n/navigation";
import { accountPath, type AccountTab } from "./accountTabs";

/**
 * アカウント画面の設定一覧 (アプリの AccountList と同じ、iOS の設定アプリ風のグループ)
 * PC では右側の詳細を切り替え、SP では詳細画面へ進む。
 */

interface AccountMenuProps {
  /** PC で右側に出している詳細 (その行を強調する) */
  activeTab: AccountTab;
  /** URL の ?tab (SP で詳細を開いているときだけ値がある) */
  currentTab: AccountTab | null;
  planValue: string;
  calendarValue: string;
  templateCount?: number;
  onLogout: () => void;
}

interface TabRow {
  tab: AccountTab;
  icon: React.ElementType;
  iconBg: string;
  label: string;
  value?: string;
}

function Group({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100 divide-y divide-gray-100">
      {children}
    </div>
  );
}

const rowClass =
  "flex min-h-12 w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-gray-50 focus:outline-none focus-visible:bg-gray-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500";

export default function AccountMenu({
  activeTab,
  currentTab,
  planValue,
  calendarValue,
  templateCount,
  onLogout,
}: AccountMenuProps) {
  const t = useTranslations("account.web");

  const renderTabRow = (row: TabRow) => {
    const isActive = row.tab === activeTab;
    const Icon = row.icon;
    return (
      <Link
        key={row.tab}
        href={accountPath(row.tab)}
        className={`${rowClass} ${isActive ? "lg:bg-blue-50 lg:hover:bg-blue-50" : ""}`}
        aria-current={row.tab === currentTab ? "page" : undefined}
        data-testid={`account-row-${row.tab}`}
      >
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${row.iconBg}`}
          aria-hidden="true"
        >
          <Icon className="h-4 w-4 text-white" strokeWidth={2} />
        </span>
        <span
          className={`flex-1 truncate text-[15px] font-medium text-gray-900 ${
            isActive ? "lg:font-bold lg:text-blue-700" : ""
          }`}
        >
          {row.label}
        </span>
        {row.value && <span className="max-w-[45%] truncate text-sm text-gray-500">{row.value}</span>}
        <ChevronRightIcon className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
      </Link>
    );
  };

  const renderExternalRow = (href: "/terms" | "/privacy", label: string) => (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={rowClass}
      aria-label={`${label} (${t("opensInNewTab")})`}
    >
      <span className="flex-1 truncate text-[15px] font-medium text-gray-900">{label}</span>
      <ArrowTopRightOnSquareIcon className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
    </Link>
  );

  return (
    <nav className="space-y-4" aria-label={t("menuAriaLabel")}>
      <Group>
        {renderTabRow({
          tab: "plan",
          icon: StarIcon,
          iconBg: "bg-amber-500",
          label: t("rows.plan"),
          value: planValue,
        })}
      </Group>

      <Group>
        {renderTabRow({
          tab: "calendar",
          icon: CalendarDaysIcon,
          iconBg: "bg-blue-500",
          label: t("rows.calendar"),
          value: calendarValue,
        })}
        {renderTabRow({
          tab: "templates",
          icon: DocumentTextIcon,
          iconBg: "bg-green-500",
          label: t("rows.templates"),
          value: templateCount !== undefined ? String(templateCount) : undefined,
        })}
        {renderTabRow({
          tab: "security",
          icon: LockClosedIcon,
          iconBg: "bg-gray-500",
          label: t("rows.security"),
        })}
      </Group>

      <Group>
        {renderExternalRow("/terms", t("rows.terms"))}
        {renderExternalRow("/privacy", t("rows.privacy"))}
      </Group>

      <Group>
        <button
          type="button"
          onClick={onLogout}
          className={`${rowClass} justify-center text-[15px] font-semibold text-red-600`}
          data-testid="account-logout"
        >
          {t("rows.logout")}
        </button>
      </Group>
    </nav>
  );
}
