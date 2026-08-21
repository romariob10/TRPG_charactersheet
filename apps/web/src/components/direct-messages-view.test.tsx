// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DirectConversationSummary,
  DirectMessage,
} from "@mycharacter/contracts";
import { DirectMessagesView } from "./direct-messages-view";

vi.mock("next/link", () => ({
  default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props} />
  ),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ trigger }: { trigger: () => React.ReactNode }) => trigger(),
}));

const apiFetch = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

const currentUserId = "00000000-0000-4000-8000-000000000001";
const participantId = "00000000-0000-4000-8000-000000000002";
const conversationId = "00000000-0000-4000-8000-000000000003";
const scrollIntoView = vi.fn();

function conversation(unreadCount = 0): DirectConversationSummary {
  return {
    id: conversationId,
    participant: {
      id: participantId,
      username: "bob",
      displayName: "Bob",
    },
    lastMessage: null,
    unreadCount,
    lastMessageAt: "2026-08-20T10:00:00.000Z",
  };
}

function message(overrides: Partial<DirectMessage> = {}): DirectMessage {
  return {
    id: "00000000-0000-4000-8000-000000000004",
    conversationId,
    senderId: participantId,
    body: "hello",
    readAt: "2026-08-20T10:00:01.000Z",
    createdAt: "2026-08-20T10:00:00.000Z",
    ...overrides,
  };
}

function renderMessages(initialUnread = 0) {
  return render(
    <DirectMessagesView
      initialConversations={[conversation(initialUnread)]}
      currentUserId={currentUserId}
      locale="en"
      initialConversationId={conversationId}
    />,
  );
}

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });
  scrollIntoView.mockReset();
});

afterEach(() => {
  cleanup();
  apiFetch.mockReset();
  vi.restoreAllMocks();
});

describe("DirectMessagesView", () => {
  it("does not pull the reader down when new messages arrive", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    let messageRequests = 0;
    apiFetch.mockImplementation(async (url: unknown) => {
      if (url === `/api/messages/conversations/${conversationId}`) {
        messageRequests += 1;
        return {
          messages:
            messageRequests === 1
              ? [message()]
              : [message(), message({ id: crypto.randomUUID(), body: "new" })],
        };
      }
      if (url === "/api/messages/conversations") {
        return { conversations: [conversation()] };
      }
      throw new Error(`Unexpected request: ${String(url)}`);
    });

    renderMessages();
    await screen.findByText("hello");
    const scroller = screen.getByTestId("direct-messages-scroll");
    Object.defineProperties(scroller, {
      scrollHeight: { configurable: true, value: 1_000 },
      clientHeight: { configurable: true, value: 400 },
      scrollTop: { configurable: true, value: 100, writable: true },
    });
    fireEvent.scroll(scroller);
    scrollIntoView.mockClear();

    await act(async () =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await screen.findByText("new");

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("grows the composer with its content and caps it at a scrollable height", async () => {
    apiFetch.mockResolvedValue({ messages: [] });
    renderMessages();

    const textarea = screen.getByPlaceholderText("placeholder");
    Object.defineProperty(textarea, "scrollHeight", {
      configurable: true,
      value: 96,
    });
    fireEvent.change(textarea, { target: { value: "first\nsecond\nthird" } });

    expect(textarea).toHaveStyle({ height: "96px", overflowY: "hidden" });

    Object.defineProperty(textarea, "scrollHeight", {
      configurable: true,
      value: 220,
    });
    fireEvent.change(textarea, {
      target: { value: "first\nsecond\nthird\nfourth\nfifth\nsixth\nseventh" },
    });

    expect(textarea).toHaveStyle({ height: "144px", overflowY: "auto" });
  });

  it("sends with Enter and keeps Shift+Enter for a new line", async () => {
    apiFetch.mockImplementation(
      async (url: unknown, options?: { method?: string }) => {
        if (options?.method === "POST") {
          return message({
            senderId: currentUserId,
            isMine: true,
            body: "hello",
          });
        }
        if (url === `/api/messages/conversations/${conversationId}`) {
          return { messages: [] };
        }
        return { conversations: [conversation()] };
      },
    );
    renderMessages();
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        `/api/messages/conversations/${conversationId}`,
      ),
    );
    apiFetch.mockClear();

    const textarea = screen.getByPlaceholderText("placeholder");
    fireEvent.change(textarea, { target: { value: "hello" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(apiFetch).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, { key: "Enter" });
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        `/api/messages/conversations/${conversationId}`,
        {
          method: "POST",
          body: JSON.stringify({ body: "hello" }),
        },
      ),
    );
  });

  it("links invite paths and http URLs without allowing unsafe protocols", async () => {
    const invitePath =
      "/invites/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";
    const externalUrl = "https://example.com/rules?chapter=1";
    apiFetch.mockResolvedValue({
      messages: [
        message({
          body: `Join: ${invitePath}. Rules: ${externalUrl}. [unsafe](javascript:alert(1)) [external](//evil.example) ![unsafe](data:text/html,bad)`,
        }),
      ],
    });

    renderMessages();

    const inviteLink = await screen.findByRole("link", { name: invitePath });
    expect(inviteLink).toHaveAttribute("href", invitePath);
    expect(screen.getByRole("link", { name: externalUrl })).toHaveAttribute(
      "href",
      externalUrl,
    );
    expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(document.querySelector('a[href^="//"]')).toBeNull();
    expect(document.querySelector('img[src^="data:"]')).toBeNull();
  });

  it("reads the open dialog before refreshing counters and keeps it read", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });

    let resolveRefreshMessages:
      ((value: { messages: DirectMessage[] }) => void) | undefined;
    const refreshMessages = new Promise<{ messages: DirectMessage[] }>(
      (resolve) => {
        resolveRefreshMessages = resolve;
      },
    );
    let messageRequests = 0;
    apiFetch.mockImplementation(async (url: unknown) => {
      if (url === `/api/messages/conversations/${conversationId}`) {
        messageRequests += 1;
        if (messageRequests === 1) return { messages: [] };
        return refreshMessages;
      }
      if (url === "/api/messages/conversations") {
        return { conversations: [conversation(4)] };
      }
      throw new Error(`Unexpected request: ${String(url)}`);
    });

    renderMessages(2);
    await waitFor(() =>
      expect(screen.queryByText("2")).not.toBeInTheDocument(),
    );
    apiFetch.mockClear();

    await act(async () =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).not.toHaveBeenCalledWith("/api/messages/conversations");

    await act(async () => {
      resolveRefreshMessages?.({ messages: [message()] });
      await refreshMessages;
    });

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/api/messages/conversations"),
    );
    expect(screen.queryByText("4")).not.toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();
  });
});
