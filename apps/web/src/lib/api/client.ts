export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export function toApiClientError(response: Response, body: unknown) {
  if (isApiError(body)) {
    return new ApiClientError(
      body.error.message,
      response.status,
      body.error.code,
    );
  }
  return new ApiClientError(`API request failed (${response.status}).`, response.status);
}

function isApiError(value: unknown): value is {
  error: { code: string; message: string; requestId: string };
} {
  if (!value || typeof value !== "object" || !("error" in value)) return false;
  const error = value.error;
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      "message" in error &&
      "requestId" in error &&
      typeof error.code === "string" &&
      typeof error.message === "string" &&
      typeof error.requestId === "string",
  );
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers,
  });
  const body = await readResponseBody(response);
  if (!response.ok) throw toApiClientError(response, body);
  return body as T;
}

export async function readResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return undefined;
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
