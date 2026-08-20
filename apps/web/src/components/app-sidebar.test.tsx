// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppSidebar, type SidebarProfile } from "./app-sidebar";

vi.mock("next/link", () => ({
  default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props} />
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/feed",
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "ru",
}));

vi.mock("@/app/auth/actions", () => ({
  signOut: vi.fn(),
}));

// The bell polls the API on mount, which is irrelevant to the shell layout.
vi.mock("@/components/notification-bell", () => ({
  NotificationBell: () => <div data-testid="notification-bell" />,
}));

// The history list fetches and navigates; the shell test only cares it mounts.
vi.mock("@/components/workspace-history", () => ({
  WorkspaceHistory: () => <div data-testid="workspace-history" />,
}));

const baseProfile: SidebarProfile = {
  username: "gamemaster",
  displayName: "Game Master",
  siteRole: "user",
};

function renderSidebar(
  overrides: Partial<SidebarProfile> = {},
  collapsed = false,
) {
  return render(
    <AppSidebar
      profile={{ ...baseProfile, ...overrides }}
      locale="ru"
      initialCollapsed={collapsed}
      initialIsDark={false}
    />,
  );
}

afterEach(() => {
  cleanup();
  document.cookie = "sidebar_collapsed=;path=/;max-age=0";
});

describe("AppSidebar", () => {
  it("exposes every primary destination, with the article composer first", () => {
    renderSidebar();
    const nav = screen.getByRole("navigation", { name: "primary" });
    const hrefs = Array.from(nav.querySelectorAll("a")).map((link) =>
      link.getAttribute("href"),
    );
    expect(hrefs).toEqual([
      "/dashboard/posts/new",
      "/dashboard/search",
      "/dashboard/feed",
      "/dashboard/messages",
      "/dashboard",
      "/dashboard/systems",
    ]);
  });

  it("opens the article composer in a new tab", () => {
    renderSidebar();
    const composer = screen.getByRole("link", { name: "newArticle" });
    expect(composer).toHaveAttribute("href", "/dashboard/posts/new");
    expect(composer).toHaveAttribute("target", "_blank");
  });

  it("marks the current destination for assistive technology", () => {
    renderSidebar();
    const nav = screen.getByRole("navigation", { name: "primary" });
    const current = nav.querySelector('[aria-current="page"]');
    expect(current).toHaveAttribute("href", "/dashboard/feed");
  });

  it("persists the collapsed state so the server can render it without a flash", () => {
    renderSidebar();
    const toggle = screen.getByRole("button", { name: "collapse" });
    fireEvent.click(toggle);

    expect(document.cookie).toContain("sidebar_collapsed=1");
  });

  it("hides dynamic history while keeping stable controls when collapsed", () => {
    renderSidebar();
    expect(screen.getByTestId("workspace-history")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "collapse" }));

    expect(screen.queryByTestId("workspace-history")).not.toBeInTheDocument();
    expect(screen.getByTestId("sidebar-footer")).toHaveClass("mt-auto");
    expect(
      screen.getByRole("navigation", { name: "primary" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "themeDark" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "language" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "account" })).toBeInTheDocument();
  });

  it("reveals the expand control over the logo when the collapsed header is hovered", () => {
    renderSidebar({}, true);
    expect(
      screen.queryByRole("button", { name: "expand" }),
    ).not.toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByTestId("sidebar-header"));
    expect(screen.getByRole("button", { name: "expand" })).toBeInTheDocument();

    fireEvent.mouseLeave(screen.getByTestId("sidebar-header"));
    expect(
      screen.queryByRole("button", { name: "expand" }),
    ).not.toBeInTheDocument();
  });

  it("keeps settings and sign-out inside the account menu", () => {
    renderSidebar();
    expect(screen.queryByText("signOut")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "account" }));

    expect(screen.getByRole("dialog", { name: "account" })).toBeInTheDocument();
    expect(screen.getByText("profileSettings")).toBeInTheDocument();
    expect(screen.getByText("signOut")).toBeInTheDocument();
  });

  it("hides the admin console from regular members", () => {
    renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "account" }));
    expect(screen.queryByText("adminConsole")).not.toBeInTheDocument();
  });

  it("offers the admin console to moderators", () => {
    renderSidebar({ siteRole: "moderator" });
    fireEvent.click(screen.getByRole("button", { name: "account" }));
    expect(screen.getByText("adminConsole")).toBeInTheDocument();
  });

  it("closes the account menu on Escape", () => {
    renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "account" }));
    expect(screen.getByRole("dialog", { name: "account" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "account" }),
    ).not.toBeInTheDocument();
  });
});
