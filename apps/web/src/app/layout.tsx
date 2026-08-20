import type { Metadata } from "next";
import { Geist, Geist_Mono, Literata } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { cookies } from "next/headers";
import "./globals.css";
import "@copilotkit/react-core/v2/styles.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const literata = Literata({
  variable: "--font-literata",
  subsets: ["cyrillic", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "MyCharacter",
    template: "%s · MyCharacter",
  },
  description: "Collaborative, AI-assisted character sheets for tabletop role-playing games.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [locale, messages, cookieStore] = await Promise.all([
    getLocale(),
    getMessages(),
    cookies(),
  ]);
  const isDark = cookieStore.get("theme")?.value === "dark";

  return (
    <html
      lang={locale}
      data-theme={isDark ? "dark" : "light"}
      className={`${geistSans.variable} ${geistMono.variable} ${literata.variable} ${isDark ? "dark" : ""} h-full antialiased`}
    >
      <body className="min-h-full">
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
