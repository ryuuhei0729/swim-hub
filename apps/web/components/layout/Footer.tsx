"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import {
  HeartIcon,
  ShieldCheckIcon,
  DocumentTextIcon,
  QuestionMarkCircleIcon,
  EnvelopeIcon,
  NewspaperIcon,
  InformationCircleIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { formatDate } from "@apps/shared/utils/date";

const familyServices = [
  {
    nameKey: "SwimHub",
    descKey: "swimhubDesc" as const,
    href: "https://swim-hub.app",
    iconSrc: "/icon.png",
    current: true,
  },
  {
    nameKey: "SwimHub Timer",
    descKey: "timerDesc" as const,
    href: "https://timer.swim-hub.app",
    iconSrc: "/timer-icon.png",
    current: false,
  },
  {
    nameKey: "SwimHub Scanner",
    descKey: "scannerDesc" as const,
    href: "https://scanner.swim-hub.app",
    iconSrc: "/scanner-icon.png",
    current: false,
  },
];

export default function Footer() {
  const t = useTranslations("footer");
  const currentYear = new Date().getFullYear();

  const footerLinks = [
    {
      name: t("links.privacy"),
      href: "/privacy",
      icon: ShieldCheckIcon,
    },
    {
      name: t("links.terms"),
      href: "/terms",
      icon: DocumentTextIcon,
    },
    {
      name: t("links.support"),
      href: "/support",
      icon: QuestionMarkCircleIcon,
    },
    {
      name: t("links.contact"),
      href: "/contact",
      icon: EnvelopeIcon,
    },
    {
      name: t("links.blog"),
      href: "/blog",
      icon: NewspaperIcon,
    },
    {
      name: t("links.about"),
      href: "/about",
      icon: InformationCircleIcon,
    },
    {
      name: t("links.tokushoho"),
      href: "/tokushoho",
      icon: DocumentTextIcon,
    },
  ];

  return (
    <footer className="bg-white border-t border-gray-200 mt-auto">
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* 左側：システム情報 */}
          <div className="space-y-4">
            <div className="flex items-center">
              <div className="w-6 h-6 flex items-center justify-center mr-2">
                <Image
                  src="/favicon.png"
                  alt="SwimHub"
                  width={24}
                  height={24}
                  className="w-full h-full object-contain"
                />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">SwimHub</h3>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              {t("description")}
            </p>
            <div className="flex items-center text-sm text-gray-500">
              <span>{t("madeWith")}</span>
              <HeartIcon className="h-4 w-4 text-red-500 mx-1" />
              <span>{t("forSwimmers")}</span>
            </div>
          </div>

          {/* 右側：法的情報とサポート */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
              {t("supportTitle")}
            </h4>
            <div className="grid grid-cols-3 sm:grid-cols-2 gap-1 sm:gap-2">
              {footerLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center text-[10px] sm:text-sm text-gray-600 hover:text-blue-600 transition-colors duration-200 whitespace-nowrap"
                >
                  <link.icon className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2 shrink-0" />
                  {link.name}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* SwimHub サービス一覧 */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <h4 className="text-sm font-semibold text-gray-900 tracking-wide mb-4">
            {t("services.title")}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {familyServices.map((service) =>
              service.current ? (
                <div
                  key={service.nameKey}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg bg-blue-50 border border-blue-200"
                >
                  <Image
                    src={service.iconSrc}
                    alt={service.nameKey}
                    width={128}
                    height={128}
                    className="w-16 h-16 sm:w-32 sm:h-32 shrink-0 object-contain"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-blue-700">{service.nameKey}</span>
                      <span className="text-[10px] font-medium text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">
                        {t("services.currentBadge")}
                      </span>
                    </div>
                    <p className="text-xs text-blue-600/70 truncate">{t(`services.${service.descKey}`)}</p>
                  </div>
                </div>
              ) : (
                <a
                  key={service.nameKey}
                  href={service.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 rounded-lg bg-gray-50 border border-gray-200 hover:bg-gray-100 hover:border-gray-300 transition-colors duration-200 group"
                >
                  <Image
                    src={service.iconSrc}
                    alt={service.nameKey}
                    width={128}
                    height={128}
                    className="w-16 h-16 sm:w-32 sm:h-32 shrink-0 object-contain opacity-60 group-hover:opacity-100 transition-opacity"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
                        {service.nameKey}
                      </span>
                      <ArrowTopRightOnSquareIcon className="w-3 h-3 text-gray-400 group-hover:text-gray-500" />
                    </div>
                    <p className="text-xs text-gray-500 truncate">{t(`services.${service.descKey}`)}</p>
                  </div>
                </a>
              ),
            )}
          </div>
        </div>

        {/* 下部：コピーライトとバージョン情報 */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="flex flex-col items-center justify-between space-y-4 sm:flex-row sm:space-y-0">
            <div className="flex flex-col items-center sm:items-start space-y-1">
              <div className="text-sm text-gray-500">
                © {currentYear} SwimHub. All rights reserved.
              </div>
              <div className="text-xs text-gray-400"></div>
            </div>

            <div className="flex items-center space-x-4 text-xs text-gray-400">
              <span>Last updated: {formatDate(new Date(), "numeric")}</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
