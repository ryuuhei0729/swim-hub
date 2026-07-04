"use client";

import React, { useEffect, useState } from "react";
import { ArrowLeftIcon, EnvelopeIcon, PaperAirplaneIcon } from "@heroicons/react/24/outline";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

const SUBJECT_OPTIONS = ["question", "bug", "suggestion", "account", "other"] as const;
const APP_OPTIONS = ["swimhub", "timer", "scanner"] as const;
const PLATFORM_OPTIONS = ["web", "ios", "android"] as const;

type AppOption = (typeof APP_OPTIONS)[number];

export default function ContactPage() {
  const t = useTranslations("contact");
  const tCommon = useTranslations("common");
  const tSubject = useTranslations("contact.subjectOptions");
  const tApp = useTranslations("contact.appOptions");
  const tPlatform = useTranslations("contact.platformOptions");
  const locale = useLocale();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  // 利用アプリはリンク元の ?app= から自動プリセット（既定は swimhub）、環境は既定 web
  const [sourceApp, setSourceApp] = useState<AppOption>("swimhub");
  const [platform, setPlatform] = useState<(typeof PLATFORM_OPTIONS)[number]>("web");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");

  // リンク元アプリ（?app=timer / ?app=scanner）を読み取ってプリセット
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("app");
    if (param && (APP_OPTIONS as readonly string[]).includes(param)) {
      setSourceApp(param as AppOption);
    }
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus("idle");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          sourceApp,
          platform,
          locale,
          pageUrl: window.location.href,
          referrer: document.referrer || null,
        }),
      });

      if (!response.ok) {
        throw new Error("send failed");
      }

      setSubmitStatus("success");
      setFormData({ name: "", email: "", subject: "", message: "" });
    } catch {
      setSubmitStatus("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-blue-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* ヘッダー */}
        <div className="mb-8">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="inline-flex items-center text-sm text-gray-600 hover:text-blue-600 transition-colors mb-6"
          >
            <ArrowLeftIcon className="w-4 h-4 mr-2" />
            {tCommon("back")}
          </button>
          <div className="flex items-center mb-4">
            <EnvelopeIcon className="w-8 h-8 text-blue-600 mr-3" />
            <h1 className="text-3xl font-bold text-gray-900">{t("title")}</h1>
          </div>
          <p className="text-gray-600">{t("description")}</p>
        </div>

        {/* お問い合わせフォーム */}
        <div className="bg-white rounded-lg shadow-sm p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* お名前 */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                {t("name")} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="name"
                name="name"
                required
                value={formData.name}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder={t("namePlaceholder")}
              />
            </div>

            {/* メールアドレス */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                {t("email")} <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                id="email"
                name="email"
                required
                value={formData.email}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder={t("emailPlaceholder")}
              />
            </div>

            {/* 件名 */}
            <div>
              <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-2">
                {t("subject")} <span className="text-red-500">*</span>
              </label>
              <select
                id="subject"
                name="subject"
                required
                value={formData.subject}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">{tSubject("placeholder")}</option>
                {SUBJECT_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {tSubject(opt)}
                  </option>
                ))}
              </select>
            </div>

            {/* 利用アプリ・ご利用環境 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label htmlFor="sourceApp" className="block text-sm font-medium text-gray-700 mb-2">
                  {t("appLabel")}
                </label>
                <select
                  id="sourceApp"
                  name="sourceApp"
                  value={sourceApp}
                  onChange={(e) => setSourceApp(e.target.value as AppOption)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {APP_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {tApp(opt)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="platform" className="block text-sm font-medium text-gray-700 mb-2">
                  {t("platformLabel")}
                </label>
                <select
                  id="platform"
                  name="platform"
                  value={platform}
                  onChange={(e) =>
                    setPlatform(e.target.value as (typeof PLATFORM_OPTIONS)[number])
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {PLATFORM_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {tPlatform(opt)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* メッセージ */}
            <div>
              <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">
                {t("message")} <span className="text-red-500">*</span>
              </label>
              <textarea
                id="message"
                name="message"
                required
                rows={8}
                value={formData.message}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder={t("messagePlaceholder")}
              />
            </div>

            {/* 送信ボタン */}
            <div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    {t("submitting")}
                  </>
                ) : (
                  <>
                    <PaperAirplaneIcon className="w-5 h-5 mr-2" />
                    {t("submitButton")}
                  </>
                )}
              </button>
            </div>

            {/* 送信ステータス */}
            {submitStatus === "success" && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
                {t("successMessage")}
              </div>
            )}
            {submitStatus === "error" && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
                {t("errorMessage")}
              </div>
            )}
          </form>
        </div>

        {/* 補足情報 */}
        <div className="mt-8 bg-blue-50 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">{t("aboutTitle")}</h2>
          <ul className="space-y-2 text-sm text-gray-700">
            <li>• {t("aboutItem1")}</li>
            <li>• {t("aboutItem2")}</li>
            <li>
              • {t("aboutItem3Prefix")}
              <Link href="/support" className="text-blue-600 hover:text-blue-800 underline">
                {t("aboutItem3LinkText")}
              </Link>
              {t("aboutItem3Suffix")}
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
