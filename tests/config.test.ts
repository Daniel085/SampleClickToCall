import { beforeEach, describe, expect, it } from "vitest";
import { clearConfig, loadConfig, saveConfig, type SipConfig } from "../src/config";

describe("config storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null when empty", () => {
    expect(loadConfig()).toBeNull();
  });

  it("round-trips a config", () => {
    const cfg: SipConfig = {
      wsUri: "wss://sip.example.com/ws",
      sipUri: "sip:alice@example.com",
      authUser: "alice",
      password: "secret",
      displayName: "Alice",
      iceServers: [{ urls: "stun:stun.example.com" }],
    };
    saveConfig(cfg);
    expect(loadConfig()).toEqual(cfg);
  });

  it("returns null for corrupted JSON", () => {
    localStorage.setItem("sip-config", "not json");
    expect(loadConfig()).toBeNull();
  });

  it("clears config", () => {
    saveConfig({ wsUri: "a", sipUri: "b", authUser: "c", password: "d" });
    clearConfig();
    expect(loadConfig()).toBeNull();
  });
});
