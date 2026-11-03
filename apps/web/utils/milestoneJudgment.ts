// =============================================================================
// web のマイルストーン判定 — 判定モードの設定 + 判定の実行
// =============================================================================
// web も mobile と同じ「確認モード」で判定する。条件を満たす記録が見つかっても自動では
// 達成にせず、achievement_candidate に根拠を置く。ユーザーが MilestoneAchievementPrompter
// の「もしかしてマイルストーンを達成しましたか？」で「達成！」を押したときに達成になる。
//
// 判定モードは shared/api/goals.ts のモジュール変数 (既定は自動達成) なので、web で判定を
// 走らせる経路はどれも、判定前にこのモジュールを読み込んでおく必要がある。
// - サーバー: goals/_server/GoalDataLoader.tsx (runMilestoneJudgment をここから import)
// - クライアント: DashboardClient / practiceMilestoneRefresh (同上)、shared の練習・大会記録の
//   ミューテーション (認証済みページ全体に常にマウントされる MilestoneAchievementPrompter が
//   このモジュールを import するので、ページの操作より先に設定済みになる)
import { configureMilestoneJudgment } from "@apps/shared/api/goals";

configureMilestoneJudgment({ autoAchieve: false });

export { runMilestoneJudgment } from "@apps/shared/utils/milestoneJudgment";
