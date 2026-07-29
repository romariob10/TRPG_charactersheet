import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const baseEnvironment = {
  DATABASE_URL: "postgresql://mycharacter:mycharacter@postgres:5432/mycharacter",
  PUBLIC_ORIGIN: "http://localhost:3000",
  COOKIE_SECURE: "false",
};

describe("API runtime configuration", () => {
  it("rejects Secure session cookies on an HTTP public origin", () => {
    expect(() => loadConfig({ ...baseEnvironment, COOKIE_SECURE: "true" })).toThrow(
      "COOKIE_SECURE=true requires an HTTPS PUBLIC_ORIGIN.",
    );
  });
});
