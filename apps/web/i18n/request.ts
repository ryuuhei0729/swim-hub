import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  // next-intl v3: requestLocale is a Promise in App Router
  let locale = await requestLocale;

  // Validate that the incoming locale is supported, fall back to default
  if (!locale || !routing.locales.includes(locale as (typeof routing.locales)[number])) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../../shared/messages/${locale}.json`)).default,
  };
});
