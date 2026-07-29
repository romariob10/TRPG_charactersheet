import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/auth-shell", () => ({
  AuthShell: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/auth-form", () => ({
  AuthForm: () => <input aria-label="email" />,
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) =>
    key === "recoveryUnavailable"
      ? "Восстановление пароля пока не подключено."
      : key,
}));

describe("ResetPasswordPage", () => {
  it("does not show password recovery without email delivery", async () => {
    const { default: ResetPasswordPage } = await import("@/app/auth/reset-password/page");
    const html = renderToStaticMarkup(await ResetPasswordPage());

    expect(html).toMatch(/восстановление пароля пока не подключено/i);
    expect(html).not.toContain("<input");
  });
});
