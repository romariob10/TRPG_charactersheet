// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TemplateComments } from "./template-comments";

vi.mock("next/link", () => ({
  default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props} />
  ),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/api/client", () => ({
  apiFetch: vi.fn(),
}));

afterEach(cleanup);

describe("TemplateComments", () => {
  it("shows the total comment count rather than only the loaded page size", () => {
    render(
      <TemplateComments
        templateId="00000000-0000-4000-8000-000000000001"
        initialItems={[]}
        initialNextCursor="next-page"
        initialTotalCount={25}
        authenticated={false}
        currentUsername={null}
        isAdmin={false}
        locale="en"
      />,
    );

    expect(screen.getByRole("heading", { name: /commentsTitle/ })).toHaveTextContent(
      "(25)",
    );
  });
});
