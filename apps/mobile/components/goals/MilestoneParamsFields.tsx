import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { DistanceChips } from "@/components/practices/DistanceChips";
import { StyleCategoryChips } from "@/components/practices/StyleCategoryChips";
import { NumberStepper } from "@/components/ui/NumberStepper";
import type {
  MilestoneRepsTimeParams,
  MilestoneSetParams,
  MilestoneTimeParams,
} from "@apps/shared/types";
import { TimeSecondsInput } from "./TimeSecondsInput";

interface FieldProps<P> {
  params: P;
  onChange: (params: P) => void;
}

const Labeled: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    {children}
  </View>
);

/** 距離 + 種目 + Swim/Pull/Kick。3 type 共通 */
function CommonFields<
  P extends MilestoneTimeParams | MilestoneRepsTimeParams | MilestoneSetParams,
>({ params, onChange }: FieldProps<P>) {
  const { t } = useTranslation();
  return (
    <>
      <Labeled label={t("goals.paramsForm.distanceLabel")}>
        <DistanceChips
          value={params.distance > 0 ? params.distance : ""}
          onChange={(value) => onChange({ ...params, distance: value === "" ? 0 : value })}
        />
      </Labeled>
      <StyleCategoryChips
        style={params.style}
        swimCategory={params.swim_category}
        onChangeStyle={(style) => onChange({ ...params, style })}
        onChangeCategory={(swim_category) => onChange({ ...params, swim_category })}
      />
    </>
  );
}

/** サークル (分・秒)。内部は合計秒で持つ */
function CircleFields<P extends MilestoneRepsTimeParams | MilestoneSetParams>({
  params,
  onChange,
}: FieldProps<P>) {
  const { t } = useTranslation();
  const circleMin = params.circle > 0 ? Math.floor(params.circle / 60) : "";
  const circleSec = params.circle > 0 ? params.circle % 60 : "";

  return (
    <View style={styles.row}>
      <View style={styles.cell}>
        <Labeled label={t("goals.paramsForm.circleMinLabel")}>
          <NumberStepper
            value={circleMin}
            onChange={(value) =>
              onChange({
                ...params,
                circle: (value === "" ? 0 : value) * 60 + (circleSec === "" ? 0 : circleSec),
              })
            }
            min={0}
            placeholder="1"
            accessibilityLabel={t("goals.paramsForm.circleMinLabel")}
          />
        </Labeled>
      </View>
      <View style={styles.cell}>
        <Labeled label={t("goals.paramsForm.circleSecLabel")}>
          <NumberStepper
            value={circleSec}
            onChange={(value) =>
              onChange({
                ...params,
                circle: (circleMin === "" ? 0 : circleMin) * 60 + (value === "" ? 0 : value),
              })
            }
            min={0}
            max={59}
            step={10}
            placeholder="30"
            accessibilityLabel={t("goals.paramsForm.circleSecLabel")}
          />
        </Labeled>
      </View>
    </View>
  );
}

function RepsSetsFields<P extends MilestoneRepsTimeParams | MilestoneSetParams>({
  params,
  onChange,
}: FieldProps<P>) {
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      <View style={styles.cell}>
        <Labeled label={t("goals.paramsForm.repsLabel")}>
          <NumberStepper
            value={params.reps > 0 ? params.reps : ""}
            onChange={(value) => onChange({ ...params, reps: value === "" ? 0 : value })}
            min={1}
            placeholder="4"
            accessibilityLabel={t("goals.paramsForm.repsLabel")}
          />
        </Labeled>
      </View>
      <View style={styles.cell}>
        <Labeled label={t("goals.paramsForm.setsLabel")}>
          <NumberStepper
            value={params.sets > 0 ? params.sets : ""}
            onChange={(value) => onChange({ ...params, sets: value === "" ? 0 : value })}
            min={1}
            placeholder="1"
            accessibilityLabel={t("goals.paramsForm.setsLabel")}
          />
        </Labeled>
      </View>
    </View>
  );
}

interface TimeParamsFieldsProps extends FieldProps<MilestoneTimeParams> {
  /** 目標タイムが保存できない値 (0以下) のまま保存された場合に true */
  targetTimeInvalid: boolean;
}

export const TimeParamsFields: React.FC<TimeParamsFieldsProps> = ({
  params,
  onChange,
  targetTimeInvalid,
}) => {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <CommonFields params={params} onChange={onChange} />
      <Labeled label={t("goals.paramsForm.targetTimeLabel")}>
        <TimeSecondsInput
          value={params.target_time}
          onChange={(seconds) => onChange({ ...params, target_time: seconds ?? 0 })}
          required
          requiredErrorMessage={t("goals.paramsForm.timeRequired")}
          invalidErrorMessage={t("goals.paramsForm.timeInvalid")}
          forceInvalid={targetTimeInvalid}
          accessibilityLabel={t("goals.paramsForm.targetTimeLabel")}
          testID="milestone-target-time"
        />
      </Labeled>
    </View>
  );
};

interface RepsTimeParamsFieldsProps extends FieldProps<MilestoneRepsTimeParams> {
  /** 平均目標タイムが保存できない値 (0以下) のまま保存された場合に true */
  targetAverageTimeInvalid: boolean;
}

export const RepsTimeParamsFields: React.FC<RepsTimeParamsFieldsProps> = ({
  params,
  onChange,
  targetAverageTimeInvalid,
}) => {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <CommonFields params={params} onChange={onChange} />
      <RepsSetsFields params={params} onChange={onChange} />
      <Labeled label={t("goals.paramsForm.averageTimeLabel")}>
        <TimeSecondsInput
          value={params.target_average_time}
          onChange={(seconds) => onChange({ ...params, target_average_time: seconds ?? 0 })}
          required
          requiredErrorMessage={t("goals.paramsForm.averageTimeRequired")}
          invalidErrorMessage={t("goals.paramsForm.timeInvalid")}
          forceInvalid={targetAverageTimeInvalid}
          accessibilityLabel={t("goals.paramsForm.averageTimeLabel")}
          testID="milestone-average-time"
        />
      </Labeled>
      <CircleFields params={params} onChange={onChange} />
    </View>
  );
};

export const SetParamsFields: React.FC<FieldProps<MilestoneSetParams>> = ({
  params,
  onChange,
}) => (
  <View style={styles.container}>
    <CommonFields params={params} onChange={onChange} />
    <RepsSetsFields params={params} onChange={onChange} />
    <CircleFields params={params} onChange={onChange} />
  </View>
);

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  cell: {
    flex: 1,
  },
});
