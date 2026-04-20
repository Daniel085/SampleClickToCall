export type RegistrationStatus = "offline" | "registering" | "registered" | "failed";

export type CallState = "idle" | "ringing-outbound" | "ringing-inbound" | "in-call" | "ended";

export interface CallInfo {
  peer: string;
  direction: "inbound" | "outbound";
  startedAt?: number;
}

export interface CallRecord {
  peer: string;
  direction: "inbound" | "outbound";
  startedAt: number;
  endedAt: number;
  durationSec: number;
  connected: boolean;
}

export type Listener<T> = (value: T) => void;

import type { SipConfig } from "./config";

export interface SipClientLike {
  onRegistrationChange(fn: Listener<RegistrationStatus>): () => void;
  onCallChange(fn: Listener<{ state: CallState; info: CallInfo | null }>): () => void;
  onCallHistory(fn: Listener<CallRecord[]>): () => void;
  onVolume(fn: Listener<number>): () => void;
  hasActiveSession(): boolean;

  connect(cfg: SipConfig): Promise<void>;
  disconnect(): Promise<void>;
  call(target: string): Promise<void>;
  answer(): Promise<void>;
  reject(): Promise<void>;
  hangup(): Promise<void>;
  setMuted(muted: boolean): void;
  sendDtmf(tone: string): void;
  setInputDevice(deviceId: string): Promise<void>;
  setOutputDevice(deviceId: string): Promise<void>;
}

export function resolveTargetUri(target: string, localDomain: string | undefined): string | null {
  const trimmed = target.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("sip:") || trimmed.startsWith("sips:")) return trimmed;
  if (!localDomain) return null;
  return `sip:${trimmed}@${localDomain}`;
}
