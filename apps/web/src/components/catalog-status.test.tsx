import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import ru from "../../messages/ru.json";
import { CharacterCard } from "@/components/character-card";
import { TemplateMapper } from "@/components/editor/template-mapper";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
}));

describe("catalog status presentation", () => {
  it("shows a partial catalog as completed instead of processing forever", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider
        locale="ru"
        messages={ru}
        timeZone="Europe/Moscow"
      >
        <CharacterCard
          locale="ru"
          character={{
            id: "11111111-1111-4111-8111-111111111111",
            name: "Герой",
            role: "editor",
            revision: 0,
            status: "active",
            catalogStatus: "partial",
            pageCount: 1,
            updatedAt: "2026-07-20T00:00:00.000Z",
            deletedAt: null,
          }}
        />
      </NextIntlClientProvider>,
    );

    expect(html).toContain("Готов");
    expect(html).not.toContain("Каталогизация");
  });

  it("does not offer approval again for an already approved template", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider
        locale="ru"
        messages={ru}
        timeZone="Europe/Moscow"
      >
        <TemplateMapper
          initialTemplate={{
            id: "33333333-3333-4333-8333-333333333333",
            title: "Система",
            gameSystem: "НРИ",
            pageCount: 1,
            catalogStatus: "ready",
            approvedAt: "2026-07-20T00:00:00.000Z",
            updatedAt: "2026-07-20T00:00:00.000Z",
            isPublic: false,
            fields: [],
            pdfUrl: "",
          }}
        />
      </NextIntlClientProvider>,
    );

    expect(html).toContain("Разметка подтверждена");
    expect(html).not.toContain("Подтвердить разметку");
  });

  it("shows an approved public template as public without a future-condition label", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider
        locale="ru"
        messages={ru}
        timeZone="Europe/Moscow"
      >
        <TemplateMapper
          initialTemplate={{
            id: "44444444-4444-4444-8444-444444444444",
            title: "Система",
            gameSystem: "НРИ",
            pageCount: 1,
            catalogStatus: "ready",
            approvedAt: "2026-07-20T00:00:00.000Z",
            updatedAt: "2026-07-20T00:00:00.000Z",
            isPublic: true,
            fields: [],
            pdfUrl: "",
          }}
        />
      </NextIntlClientProvider>,
    );

    expect(html).toContain("Публичный");
    expect(html).not.toContain("Публичный после подтверждения");
  });
});
