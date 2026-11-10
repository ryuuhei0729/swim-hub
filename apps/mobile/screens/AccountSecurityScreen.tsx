import React, { useState } from "react";
import { View, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { EmailChangeSettings } from "@/components/settings/EmailChangeSettings";
import { IdentityLinkSettings } from "@/components/settings/IdentityLinkSettings";
import { AccountDeleteSettings } from "@/components/settings/AccountDeleteSettings";
import { PasswordChangeModal } from "@/components/profile";
import { ListGroup, ListRow } from "@/components/account/AccountList";
import { useSafeInsets } from "@/hooks/useSafeInsets";
import { getSafeFooterPadding } from "@/utils/safeFooterPadding";
import { colors } from "@/constants/theme";

/**
 * アカウント > ログインとセキュリティ
 * メールアドレス・パスワード・ログイン連携、いちばん下に離してアカウント削除
 */
export const AccountSecurityScreen: React.FC = () => {
  const { t } = useTranslation();
  // Android の Edge-to-Edge 強制下ではシステムナビゲーションバーの背後まで描画されるため、
  // 最下部のアカウント削除が隠れないよう下部インセットを足す
  const insets = useSafeInsets();
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: getSafeFooterPadding(32, insets.bottom) },
        ]}
      >
        <View style={styles.cardSlot}>
          <EmailChangeSettings />
        </View>

        <ListGroup>
          <ListRow
            label={t("mypage.passwordChange.title")}
            onPress={() => setShowPasswordModal(true)}
            testID="security-password"
          />
        </ListGroup>

        <View style={styles.cardSlot}>
          <IdentityLinkSettings />
        </View>

        {/* 取り消せない操作なので、ほかの設定から離して最後に置く */}
        <View style={[styles.cardSlot, styles.dangerZone]}>
          <AccountDeleteSettings />
        </View>
      </ScrollView>

      <PasswordChangeModal visible={showPasswordModal} onClose={() => setShowPasswordModal(false)} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 16,
    gap: 16,
  },
  cardSlot: {
    marginHorizontal: 16,
  },
  dangerZone: {
    marginTop: 24,
  },
});
