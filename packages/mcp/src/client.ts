import type { AgentPresenceRequest, PostBlock, SocialPost } from "@mycharacter/contracts";

export interface MyCharacterClientOptions {
  token?: string;
  baseUrl?: string;
  origin?: string;
}

export interface UserAuthResult {
  id: string;
  email: string;
}

export interface CharacterSummary {
  id: string;
  name: string;
  isPublic: boolean;
  gameSystem?: string | null;
  templateId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export class MyCharacterApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "MyCharacterApiError";
    this.status = status;
  }
}

export class MyCharacterClient {
  public readonly baseUrl: string;
  public readonly origin: string;
  private readonly token?: string;
  private presenceTimer?: ReturnType<typeof setInterval>;
  private presence?: AgentPresenceRequest;
  private cookies: Map<string, string> = new Map();

  constructor(options: MyCharacterClientOptions = {}) {
    this.token = options.token || process.env.MYCHARACTER_TOKEN;
    this.baseUrl = (options.baseUrl || process.env.MYCHARACTER_API_URL || "http://localhost:8080").replace(/\/+$/, "");
    this.origin = (options.origin || process.env.MYCHARACTER_ORIGIN || this.baseUrl).replace(/\/+$/, "");
  }

  public setCookie(name: string, value: string): void {
    this.cookies.set(name, value);
  }

  public getCookieHeader(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  public clearCookies(): void {
    this.cookies.clear();
  }

  public isAuthenticated(): boolean {
    return Boolean(this.token) || this.cookies.has("session") || this.cookies.size > 0;
  }

  private parseSetCookie(headerValue: string | null): void {
    if (!headerValue) return;
    const parts = headerValue.split(";")[0].split("=");
    if (parts.length >= 2) {
      const name = parts[0].trim();
      const val = parts.slice(1).join("=").trim();
      this.cookies.set(name, val);
    }
  }

  public async requestApi<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    if (!path.startsWith("/api/") || path.includes("..") || path.includes("\\")) throw new Error("Invalid API path.");
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const headers = new Headers(init.headers || {});

    if (this.token) headers.set("Authorization", `Bearer ${this.token}`);
    const cookieHeader = this.getCookieHeader();
    if (cookieHeader && !this.token) {
      headers.set("Cookie", cookieHeader);
    }

    const method = (init.method || "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      if (!headers.has("Origin")) {
        headers.set("Origin", this.origin);
      }
      if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
    }

    const response = await fetch(url, {
      ...init,
      headers,
      redirect: "error",
      signal: init.signal ?? AbortSignal.timeout(30_000),
    });

    // Node fetch might return combined or array set-cookie
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      this.parseSetCookie(setCookie);
    }

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status} ${response.statusText}`;
      try {
        const errJson = (await response.json()) as { error?: { message?: string; code?: string } };
        if (errJson.error?.message) {
          errorMessage = `${errJson.error.code ? `[${errJson.error.code}] ` : ""}${errJson.error.message}`;
        }
      } catch {
        // Non-JSON error
      }
      throw new MyCharacterApiError(response.status, errorMessage);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return (await response.json()) as T;
  }

  async setPresence(presence: AgentPresenceRequest) {
    await this.requestApi("/api/agent-presence", { method: "PUT", body: JSON.stringify(presence) });
    this.presence = presence;
    if (!this.presenceTimer) {
      this.presenceTimer = setInterval(() => {
        if (!this.presence) return;
        void this.requestApi("/api/agent-presence", { method: "PUT", body: JSON.stringify(this.presence) })
           .catch((error: unknown) => {
            if (error instanceof MyCharacterApiError && [401, 403].includes(error.status)) this.stopPresence();
          });
      }, 10_000);
      this.presenceTimer.unref();
    }
    return { connected: true };
  }

  private stopPresence() {
    clearInterval(this.presenceTimer);
    this.presenceTimer = undefined;
    this.presence = undefined;
  }

  async leaveEditor() {
    this.stopPresence();
    await this.requestApi("/api/agent-presence", { method: "DELETE" });
    return { connected: false };
  }

  async close() {
    if (this.presence) await this.leaveEditor().catch(() => this.stopPresence());
    this.stopPresence();
  }

  // Auth
  async register(email: string, password: string): Promise<UserAuthResult> {
    const result = await this.requestApi<{ user: UserAuthResult }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    return result.user;
  }

  async login(email: string, password: string): Promise<UserAuthResult> {
    const result = await this.requestApi<{ user: UserAuthResult }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    return result.user;
  }

  async logout(): Promise<void> {
    await this.requestApi<void>("/api/auth/logout", {
      method: "POST",
      body: JSON.stringify({}),
    });
    this.clearCookies();
  }

  // Profile
  async setUsername(username: string): Promise<{ username: string }> {
    return this.requestApi<{ username: string }>("/api/profiles/me", {
      method: "PATCH",
      body: JSON.stringify({ username }),
    });
  }

  async getMyProfile(): Promise<Record<string, unknown>> {
    return this.requestApi<Record<string, unknown>>("/api/profiles/me");
  }

  async getUserProfile(username: string): Promise<Record<string, unknown>> {
    return this.requestApi<Record<string, unknown>>(`/api/profiles/${encodeURIComponent(username)}`);
  }

  // Characters
  async listCharacters(): Promise<CharacterSummary[]> {
    const result = await this.requestApi<{ characters: CharacterSummary[] }>("/api/characters");
    return result.characters;
  }

  async getCharacter(id: string): Promise<Record<string, unknown>> {
    return this.requestApi<Record<string, unknown>>(`/api/characters/${encodeURIComponent(id)}`);
  }

  async createCharacter(name: string, templateId?: string | null, sheetVersionId?: string, systemId?: string): Promise<Record<string, unknown>> {
    return this.requestApi<Record<string, unknown>>("/api/characters", {
      method: "POST",
      body: JSON.stringify({ name, ...(templateId ? { templateId } : {}), sheetVersionId, systemId }),
    });
  }

  async updateCharacterMetadata(
    id: string,
    updates: { name?: string; isPublic?: boolean }
  ): Promise<Record<string, unknown>> {
    return this.requestApi<Record<string, unknown>>(`/api/characters/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
  }

  async updateCharacterField(
    id: string,
    input: {
      fieldId: string;
      expectedVersion: number;
      clientMutationId: string;
      value: unknown;
    }
  ): Promise<Record<string, unknown>> {
    return this.requestApi<Record<string, unknown>>(
      `/api/characters/${encodeURIComponent(id)}/fields/${encodeURIComponent(input.fieldId)}`,
      {
        method: "PUT",
        body: JSON.stringify({
          expectedVersion: input.expectedVersion,
          clientMutationId: input.clientMutationId,
          value: input.value,
        }),
      }
    );
  }

  // Systems / Templates
  async listSystems(): Promise<Record<string, unknown>[]> {
    const result = await this.requestApi<{ templates?: Record<string, unknown>[] }>("/api/templates");
    return result.templates ?? [];
  }

  async getSystem(id: string): Promise<Record<string, unknown>> {
    return this.requestApi<Record<string, unknown>>(`/api/templates/${encodeURIComponent(id)}`);
  }

  // Posts & Feed
  async listFeedPosts(): Promise<SocialPost[]> {
    const result = await this.requestApi<{ posts: SocialPost[] }>("/api/posts");
    return result.posts;
  }

  async getPost(username: string, slug: string): Promise<SocialPost> {
    const result = await this.requestApi<{ post: SocialPost }>(
      `/api/public/posts/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`
    );
    return result.post;
  }

  async uploadPostImage(
    fileBuffer: Buffer | Uint8Array,
    filename: string = "image.png",
    mediaType: string = "image/png"
  ): Promise<{ fileId: string; url: string }> {
    const formData = new FormData();
    const blob = new Blob([fileBuffer as unknown as BlobPart], { type: mediaType });
    formData.append("image", blob, filename);

    const result = await this.requestApi<{ success: number; file: { id: string; url: string } }>(
      "/api/posts/images",
      {
        method: "POST",
        body: formData,
      }
    );
    return { fileId: result.file.id, url: result.file.url };
  }

  async createPost(blocks: PostBlock[]): Promise<SocialPost> {
    return this.requestApi<SocialPost>("/api/posts", {
      method: "POST",
      body: JSON.stringify({ blocks }),
    });
  }
}

/**
 * Converts standard Markdown text into MyCharacter PostBlock array.
 */
export function markdownToBlocks(markdown: string): PostBlock[] {
  const blocks: PostBlock[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Delimiter --- or ***
    if (/^(\*{3}|---|___)$/.test(trimmed)) {
      blocks.push({ type: "delimiter", data: {} });
      i++;
      continue;
    }

    // Header #, ##, ###, ####
    const headerMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      const hashes = headerMatch[1].length;
      const level = Math.min(4, Math.max(2, hashes >= 3 ? hashes : 2)) as 2 | 3 | 4;
      blocks.push({
        type: "header",
        data: { text: headerMatch[2].trim(), level },
      });
      i++;
      continue;
    }

    // Blockquote >
    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({
        type: "quote",
        data: {
          text: quoteLines.join("\n"),
          caption: "",
        },
      });
      continue;
    }

    // Unordered List - or *
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push({
        type: "list",
        data: { style: "unordered", items },
      });
      continue;
    }

    // Ordered List 1. 2.
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push({
        type: "list",
        data: { style: "ordered", items },
      });
      continue;
    }

    // Paragraph
    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith("#") &&
      !lines[i].trim().startsWith(">") &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !/^(\*{3}|---|___)$/.test(lines[i].trim())
    ) {
      paragraphLines.push(lines[i].trim());
      i++;
    }
    if (paragraphLines.length > 0) {
      blocks.push({
        type: "paragraph",
        data: { text: paragraphLines.join(" ") },
      });
    }
  }

  return blocks;
}
