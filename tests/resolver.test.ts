import { describe, expect, it } from "vitest";
import { resolveTargetUri } from "../src/types";

describe("resolveTargetUri", () => {
  it("returns null for empty input", () => {
    expect(resolveTargetUri("", "example.com")).toBeNull();
    expect(resolveTargetUri("   ", "example.com")).toBeNull();
  });

  it("passes through a full sip: URI", () => {
    expect(resolveTargetUri("sip:bob@example.com", "other.com")).toBe("sip:bob@example.com");
  });

  it("passes through a sips: URI", () => {
    expect(resolveTargetUri("sips:bob@example.com", "other.com")).toBe("sips:bob@example.com");
  });

  it("appends the local domain for bare extensions", () => {
    expect(resolveTargetUri("1001", "pbx.local")).toBe("sip:1001@pbx.local");
  });

  it("returns null for bare extensions with no local domain", () => {
    expect(resolveTargetUri("1001", undefined)).toBeNull();
  });

  it("trims whitespace", () => {
    expect(resolveTargetUri("  1001 ", "pbx.local")).toBe("sip:1001@pbx.local");
  });
});
