import Link from "next/link";
import type { ReactNode } from "react";

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-sm text-gray-500">{children}</p>;
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full whitespace-nowrap text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
            {head.map((label) => (
              <th key={label} className="px-2 py-1.5 font-medium">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_td]:border-b [&_td]:border-gray-100 [&_td]:px-2 [&_td]:py-1.5">
          {children}
        </tbody>
      </table>
    </div>
  );
}

export function Pill({ tone, children }: { tone: "green" | "gray"; children: ReactNode }) {
  const color = tone === "green" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700";
  return <span className={`rounded-full px-2 py-0.5 text-xs ${color}`}>{children}</span>;
}

export function TabNav({
  basePath,
  tabs,
  activeKey,
}: {
  basePath: string;
  tabs: { key: string; label: string; count?: number }[];
  activeKey: string;
}) {
  return (
    <nav className="mt-4 mb-3 flex flex-wrap gap-1 border-b border-gray-200" aria-label="データの種類">
      {tabs.map((tab, index) => {
        const selected = tab.key === activeKey;
        return (
          <Link
            key={tab.key}
            href={index === 0 ? basePath : `${basePath}?tab=${tab.key}`}
            aria-current={selected ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm ${
              selected
                ? "border-blue-600 font-semibold text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-900"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1 text-xs tabular-nums">{tab.count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
