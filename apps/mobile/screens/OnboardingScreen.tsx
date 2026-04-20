import React, { useState, useCallback, useEffect } from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthProvider";
import { Stepper } from "@/components/shared/Stepper";
import { OnboardingWelcome } from "@/components/onboarding/OnboardingWelcome";
import { OnboardingProfile } from "@/components/onboarding/OnboardingProfile";
import { OnboardingBestTime } from "@/components/onboarding/OnboardingBestTime";
import { ONBOARDING_STEP_LABELS, ONBOARDING_TOTAL_STEPS } from "@/constants/onboarding";
import type { UserProfile } from "@swim-hub/shared/types";
import { supabase } from "@/lib/supabase";

/**
 * オンボーディングウィザード状態管理画面
 * 3 ステップのオンボーディングフローを制御する
 */
export const OnboardingScreen: React.FC = () => {
  const { user, updateProfile, updateOnboardingCompleted } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [profileCache, setProfileCache] = useState<Partial<UserProfile> | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [completing, setCompleting] = useState(false);

  // 現在のユーザープロフィールを取得
  useEffect(() => {
    if (!user || !supabase) {
      setProfileLoading(false);
      return;
    }
    const loadProfile = async () => {
      try {
        const { data } = await supabase!
          .from("users")
          .select("*")
          .eq("id", user.id)
          .single();
        setProfileCache(data as Partial<UserProfile> | null);
      } catch {
        // 取得失敗時は null のままとする
      } finally {
        setProfileLoading(false);
      }
    };
    void loadProfile();
  }, [user]);

  const goNext = useCallback(() => {
    setCurrentStep((prev) => Math.min(prev + 1, ONBOARDING_TOTAL_STEPS));
  }, []);

  const goBack = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  }, []);

  // Step 2: プロフィール保存 → 次へ
  const handleProfileSave = useCallback(
    async (updates: Partial<UserProfile>) => {
      // 更新内容がある場合のみ保存
      if (Object.keys(updates).length > 0) {
        const { error } = await updateProfile(updates);
        if (error) {
          throw new Error(error.message ?? "プロフィールの保存に失敗しました");
        }
        setProfileCache((prev) => (prev ? { ...prev, ...updates } : updates));
      }
      goNext();
    },
    [updateProfile, goNext],
  );

  // Step 3: 完了処理 — DB に onboarding_completed = true を保存
  const handleComplete = useCallback(async () => {
    setCompleting(true);
    const { error } = await updateOnboardingCompleted(true);
    if (error) {
      setCompleting(false);
      throw new Error(error.message ?? "完了処理に失敗しました");
    }
    // updateOnboardingCompleted が成功すると AuthProvider の state が更新され、
    // App.tsx の AppNavigator が onboardingCompleted = true を検知して MainStack に切り替わる
  }, [updateOnboardingCompleted]);

  if (profileLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <View style={styles.overlay}>
      {/* ダークバックドロップ */}
      <View style={styles.backdrop} />
      {/* ウィザードカード */}
      <SafeAreaView style={styles.cardWrapper} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.card}>
          {/* ステッパー */}
          <View style={styles.stepperWrapper}>
            <Stepper
              currentStep={currentStep}
              totalSteps={ONBOARDING_TOTAL_STEPS}
              stepLabels={ONBOARDING_STEP_LABELS}
            />
          </View>

          {/* ステップコンテンツ */}
          <View style={styles.content}>
            {currentStep === 1 && <OnboardingWelcome onNext={goNext} />}

            {currentStep === 2 && (
              <OnboardingProfile
                initialProfile={profileCache}
                onNext={handleProfileSave}
                onBack={goBack}
              />
            )}

            {currentStep === 3 && (
              <OnboardingBestTime onComplete={handleComplete} onBack={goBack} />
            )}

          </View>

          {completing && (
            <View style={styles.completingOverlay}>
              <ActivityIndicator size="large" color="#2563EB" />
            </View>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "transparent",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  cardWrapper: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  card: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    overflow: "hidden",
    maxHeight: "90%",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  stepperWrapper: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  completingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
});
