import { describe, expect, it } from "vitest";
import {
  fallbackUsername,
  isValidUsername,
  normalizeEmailToUsername,
  usernameForRegistration,
} from "../src/modules/profiles/username.js";

describe("normalizeEmailToUsername", () => {
  it.each([
    ["ivan.petrov@example.com", "ivan-petrov"],
    ["User_Name-1@example.com", "user_name-1"],
    ["hello+tag@site.io", "hello-tag"],
    ["--weird--@site.io", "weird"],
  ])("normalizes %s to %s", (email, expected) => {
    expect(normalizeEmailToUsername(email)).toBe(expected);
  });

  it("returns an empty string when the local part is unusable", () => {
    expect(normalizeEmailToUsername("a@b.com")).toBe("");
    expect(normalizeEmailToUsername("...@b.com")).toBe("");
    expect(normalizeEmailToUsername("@b.com")).toBe("");
  });

  it("never keeps the email domain", () => {
    const result = normalizeEmailToUsername("someone@example.com");
    expect(result).not.toContain("example");
    expect(result).not.toContain("@");
  });

  it("caps the length at 30 characters", () => {
    const result = normalizeEmailToUsername(`${"a".repeat(60)}@b.com`);
    expect(result.length).toBeLessThanOrEqual(30);
    expect(isValidUsername(result)).toBe(true);
  });
});

describe("fallbackUsername", () => {
  it("derives a stable username from the first uuid characters", () => {
    expect(fallbackUsername("52fd08c3-4808-405c-83a3-43e703ac15b0")).toBe(
      "user-52fd08c3",
    );
    expect(isValidUsername(fallbackUsername("ab12cd34-0000-0000-0000-000000000000"))).toBe(true);
  });
});

describe("usernameForRegistration", () => {
  it("prefers the normalized email and falls back to the uuid form", () => {
    expect(usernameForRegistration("ivan@example.com", "52fd08c3-4808-405c-83a3-43e703ac15b0")).toBe("ivan");
    expect(usernameForRegistration("a@b.com", "52fd08c3-4808-405c-83a3-43e703ac15b0")).toBe("user-52fd08c3");
  });
});
