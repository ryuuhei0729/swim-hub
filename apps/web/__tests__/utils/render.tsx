import {
  render as rtlRender,
  renderHook as rtlRenderHook,
  type RenderOptions,
  type RenderHookOptions,
} from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import messages from "@apps/shared/messages/ja.json";

const Wrapper = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider
    locale="ja"
    messages={messages as unknown as AbstractIntlMessages}
  >
    {children}
  </NextIntlClientProvider>
);

export const renderWithI18n = (ui: ReactElement, options?: RenderOptions) =>
  rtlRender(ui, { wrapper: Wrapper, ...options });

export const renderHookWithI18n = <Result, Props>(
  hook: (props: Props) => Result,
  options?: RenderHookOptions<Props>,
) => rtlRenderHook(hook, { wrapper: Wrapper, ...options });

export * from "@testing-library/react";
