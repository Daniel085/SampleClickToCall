import { resolveTargetUri, type CallInfo, type CallRecord, type CallState, type Listener, type RegistrationStatus, type SipClientLike } from "./types";
import type { SipConfig } from "./config";

const MOCK_HISTORY_KEY = "sip-mock-history";

export class FakeSipClient implements SipClientLike {
  private regStatus: RegistrationStatus = "offline";
  private callState: CallState = "idle";
  private callInfo: CallInfo | null = null;
  private history: CallRecord[] = loadMockHistory();
  private localDomain = "mock.local";
  private muted = false;
  private inboundTimer: number | null = null;
  private callStartedAt = 0;
  private volumeTimer: number | null = null;

  private regListeners = new Set<Listener<RegistrationStatus>>();
  private callListeners = new Set<Listener<{ state: CallState; info: CallInfo | null }>>();
  private historyListeners = new Set<Listener<CallRecord[]>>();
  private volumeListeners = new Set<Listener<number>>();

  onRegistrationChange(fn: Listener<RegistrationStatus>): () => void {
    this.regListeners.add(fn);
    fn(this.regStatus);
    return () => this.regListeners.delete(fn);
  }

  onCallChange(fn: Listener<{ state: CallState; info: CallInfo | null }>): () => void {
    this.callListeners.add(fn);
    fn({ state: this.callState, info: this.callInfo });
    return () => this.callListeners.delete(fn);
  }

  onCallHistory(fn: Listener<CallRecord[]>): () => void {
    this.historyListeners.add(fn);
    fn(this.history);
    return () => this.historyListeners.delete(fn);
  }

  onVolume(fn: Listener<number>): () => void {
    this.volumeListeners.add(fn);
    return () => this.volumeListeners.delete(fn);
  }

  hasActiveSession(): boolean {
    return this.callInfo !== null && this.callState !== "idle" && this.callState !== "ended";
  }

  async connect(cfg: SipConfig): Promise<void> {
    const uriHost = cfg.sipUri.split("@")[1];
    if (uriHost) this.localDomain = uriHost;
    this.setReg("registering");
    await delay(300);
    this.setReg("registered");
    this.scheduleFakeInbound();
  }

  async disconnect(): Promise<void> {
    this.cancelInbound();
    if (this.callInfo) await this.hangup();
    this.setReg("offline");
  }

  async call(target: string): Promise<void> {
    if (this.regStatus !== "registered") throw new Error("Not registered");
    if (this.callInfo) throw new Error("Call already in progress");
    const resolved = resolveTargetUri(target, this.localDomain);
    if (!resolved) throw new Error(`Invalid dial target: ${target}`);
    this.cancelInbound();

    const info: CallInfo = { peer: target, direction: "outbound" };
    this.callInfo = info;
    this.setCall("ringing-outbound", info);

    await delay(1200);
    if (this.callState !== "ringing-outbound") return;
    this.startConnected(info);
  }

  async answer(): Promise<void> {
    if (this.callState !== "ringing-inbound" || !this.callInfo) {
      throw new Error("No inbound call to answer");
    }
    this.startConnected(this.callInfo);
  }

  async reject(): Promise<void> {
    if (this.callState !== "ringing-inbound" || !this.callInfo) {
      throw new Error("No inbound call to reject");
    }
    this.endCall(false);
  }

  async hangup(): Promise<void> {
    if (!this.callInfo) return;
    this.endCall(this.callState === "in-call");
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  sendDtmf(_tone: string): void {
    // noop in mock
  }

  async setInputDevice(_deviceId: string): Promise<void> {
    // noop
  }

  async setOutputDevice(_deviceId: string): Promise<void> {
    // noop
  }

  private setReg(s: RegistrationStatus): void {
    this.regStatus = s;
    this.regListeners.forEach((fn) => fn(s));
  }

  private setCall(state: CallState, info: CallInfo | null): void {
    this.callState = state;
    this.callInfo = info;
    this.callListeners.forEach((fn) => fn({ state, info }));
  }

  private startConnected(info: CallInfo): void {
    this.callStartedAt = Date.now();
    this.setCall("in-call", { ...info, startedAt: this.callStartedAt });
    this.startFakeVolume();
  }

  private endCall(connected: boolean): void {
    if (!this.callInfo) return;
    const info = this.callInfo;
    const endedAt = Date.now();
    const record: CallRecord = {
      peer: info.peer,
      direction: info.direction,
      startedAt: connected ? this.callStartedAt : endedAt,
      endedAt,
      durationSec: connected ? Math.round((endedAt - this.callStartedAt) / 1000) : 0,
      connected,
    };
    this.pushHistory(record);
    this.stopFakeVolume();
    this.setCall("ended", null);
    setTimeout(() => {
      if (this.callState === "ended") {
        this.setCall("idle", null);
        this.scheduleFakeInbound();
      }
    }, 1500);
  }

  private pushHistory(record: CallRecord): void {
    this.history = [record, ...this.history].slice(0, 50);
    try {
      localStorage.setItem(MOCK_HISTORY_KEY, JSON.stringify(this.history));
    } catch {
      // ignore
    }
    this.historyListeners.forEach((fn) => fn(this.history));
  }

  private scheduleFakeInbound(): void {
    this.cancelInbound();
    this.inboundTimer = window.setTimeout(() => {
      if (this.regStatus !== "registered" || this.callInfo) return;
      const info: CallInfo = { peer: `sip:demo@${this.localDomain}`, direction: "inbound" };
      this.callInfo = info;
      this.setCall("ringing-inbound", info);
    }, 15000);
  }

  private cancelInbound(): void {
    if (this.inboundTimer !== null) {
      clearTimeout(this.inboundTimer);
      this.inboundTimer = null;
    }
  }

  private startFakeVolume(): void {
    this.stopFakeVolume();
    this.volumeTimer = window.setInterval(() => {
      const v = this.muted ? 0 : 0.15 + Math.random() * 0.55;
      this.volumeListeners.forEach((fn) => fn(v));
    }, 80);
  }

  private stopFakeVolume(): void {
    if (this.volumeTimer !== null) {
      clearInterval(this.volumeTimer);
      this.volumeTimer = null;
    }
    this.volumeListeners.forEach((fn) => fn(0));
  }
}

function loadMockHistory(): CallRecord[] {
  try {
    const raw = localStorage.getItem(MOCK_HISTORY_KEY);
    return raw ? (JSON.parse(raw) as CallRecord[]) : [];
  } catch {
    return [];
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
