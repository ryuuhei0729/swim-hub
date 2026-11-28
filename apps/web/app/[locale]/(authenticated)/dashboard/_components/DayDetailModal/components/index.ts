export { AttendanceButton, AttendanceModal } from "./AttendanceSection";
export { TeamRecordsButton } from "./TeamRecordsSection";
export { PracticeDetails } from "./PracticeSection";
export { RecordSplitTimes, CompetitionDetails, CompetitionWithEntry } from "./CompetitionSection";
// NOTE: DeleteConfirmModal は /practice, /competition 履歴タブからも共有するため
// components/ui/ に切り出し済み。ダッシュボードからの既存 import (`./components`) を壊さないよう再エクスポートする。
export { DeleteConfirmModal } from "@/components/ui/DeleteConfirmModal";
