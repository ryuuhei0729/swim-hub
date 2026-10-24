import {
  render as rtlRender,
  renderHook as rtlRenderHook,
  type RenderOptions,
  type RenderHookOptions,
} from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import enMessages from "@apps/shared/messages/en.json";
import jaMessages from "@apps/shared/messages/ja.json";

export type TestLocale = "ja" | "en";

const MESSAGES: Record<TestLocale, AbstractIntlMessages> = {
  ja: jaMessages as unknown as AbstractIntlMessages,
  en: enMessages as unknown as AbstractIntlMessages,
};

type I18nOptions = { locale?: TestLocale };

const createWrapper = (locale: TestLocale) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
        {children}
      </NextIntlClientProvider>
    );
  };

/** 本物の next-intl Provider に shared/messages を渡して描画する (既定は ja) */
export const renderWithI18n = (ui: ReactElement, options?: RenderOptions & I18nOptions) => {
  const { locale = "ja", ...rest } = options ?? {};
  return rtlRender(ui, { wrapper: createWrapper(locale), ...rest });
};

export const renderHookWithI18n = <Result, Props>(
  hook: (props: Props) => Result,
  options?: RenderHookOptions<Props> & I18nOptions,
) => {
  const { locale = "ja", ...rest } = options ?? {};
  return rtlRenderHook(hook, { wrapper: createWrapper(locale), ...rest });
};

export * from "@testing-library/react";
