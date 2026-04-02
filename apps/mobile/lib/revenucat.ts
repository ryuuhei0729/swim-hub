/**
 * RevenueCat SDK ラッパー
 * iOS のみ対応。Android では全操作をスキップする。
 */
import { Platform } from "react-native";
import Purchases, {
  type PurchasesOfferings,
  type PurchasesPackage,
  type CustomerInfo,
} from "react-native-purchases";
import Constants from "expo-constants";

const IOS_API_KEY =
  Constants.expoConfig?.extra?.revenuecatIosApiKey || "appl_PLACEHOLDER_KEY";

const isValidApiKey = IOS_API_KEY !== "appl_PLACEHOLDER_KEY" && IOS_API_KEY.startsWith("appl_");

let isInitialized = false;

/** SDK を初期化する（iOS のみ、有効なAPIキーがある場合のみ） */
export async function initRevenueCat(): Promise<void> {
  if (Platform.OS !== "ios") return;
  if (isInitialized) return;
  if (!isValidApiKey) {
    console.log("RevenueCat: APIキー未設定のため初期化をスキップします");
    return;
  }

  try {
    Purchases.configure({ apiKey: IOS_API_KEY });
    isInitialized = true;
  } catch (err) {
    console.error("RevenueCat 初期化エラー:", err);
  }
}

/** Supabase user.id で RevenueCat にログインする */
export async function loginRevenueCat(userId: string): Promise<void> {
  if (Platform.OS !== "ios" || !isInitialized) return;

  try {
    await Purchases.logIn(userId);
  } catch (err) {
    console.error("RevenueCat ログインエラー:", err);
  }
}

/** RevenueCat からログアウトする */
export async function logoutRevenueCat(): Promise<void> {
  if (Platform.OS !== "ios" || !isInitialized) return;

  try {
    await Purchases.logOut();
  } catch (err) {
    console.error("RevenueCat ログアウトエラー:", err);
  }
}

/** 利用可能なオファリングを取得する */
export async function getOfferings(): Promise<PurchasesOfferings | null> {
  if (Platform.OS !== "ios" || !isInitialized) return null;

  try {
    const offerings = await Purchases.getOfferings();
    return offerings;
  } catch (err) {
    console.error("RevenueCat オファリング取得エラー:", err);
    return null;
  }
}

/** パッケージを購入する */
export async function purchasePackage(
  pkg: PurchasesPackage,
): Promise<CustomerInfo | null> {
  if (Platform.OS !== "ios" || !isInitialized) return null;

  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return customerInfo;
  } catch (err: unknown) {
    // ユーザーがキャンセルした場合はエラーとして扱わない
    if (err && typeof err === "object" && "userCancelled" in err && err.userCancelled) {
      return null;
    }
    throw err;
  }
}

/** 購入をリストアする */
export async function restorePurchases(): Promise<CustomerInfo | null> {
  if (Platform.OS !== "ios" || !isInitialized) return null;

  try {
    const customerInfo = await Purchases.restorePurchases();
    return customerInfo;
  } catch (err) {
    console.error("RevenueCat リストアエラー:", err);
    throw err;
  }
}

/** 顧客情報を取得する */
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (Platform.OS !== "ios" || !isInitialized) return null;

  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return customerInfo;
  } catch (err) {
    console.error("RevenueCat 顧客情報取得エラー:", err);
    return null;
  }
}

/** 顧客情報の変更リスナーを登録する。クリーンアップ用の関数を返す */
export function addCustomerInfoListener(
  listener: (info: CustomerInfo) => void,
): () => void {
  if (Platform.OS !== "ios" || !isInitialized) {
    return () => {};
  }

  Purchases.addCustomerInfoUpdateListener(listener);
  return () => {
    Purchases.removeCustomerInfoUpdateListener(listener);
  };
}
