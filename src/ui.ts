import type { SipClient, RegistrationStatus, CallState, CallInfo } from "./sip";
import { loadConfig, saveConfig, type SipConfig } from "./config";
import { Ringtone } from "./audio";

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element: #${id}`);
  return node as T;
}

export function bindUi(client: SipClient): void {
  const form = el<HTMLFormElement>("config-form");
  const wsInput = el<HTMLInputElement>("cfg-ws");
  const uriInput = el<HTMLInputElement>("cfg-uri");
  const userInput = el<HTMLInputElement>("cfg-user");
  const passInput = el<HTMLInputElement>("cfg-pass");
  const nameInput = el<HTMLInputElement>("cfg-name");
  const btnRegister = el<HTMLButtonElement>("btn-register");
  const btnUnregister = el<HTMLButtonElement>("btn-unregister");

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
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const cfg: SipConfig = {
      wsUri: wsInput.value.trim(),
      sipUri: uriInput.value.trim(),
      authUser: userInput.value.trim(),
      password: passInput.value,
      displayName: nameInput.value.trim() || undefined,
    };
    saveConfig(cfg);
    btnRegister.disabled = true;
    try {
      await client.connect(cfg);
    } catch (err) {
      console.error(err);
      alert(`Registration failed: ${(err as Error).message}`);
      btnRegister.disabled = false;
    }
  });

  btnUnregister.addEventListener("click", async () => {
    btnUnregister.disabled = true;
    try {
      await client.disconnect();
    } catch (err) {
      console.error(err);
    }
  });

  btnCall.addEventListener("click", async () => {
    const target = dialInput.value.trim();
    if (!target) return;
    try {
      await client.call(target);
    } catch (err) {
      console.error(err);
      alert(`Call failed: ${(err as Error).message}`);
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

  btnAnswer.addEventListener("click", () => client.answer().catch(console.error));
  btnReject.addEventListener("click", () => client.reject().catch(console.error));
  btnHangup.addEventListener("click", () => client.hangup().catch(console.error));
  btnMute.addEventListener("click", () => {
    muted = !muted;
    client.setMuted(muted);
    btnMute.textContent = muted ? "Unmute" : "Mute";
  });

  client.onRegistrationChange((status: RegistrationStatus) => {
    statusEl.className = `status status-${status}`;
    statusEl.textContent =
      status === "registered" ? "Registered" :
      status === "registering" ? "Registering…" :
      status === "failed" ? "Failed" : "Offline";

    const registered = status === "registered";
    btnRegister.disabled = registered || status === "registering";
    btnUnregister.disabled = !registered;
    btnCall.disabled = !registered;
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
