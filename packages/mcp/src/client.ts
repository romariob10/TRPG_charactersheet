import type { PostBlock, SocialPost } from "@mycharacter/contracts";

export interface MyCharacterClientOptions {
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

export class MyCharacterClient {
  public readonly baseUrl: string;
  public readonly origin: string;
  private cookies: Map<string, string> = new Map();

  constructor(options: MyCharacterClientOptions = {}) {
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
    return this.cookies.has("session") || this.cookies.size > 0;
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

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const headers = new Headers(init.headers || {});

    const cookieHeader = this.getCookieHeader();
    if (cookieHeader) {
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
      throw new Error(errorMessage);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return (await response.json()) as T;
  }

  // Auth
  async register(email: string, password: string): Promise<UserAuthResult> {
    const result = await this.request<{ user: UserAuthResult }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    return result.user;
  }

  async login(email: string, password: string): Promise<UserAuthResult> {
    const result = await this.request<{ user: UserAuthResult }>("/api/auth/sign-in", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    return result.user;
  }

  async logout(): Promise<void> {
    await this.request<void>("/api/auth/sign-out", {
      method: "POST",
      body: JSON.stringify({}),
    });
    this.clearCookies();
  }

  // Profile
  async setUsername(username: string): Promise<{ username: string }> {
    return this.request<{ username: string }>("/api/profiles/username", {
      method: "POST",
      body: JSON.stringify({ username }),
    });
  }

  async getMyProfile(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("/api/profiles/me");
  }

  async getUserProfile(username: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(`/api/public/profiles/${encodeURIComponent(username)}`);
  }

  // Characters
  async listCharacters(): Promise<CharacterSummary[]> {
    const result = await this.request<{ characters: CharacterSummary[] }>("/api/characters");
    return result.characters;
  }

  async getCharacter(id: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(`/api/characters/${encodeURIComponent(id)}`);
  }

  async createCharacter(name: string, templateId?: string | null): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("/api/characters", {
      method: "POST",
      body: JSON.stringify({ name, templateId: templateId ?? null }),
    });
  }

  async updateCharacterMetadata(
    id: string,
    updates: { name?: string; isPublic?: boolean }
  ): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(`/api/characters/${encodeURIComponent(id)}`, {
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
    return this.request<Record<string, unknown>>(
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
    const result = await this.request<{ templates?: Record<string, unknown>[] }>("/api/templates");
    return result.templates ?? [];
  }

  async getSystem(id: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(`/api/templates/${encodeURIComponent(id)}`);
  }

  // Posts & Feed
  async listFeedPosts(): Promise<SocialPost[]> {
    const result = await this.request<{ posts: SocialPost[] }>("/api/posts");
    return result.posts;
  }

  async getPost(username: string, slug: string): Promise<SocialPost> {
    const result = await this.request<{ post: SocialPost }>(
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

    const result = await this.request<{ success: number; file: { id: string; url: string } }>(
      "/api/posts/images",
      {
        method: "POST",
        body: formData,
      }
    );
    return { fileId: result.file.id, url: result.file.url };
  }

  async createPost(blocks: PostBlock[]): Promise<SocialPost> {
    return this.request<SocialPost>("/api/posts", {
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
