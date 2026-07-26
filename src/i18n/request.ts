import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

export const locales = ["ru", "en"] as const;
export type Locale = (typeof locales)[number];

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const requested = cookieStore.get("locale")?.value;
  const locale: Locale = requested === "en" ? "en" : "ru";

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
