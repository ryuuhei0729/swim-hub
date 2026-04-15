"use client";

import React, { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts";
import FormStepper, { useFormSteps } from "@/components/ui/FormStepper";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import useUnsavedChangesWarning from "@/hooks/useUnsavedChangesWarning";
import { ONBOARDING_STEPS } from "@apps/shared/constants/onboarding";
import { parseTime } from "@apps/shared/utils/time";
import type { UserProfile } from "@apps/shared/types";
import Step1Welcome from "./steps/Step1Welcome";
import Step2Profile, { EMAIL_REGEX, type Step2FormData } from "./steps/Step2Profile";
import Step3BestTime, { type BestTimeEntry } from "./steps/Step3BestTime";

interface OnboardingWizardProps {
  initialProfile: UserProfile | null;
}

// FormStepper に渡す steps 配列（0-indexed）
const FORM_STEPS = ONBOARDING_STEPS.map((s) => ({
  id: String(s.id),
  label: s.label,
}));

interface Step2Snapshot extends Step2FormData {
  avatarUrl: string | null;
}

function buildInitialStep2(initialProfile: UserProfile | null): Step2Snapshot {
  const rawName = initialProfile?.name ?? "";
  return {
    name: EMAIL_REGEX.test(rawName.trim()) ? "" : rawName,
    gender: initialProfile?.gender ?? 0,
    birthday: initialProfile?.birthday ? initialProfile.birthday.split("T")[0] : "",
    bio: initialProfile?.bio ?? "",
    avatarUrl: initialProfile?.profile_image_path ?? null,
  };
}

export default function OnboardingWizard({ initialProfile }: OnboardingWizardProps) {
  const router = useRouter();
  const { updateProfile } = useAuth();
  const { currentStep, nextStep, prevStep } = useFormSteps(FORM_STEPS.length);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Step 2 のフォーム state (ステップ遷移で破棄されないよう Wizard に持ち上げる)
  const initialStep2 = useMemo(() => buildInitialStep2(initialProfile), [initialProfile]);
  const [step2FormData, setStep2FormData] = useState<Step2FormData>(() => ({
    name: initialStep2.name,
    gender: initialStep2.gender,
    birthday: initialStep2.birthday,
    bio: initialStep2.bio,
  }));
  const [step2AvatarUrl, setStep2AvatarUrl] = useState<string | null>(initialStep2.avatarUrl);
  // 最後に保存した (or 初期) スナップショット — dirty 判定のベースライン
  const [step2Saved, setStep2Saved] = useState<Step2Snapshot>(initialStep2);

  // Step 3 のエントリー (同上)
  const [step3Entries, setStep3Entries] = useState<BestTimeEntry[]>([]);

  // 未保存変更の検出
  const step2Dirty =
    step2FormData.name !== step2Saved.name ||
    step2FormData.gender !== step2Saved.gender ||
    step2FormData.birthday !== step2Saved.birthday ||
    step2FormData.bio !== step2Saved.bio ||
    step2AvatarUrl !== step2Saved.avatarUrl;

  // Step 3 は「実際に保存対象となる (タイム入力済み) エントリー」が 1 件でもあれば dirty。
  // タイム未入力の空エントリーは onSkip と同扱いなので警告の対象外。
  const step3HasTime = step3Entries.some((e) => parseTime(e.time) > 0);
  const hasUnsavedChanges = step2Dirty || step3HasTime;

  // onClose は "close" 文脈 (閉じるボタン押下) が発火したときに呼ばれるが、
  // Onboarding 画面には閉じるボタンが存在しないため実際には呼ばれないパス。
  // 将来 close UI を追加した時のフォールバックとして渡す (noop では無く dashboard へ逃げる)。
  const handleLeaveOnboarding = useCallback(() => {
    setIsSubmitted(true);
    router.push("/dashboard");
  }, [router]);

  const { showConfirmDialog, confirmContext, handleConfirmClose, handleCancelClose } =
    useUnsavedChangesWarning({
      isOpen: true,
      hasUnsavedChanges,
      isSubmitted,
      onClose: handleLeaveOnboarding,
    });

  // Step2: プロフィール保存して次へ
  // baseline は「今保存したまさにその値」を単独ソースとして updates から構築する。
  const handleProfileSave = useCallback(
    async (updates: Partial<UserProfile>) => {
      const { error } = await updateProfile(updates);
      if (error) {
        throw new Error(error.message ?? "プロフィールの保存に失敗しました");
      }
      const savedBirthday =
        typeof updates.birthday === "string"
          ? updates.birthday.split("T")[0]
          : "";
      setStep2Saved({
        name: updates.name ?? "",
        gender: updates.gender ?? 0,
        birthday: savedBirthday,
        bio: updates.bio ?? "",
        avatarUrl: updates.profile_image_path ?? null,
      });
      nextStep();
    },
    [updateProfile, nextStep],
  );

  // Step3 完了 or スキップ: オンボーディング完了
  // await 前に isSubmitted=true にして、ネットワーク遅延中のリロード時に
  // 誤った beforeunload 警告が出ないようにする。失敗時は戻す。
  const handleComplete = useCallback(async () => {
    setCompleting(true);
    setCompleteError(null);
    setIsSubmitted(true);

    try {
      const { error } = await updateProfile({ onboarding_completed: true });
      if (error) throw new Error(error.message ?? "完了処理に失敗しました");
      router.push("/dashboard");
    } catch (err) {
      // 失敗時は離脱警告を再度有効化
      setIsSubmitted(false);
      const message = err instanceof Error ? err.message : "完了処理に失敗しました";
      setCompleteError(message);
      setCompleting(false);
    }
    // 成功時は router.push で unmount されるため setCompleting(false) は不要。
    // 遷移中に「準備中...」表示が残る方が自然。
  }, [updateProfile, router]);

  return (
    <div className="bg-white rounded-xl shadow-lg p-4 sm:p-8 space-y-5 sm:space-y-8">
      {/* ステッパー */}
      <FormStepper steps={FORM_STEPS} currentStep={currentStep} className="mb-3 sm:mb-6" />

      {/* ステップコンテンツ */}
      {currentStep === 0 && <Step1Welcome onNext={nextStep} />}

      {currentStep === 1 && (
        <Step2Profile
          formData={step2FormData}
          setFormData={setStep2FormData}
          avatarUrl={step2AvatarUrl}
          setAvatarUrl={setStep2AvatarUrl}
          onNext={handleProfileSave}
          onBack={prevStep}
        />
      )}

      {currentStep === 2 && (
        <Step3BestTime
          entries={step3Entries}
          setEntries={setStep3Entries}
          onSkip={handleComplete}
          onBack={prevStep}
          completing={completing}
          completeError={completeError}
        />
      )}

      {/* 未保存変更の離脱確認ダイアログ */}
      <ConfirmDialog
        isOpen={showConfirmDialog}
        onConfirm={handleConfirmClose}
        onCancel={handleCancelClose}
        title="入力内容が保存されていません"
        message={
          confirmContext === "back"
            ? "設定を完了していません。このまま戻ると入力内容が失われます。"
            : "設定を完了していません。このまま離れると入力内容が失われます。"
        }
        confirmLabel={confirmContext === "back" ? "戻る" : "離れる"}
        cancelLabel="編集を続ける"
        variant="warning"
      />
    </div>
  );
}
