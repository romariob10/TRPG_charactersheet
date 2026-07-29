export interface ApiConfig {
  cookieSecure: boolean;
  databaseUrl: string;
  host: string;
  port: number;
  publicOrigin: string;
  storageRoot: string;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  const databaseUrl = environment.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const port = Number(environment.PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be a valid TCP port.");
  }

  const publicOrigin = parsePublicOrigin(environment.PUBLIC_ORIGIN);
  const cookieSecure = parseBoolean(environment.COOKIE_SECURE, "COOKIE_SECURE");
  if (cookieSecure && new URL(publicOrigin).protocol !== "https:") {
    throw new Error("COOKIE_SECURE=true requires an HTTPS PUBLIC_ORIGIN.");
  }

  return {
    databaseUrl,
    host: environment.HOST ?? "0.0.0.0",
    port,
    publicOrigin,
    cookieSecure,
    storageRoot: environment.STORAGE_ROOT ?? "/var/lib/mycharacter/pdfs",
  };
}

function parsePublicOrigin(value: string | undefined): string {
  if (!value) {
    throw new Error("PUBLIC_ORIGIN is required.");
  }

  try {
    const url = new URL(value);
    if (url.origin !== value) {
      throw new Error("PUBLIC_ORIGIN must be an origin without a path.");
    }
    return url.origin;
  } catch {
    throw new Error("PUBLIC_ORIGIN must be a valid origin without a path.");
  }
}

function parseBoolean(value: string | undefined, name: string): boolean {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new Error(`${name} must be either true or false.`);
}
