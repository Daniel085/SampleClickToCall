export interface SipConfig {
  wsUri: string;
  sipUri: string;
  authUser: string;
  password: string;
  displayName?: string;
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
