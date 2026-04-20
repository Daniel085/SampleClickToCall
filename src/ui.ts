import type { CallInfo, CallRecord, CallState, RegistrationStatus, SipClientLike } from "./types";
import { loadConfig, saveConfig, type IceServerConfig, type SipConfig } from "./config";
import { Ringtone } from "./audio";
import { enumerateAudioDevices, requestMicPermission } from "./devices";
import { toast } from "./toast";

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element: #${id}`);
  return node as T;
}

export function bindUi(client: SipClientLike, opts: { mockMode: boolean }): void {
  const form = el<HTMLFormElement>("config-form");
  const wsInput = el<HTMLInputElement>("cfg-ws");
  const uriInput = el<HTMLInputElement>("cfg-uri");
  const userInput = el<HTMLInputElement>("cfg-user");
  const passInput = el<HTMLInputElement>("cfg-pass");
  const nameInput = el<HTMLInputElement>("cfg-name");
  const stunInput = el<HTMLInputElement>("cfg-stun");
  const turnInput = el<HTMLInputElement>("cfg-turn");
  const turnUserInput = el<HTMLInputElement>("cfg-turn-user");
  const turnPassInput = el<HTMLInputElement>("cfg-turn-pass");
  const btnRegister = el<HTMLButtonElement>("btn-register");
  const btnUnregister = el<HTMLButtonElement>("btn-unregister");

  const devInput = el<HTMLSelectElement>("dev-input");
  const devOutput = el<HTMLSelectElement>("dev-output");
  const btnGrantMic = el<HTMLButtonElement>("btn-grant-mic");

  const dialInput = el<HTMLInputElement>("dial-input");
  const btnCall = el<HTMLButtonElement>("btn-call");

  const callPanel = el<HTMLElement>("call-panel");
  const callState = el<HTMLElement>("call-state");
  const callPeer = el<HTMLElement>("call-peer");
  const callTimer = el<HTMLElement>("call-timer");
  const btnAnswer = el<HTMLButtonElement>("btn-answer");
  const btnReject = el<HTMLButtonElement>("btn-reject");
  const btnHangup = el<HTMLButtonElement>("btn-hangup");
  const btnMute = el<HTMLButtonElement>("btn-mute");
  const statusEl = el<HTMLElement>("status");
  const volumeFill = el<HTMLElement>("volume-fill");
  const historyList = el<HTMLUListElement>("history-list");
  const mockBanner = el<HTMLElement>("mock-banner");

  if (opts.mockMode) mockBanner.classList.remove("hidden");

  const ringtone = new Ringtone();
  let timerHandle: number | null = null;
  let muted = false;

  const existing = loadConfig();
  if (existing) {
    wsInput.value = existing.wsUri;
    uriInput.value = existing.sipUri;
    userInput.value = existing.authUser;
    passInput.value = existing.password;
    nameInput.value = existing.displayName ?? "";
    const stun = existing.iceServers?.find((s) => s.urls.startsWith("stun:"));
    const turn = existing.iceServers?.find((s) => s.urls.startsWith("turn:") || s.urls.startsWith("turns:"));
    if (stun) stunInput.value = stun.urls;
    if (turn) {
      turnInput.value = turn.urls;
      if (turn.username) turnUserInput.value = turn.username;
      if (turn.credential) turnPassInput.value = turn.credential;
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const cfg: SipConfig = {
      wsUri: wsInput.value.trim(),
      sipUri: uriInput.value.trim(),
      authUser: userInput.value.trim(),
      password: passInput.value,
      displayName: nameInput.value.trim() || undefined,
      iceServers: buildIceServers(stunInput.value, turnInput.value, turnUserInput.value, turnPassInput.value),
      inputDeviceId: devInput.value || undefined,
      outputDeviceId: devOutput.value || undefined,
    };
    saveConfig(cfg);
    btnRegister.disabled = true;
    try {
      await client.connect(cfg);
    } catch (err) {
      toast(`Registration failed: ${(err as Error).message}`, "error");
      btnRegister.disabled = false;
    }
  });

  btnUnregister.addEventListener("click", async () => {
    btnUnregister.disabled = true;
    try {
      await client.disconnect();
    } catch (err) {
      toast(`Unregister failed: ${(err as Error).message}`, "error");
    }
  });

  btnCall.addEventListener("click", () => attemptCall());

  dialInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      attemptCall();
    }
  });

  document.addEventListener("keydown", (e) => {
    const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    if (inField) return;
    if (e.key === "Escape" && client.hasActiveSession()) {
      e.preventDefault();
      client.hangup().catch((err) => toast((err as Error).message, "error"));
    }
  });

  document.querySelectorAll<HTMLButtonElement>("[data-dtmf]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const digit = btn.dataset.dtmf!;
      if (client.hasActiveSession()) {
        client.sendDtmf(digit);
      } else {
        dialInput.value += digit;
      }
    });
  });

  btnAnswer.addEventListener("click", () => client.answer().catch((err) => toast((err as Error).message, "error")));
  btnReject.addEventListener("click", () => client.reject().catch((err) => toast((err as Error).message, "error")));
  btnHangup.addEventListener("click", () => client.hangup().catch((err) => toast((err as Error).message, "error")));
  btnMute.addEventListener("click", () => {
    muted = !muted;
    client.setMuted(muted);
    btnMute.textContent = muted ? "Unmute" : "Mute";
  });

  btnGrantMic.addEventListener("click", async () => {
    try {
      await requestMicPermission();
      await refreshDevices();
      toast("Microphone access granted");
    } catch (err) {
      toast(`Mic access denied: ${(err as Error).message}`, "error");
    }
  });

  devInput.addEventListener("change", async () => {
    if (!devInput.value) return;
    try {
      await client.setInputDevice(devInput.value);
    } catch (err) {
      toast(`Mic switch failed: ${(err as Error).message}`, "error");
    }
  });

  devOutput.addEventListener("change", async () => {
    if (!devOutput.value) return;
    try {
      await client.setOutputDevice(devOutput.value);
    } catch (err) {
      toast(`Speaker switch failed: ${(err as Error).message}`, "error");
    }
  });

  navigator.mediaDevices?.addEventListener?.("devicechange", () => {
    refreshDevices().catch(() => undefined);
  });

  refreshDevices().catch(() => undefined);

  client.onRegistrationChange((status: RegistrationStatus) => {
    statusEl.className = `status status-${status}`;
    statusEl.textContent =
      status === "registered" ? (opts.mockMode ? "Mock registered" : "Registered") :
      status === "registering" ? "Registering…" :
      status === "failed" ? "Failed" : "Offline";

    const registered = status === "registered";
    btnRegister.disabled = registered || status === "registering";
    btnUnregister.disabled = !registered;
    btnCall.disabled = !registered;
    if (registered) refreshDevices().catch(() => undefined);
  });

  client.onCallChange(({ state, info }: { state: CallState; info: CallInfo | null }) => {
    const hide = (node: HTMLElement) => node.classList.add("hidden");
    const show = (node: HTMLElement) => node.classList.remove("hidden");

    [btnAnswer, btnReject, btnHangup, btnMute].forEach(hide);

    if (state === "idle") {
      hide(callPanel);
      stopTimer();
      ringtone.stop();
      muted = false;
      btnMute.textContent = "Mute";
      volumeFill.style.width = "0%";
      return;
    }

    show(callPanel);
    callPeer.textContent = info?.peer ?? "";

    switch (state) {
      case "ringing-outbound":
        callState.textContent = "Calling…";
        callTimer.textContent = "00:00";
        show(btnHangup);
        break;
      case "ringing-inbound":
        callState.textContent = "Incoming call";
        callTimer.textContent = "00:00";
        show(btnAnswer);
        show(btnReject);
        ringtone.start();
        break;
      case "in-call":
        callState.textContent = "In call";
        show(btnHangup);
        show(btnMute);
        ringtone.stop();
        startTimer(info?.startedAt ?? Date.now());
        break;
      case "ended":
        callState.textContent = "Call ended";
        stopTimer();
        ringtone.stop();
        break;
    }
  });

  client.onCallHistory((records: CallRecord[]) => renderHistory(historyList, records));

  client.onVolume((v: number) => {
    volumeFill.style.width = `${Math.round(v * 100)}%`;
  });

  function attemptCall(): void {
    const target = dialInput.value.trim();
    if (!target) {
      toast("Enter a number or SIP URI", "error");
      return;
    }
    client.call(target).catch((err) => toast(`Call failed: ${(err as Error).message}`, "error"));
  }

  async function refreshDevices(): Promise<void> {
    const { inputs, outputs } = await enumerateAudioDevices();
    fillSelect(devInput, inputs, existing?.inputDeviceId);
    fillSelect(devOutput, outputs, existing?.outputDeviceId);
  }

  function startTimer(startedAt: number): void {
    stopTimer();
    const tick = () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const m = String(Math.floor(elapsed / 60)).padStart(2, "0");
      const s = String(elapsed % 60).padStart(2, "0");
      callTimer.textContent = `${m}:${s}`;
    };
    tick();
    timerHandle = window.setInterval(tick, 1000);
  }

  function stopTimer(): void {
    if (timerHandle !== null) {
      clearInterval(timerHandle);
      timerHandle = null;
    }
  }
}

function fillSelect(sel: HTMLSelectElement, items: { deviceId: string; label: string }[], selected: string | undefined): void {
  const prev = selected ?? sel.value;
  sel.innerHTML = "";
  if (!items.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "(grant mic access to list devices)";
    sel.appendChild(opt);
    return;
  }
  for (const item of items) {
    const opt = document.createElement("option");
    opt.value = item.deviceId;
    opt.textContent = item.label;
    sel.appendChild(opt);
  }
  if (prev && items.some((i) => i.deviceId === prev)) sel.value = prev;
}

function buildIceServers(stun: string, turn: string, user: string, pass: string): IceServerConfig[] | undefined {
  const servers: IceServerConfig[] = [];
  if (stun.trim()) servers.push({ urls: stun.trim() });
  if (turn.trim()) {
    const s: IceServerConfig = { urls: turn.trim() };
    if (user.trim()) s.username = user.trim();
    if (pass) s.credential = pass;
    servers.push(s);
  }
  return servers.length ? servers : undefined;
}

function renderHistory(list: HTMLUListElement, records: CallRecord[]): void {
  list.innerHTML = "";
  if (!records.length) {
    const li = document.createElement("li");
    li.className = "history-meta";
    li.textContent = "No calls yet.";
    list.appendChild(li);
    return;
  }
  for (const r of records) {
    const li = document.createElement("li");
    const peer = document.createElement("span");
    peer.className = `history-peer history-${r.direction === "inbound" ? "in" : "out"}${
      r.connected ? "" : " history-missed"
    }`;
    peer.textContent = r.peer;
    const meta = document.createElement("span");
    meta.className = "history-meta";
    meta.textContent = r.connected
      ? `${formatDuration(r.durationSec)} · ${formatDate(r.endedAt)}`
      : `missed · ${formatDate(r.endedAt)}`;
    li.appendChild(peer);
    li.appendChild(meta);
    list.appendChild(li);
  }
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
