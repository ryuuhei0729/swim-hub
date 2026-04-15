import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { ONBOARDING_TOTAL_STEPS } from "@/constants/onboarding";

interface StepperProps {
  currentStep: number; // 1-indexed
  totalSteps?: number;
  stepLabels?: readonly string[];
}

/**
 * Mobile 用 Stepper コンポーネント
 * Web の FormStepper と視覚的に統一（ステップ番号・プログレス表示）
 */
export const Stepper: React.FC<StepperProps> = ({
  currentStep,
  totalSteps = ONBOARDING_TOTAL_STEPS,
  stepLabels,
}) => {
  return (
    <View style={styles.container}>
      {/* プログレスバー */}
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${((currentStep - 1) / (totalSteps - 1)) * 100}%` },
          ]}
        />
      </View>

      {/* ステップドット */}
      <View style={styles.dotsRow}>
        {Array.from({ length: totalSteps }, (_, i) => {
          const stepNum = i + 1;
          const isDone = stepNum < currentStep;
          const isCurrent = stepNum === currentStep;
          return (
            <View key={stepNum} style={styles.dotWrapper}>
              <View
                style={[
                  styles.dot,
                  isDone && styles.dotDone,
                  isCurrent && styles.dotCurrent,
                ]}
              >
                {isDone ? (
                  <Text style={styles.dotCheckmark}>✓</Text>
                ) : (
                  <Text style={[styles.dotLabel, isCurrent && styles.dotLabelCurrent]}>
                    {stepNum}
                  </Text>
                )}
              </View>
              {stepLabels?.[i] ? (
                <Text
                  style={[
                    styles.stepLabelText,
                    isCurrent && styles.stepLabelTextCurrent,
                  ]}
                  numberOfLines={1}
                >
                  {stepLabels[i]}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>

      {/* ステップカウンター */}
      <Text style={styles.counter}>
        ステップ {currentStep} / {totalSteps}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 4,
    gap: 8,
  },
  progressTrack: {
    height: 4,
    backgroundColor: "#E5E7EB",
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 4,
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#2563EB",
    borderRadius: 2,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  dotWrapper: {
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#E5E7EB",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  dotDone: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  dotCurrent: {
    backgroundColor: "#FFFFFF",
    borderColor: "#2563EB",
  },
  dotLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#9CA3AF",
  },
  dotLabelCurrent: {
    color: "#2563EB",
  },
  dotCheckmark: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  stepLabelText: {
    fontSize: 10,
    color: "#9CA3AF",
    textAlign: "center",
  },
  stepLabelTextCurrent: {
    color: "#2563EB",
    fontWeight: "600",
  },
  counter: {
    fontSize: 12,
    color: "#6B7280",
    textAlign: "right",
  },
});
