import React from "react";
import { View, StyleSheet } from "react-native";

interface GoalProgressBarProps {
  /** 0〜100 */
  progress: number;
}

export const GoalProgressBar: React.FC<GoalProgressBarProps> = ({ progress }) => {
  const width = Math.min(Math.max(progress, 0), 100);
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${width}%` }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E5E7EB",
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: "#2563EB",
  },
});
