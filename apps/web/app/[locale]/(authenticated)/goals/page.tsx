import { Suspense } from "react";
import GoalDataLoader from "./_server/GoalDataLoader";

interface GoalsPageProps {
  /** goalId: 最初に選んでおく目標 (ダッシュボードの「次の大会」の目標タイムから開いたとき) */
  searchParams: Promise<{ goalId?: string | string[] }>;
}

/**
 * 目標管理ページ（Server Component）
 * データ取得をサーバー側で実行し、Client Componentに渡す
 */
export default async function GoalsPage({ searchParams }: GoalsPageProps) {
  const { goalId } = await searchParams;
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50">
          <div className="p-6 space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="animate-pulse">
                <div className="h-8 bg-gray-200 rounded w-1/4 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              </div>
            </div>
          </div>
        </div>
      }
    >
      <GoalDataLoader initialGoalId={typeof goalId === "string" ? goalId : undefined} />
    </Suspense>
  );
}
