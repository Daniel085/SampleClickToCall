export interface IceServerConfig {
  urls: string;
  username?: string;
  credential?: string;
}

export interface SipConfig {
  wsUri: string;
  sipUri: string;
  authUser: string;
  password: string;
  displayName?: string;
  iceServers?: IceServerConfig[];
  inputDeviceId?: string;
  outputDeviceId?: string;
}

const STORAGE_KEY = "sip-config";

export function loadConfig(): SipConfig | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SipConfig;
  } catch {
    return null;
  }
}

export function saveConfig(cfg: SipConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function clearConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export const DEFAULT_ICE_SERVERS: IceServerConfig[] = [
  { urls: "stun:stun.l.google.com:19302" },
];
