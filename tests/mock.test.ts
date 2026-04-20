import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSipClient } from "../src/mock";
import type { CallState, RegistrationStatus } from "../src/types";

function makeCfg() {
  return {
    wsUri: "wss://mock.local/ws",
    sipUri: "sip:alice@mock.local",
    authUser: "alice",
    password: "x",
  };
}

describe("FakeSipClient", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  it("transitions registration: offline -> registering -> registered", async () => {
    const c = new FakeSipClient();
    const states: RegistrationStatus[] = [];
    c.onRegistrationChange((s) => states.push(s));
    const p = c.connect(makeCfg());
    await vi.advanceTimersByTimeAsync(400);
    await p;
    expect(states).toEqual(["offline", "registering", "registered"]);
  });

  it("rejects calls when not registered", async () => {
    const c = new FakeSipClient();
    await expect(c.call("1001")).rejects.toThrow(/Not registered/);
  });

  it("runs outbound call through ringing then in-call", async () => {
    const c = new FakeSipClient();
    const states: CallState[] = [];
    c.onCallChange(({ state }) => states.push(state));
    await vi.advanceTimersByTimeAsync(0);
    const reg = c.connect(makeCfg());
    await vi.advanceTimersByTimeAsync(400);
    await reg;

    const call = c.call("1001");
    await vi.advanceTimersByTimeAsync(50);
    expect(states).toContain("ringing-outbound");
    await vi.advanceTimersByTimeAsync(1300);
    await call;
    expect(states).toContain("in-call");
    expect(c.hasActiveSession()).toBe(true);
  });

  it("records history on hangup after connect", async () => {
    const c = new FakeSipClient();
    const reg = c.connect(makeCfg());
    await vi.advanceTimersByTimeAsync(400);
    await reg;

    const call = c.call("1001");
    await vi.advanceTimersByTimeAsync(1500);
    await call;

    let history: any[] = [];
    c.onCallHistory((h) => (history = h));
    await c.hangup();
    expect(history.length).toBe(1);
    expect(history[0].peer).toBe("1001");
    expect(history[0].connected).toBe(true);
    expect(history[0].direction).toBe("outbound");
  });

  it("records a missed call when rejecting inbound", async () => {
    const c = new FakeSipClient();
    const reg = c.connect(makeCfg());
    await vi.advanceTimersByTimeAsync(400);
    await reg;

    await vi.advanceTimersByTimeAsync(16000);
    expect(c.hasActiveSession()).toBe(true);

    let history: any[] = [];
    c.onCallHistory((h) => (history = h));
    await c.reject();
    expect(history.length).toBe(1);
    expect(history[0].connected).toBe(false);
    expect(history[0].direction).toBe("inbound");
  });
});
