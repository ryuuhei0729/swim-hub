import React from "react";
import { RecordsScreen, type RecordsScreenProps } from "./RecordsScreen";

/**
 * 大会画面（大会記録一覧）
 * RecordsScreenをラップ
 */
export const CompetitionsScreen: React.FC<RecordsScreenProps> = (props) => {
  return <RecordsScreen {...props} />;
};
