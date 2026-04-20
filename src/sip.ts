import {
  Inviter,
  Invitation,
  Registerer,
  RegistererState,
  Session,
  SessionState,
  UserAgent,
  UserAgentOptions,
} from "sip.js";
import { DEFAULT_ICE_SERVERS, type SipConfig } from "./config";
import {
  resolveTargetUri,
  type CallInfo,
  type CallRecord,
  type CallState,
  type Listener,
  type RegistrationStatus,
  type SipClientLike,
} from "./types";
import { VolumeMeter } from "./volume";

const HISTORY_KEY = "sip-call-history";
const HISTORY_LIMIT = 50;

export class SipClient implements SipClientLike {
  private ua: UserAgent | null = null;
  private registerer: Registerer | null = null;
  private session: Session | null = null;
  private remoteAudio: HTMLAudioElement;
  private currentConfig: SipConfig | null = null;
  private volumeMeter = new VolumeMeter();

  private regStatus: RegistrationStatus = "offline";
  private callState: CallState = "idle";
  private callInfo: CallInfo | null = null;
  private history: CallRecord[] = loadHistory();

  private regListeners = new Set<Listener<RegistrationStatus>>();
  private callListeners = new Set<Listener<{ state: CallState; info: CallInfo | null }>>();
  private historyListeners = new Set<Listener<CallRecord[]>>();

  constructor(remoteAudio: HTMLAudioElement) {
    this.remoteAudio = remoteAudio;
  }

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
    return this.volumeMeter.onVolume(fn);
  }

  hasActiveSession(): boolean {
    return this.session !== null;
  }

  private setRegStatus(s: RegistrationStatus): void {
    this.regStatus = s;
    this.regListeners.forEach((fn) => fn(s));
  }

  private setCallState(state: CallState, info: CallInfo | null): void {
    this.callState = state;
    this.callInfo = info;
    this.callListeners.forEach((fn) => fn({ state, info }));
  }

  private pushHistory(record: CallRecord): void {
    this.history = [record, ...this.history].slice(0, HISTORY_LIMIT);
    saveHistory(this.history);
    this.historyListeners.forEach((fn) => fn(this.history));
  }

  async connect(cfg: SipConfig): Promise<void> {
    if (this.ua) await this.disconnect();
    this.currentConfig = cfg;

    const uri = UserAgent.makeURI(cfg.sipUri);
    if (!uri) throw new Error(`Invalid SIP URI: ${cfg.sipUri}`);

    const options: UserAgentOptions = {
      uri,
      authorizationUsername: cfg.authUser,
      authorizationPassword: cfg.password,
      displayName: cfg.displayName,
      transportOptions: { server: cfg.wsUri },
      sessionDescriptionHandlerFactoryOptions: {
        iceGatheringTimeout: 2000,
        peerConnectionConfiguration: {
          iceServers: cfg.iceServers?.length ? cfg.iceServers : DEFAULT_ICE_SERVERS,
        },
      },
      delegate: {
        onInvite: (invitation) => this.handleInboundInvite(invitation),
      },
    };

    this.ua = new UserAgent(options);
    this.setRegStatus("registering");

    try {
      await this.ua.start();
      this.registerer = new Registerer(this.ua);
      this.registerer.stateChange.addListener((state) => {
        if (state === RegistererState.Registered) this.setRegStatus("registered");
        else if (state === RegistererState.Unregistered) this.setRegStatus("offline");
        else if (state === RegistererState.Terminated) this.setRegStatus("offline");
      });
      await this.registerer.register();
    } catch (err) {
      this.setRegStatus("failed");
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.session) await this.hangup();
      if (this.registerer) await this.registerer.unregister();
      if (this.ua) await this.ua.stop();
    } finally {
      this.registerer = null;
      this.ua = null;
      this.setRegStatus("offline");
    }
  }

  async call(target: string): Promise<void> {
    if (!this.ua) throw new Error("Not registered");
    if (this.session) throw new Error("Call already in progress");

    const localDomain = this.ua.configuration.uri?.host;
    const resolved = resolveTargetUri(target, localDomain);
    if (!resolved) throw new Error(`Invalid dial target: ${target}`);
    const targetUri = UserAgent.makeURI(resolved);
    if (!targetUri) throw new Error(`Invalid dial target: ${target}`);

    const inviter = new Inviter(this.ua, targetUri, {
      sessionDescriptionHandlerOptions: {
        constraints: this.buildConstraints(),
      },
    });

    this.attachSession(inviter, { peer: target, direction: "outbound" });
    this.setCallState("ringing-outbound", this.callInfo);
    await inviter.invite();
  }

  async answer(): Promise<void> {
    const invitation = this.session as Invitation | null;
    if (!invitation || !("accept" in invitation)) throw new Error("No inbound call to answer");
    await invitation.accept({
      sessionDescriptionHandlerOptions: {
        constraints: this.buildConstraints(),
      },
    });
  }

  async reject(): Promise<void> {
    const invitation = this.session as Invitation | null;
    if (!invitation || !("reject" in invitation)) throw new Error("No inbound call to reject");
    await invitation.reject();
  }

  async hangup(): Promise<void> {
    if (!this.session) return;
    const s = this.session;
    switch (s.state) {
      case SessionState.Initial:
      case SessionState.Establishing:
        if ("cancel" in s && typeof (s as Inviter).cancel === "function") {
          await (s as Inviter).cancel();
        } else if ("reject" in s) {
          await (s as Invitation).reject();
        }
        break;
      case SessionState.Established:
        await s.bye();
        break;
      default:
        break;
    }
  }

  setMuted(muted: boolean): void {
    const pc = this.getPeerConnection();
    if (!pc) return;
    pc.getSenders().forEach((sender) => {
      if (sender.track && sender.track.kind === "audio") {
        sender.track.enabled = !muted;
      }
    });
  }

  sendDtmf(tone: string): void {
    const pc = this.getPeerConnection();
    if (!pc) return;
    const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
    sender?.dtmf?.insertDTMF(tone, 200, 50);
  }

  async setInputDevice(deviceId: string): Promise<void> {
    if (this.currentConfig) this.currentConfig.inputDeviceId = deviceId;
    const pc = this.getPeerConnection();
    if (!pc) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: deviceId } },
      video: false,
    });
    const newTrack = stream.getAudioTracks()[0];
    const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
    if (sender && newTrack) await sender.replaceTrack(newTrack);
  }

  async setOutputDevice(deviceId: string): Promise<void> {
    if (this.currentConfig) this.currentConfig.outputDeviceId = deviceId;
    const audio = this.remoteAudio as HTMLAudioElement & {
      setSinkId?: (id: string) => Promise<void>;
    };
    if (audio.setSinkId) await audio.setSinkId(deviceId);
  }

  private buildConstraints(): MediaStreamConstraints {
    const deviceId = this.currentConfig?.inputDeviceId;
    return {
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      video: false,
    };
  }

  private handleInboundInvite(invitation: Invitation): void {
    if (this.session) {
      invitation.reject().catch(() => undefined);
      return;
    }
    const peer = invitation.remoteIdentity.uri.toString();
    this.attachSession(invitation, { peer, direction: "inbound" });
    this.setCallState("ringing-inbound", this.callInfo);
  }

  private attachSession(session: Session, info: CallInfo): void {
    this.session = session;
    this.callInfo = info;
    const createdAt = Date.now();
    let connected = false;
    let startedAt = createdAt;

    session.stateChange.addListener((state) => {
      switch (state) {
        case SessionState.Established:
          connected = true;
          startedAt = Date.now();
          this.setupRemoteMedia();
          this.setCallState("in-call", { ...info, startedAt });
          break;
        case SessionState.Terminated: {
          this.teardownRemoteMedia();
          const endedAt = Date.now();
          this.pushHistory({
            peer: info.peer,
            direction: info.direction,
            startedAt: connected ? startedAt : createdAt,
            endedAt,
            durationSec: connected ? Math.round((endedAt - startedAt) / 1000) : 0,
            connected,
          });
          this.session = null;
          this.setCallState("ended", null);
          setTimeout(() => {
            if (this.callState === "ended") this.setCallState("idle", null);
          }, 1500);
          break;
        }
        default:
          break;
      }
    });
  }

  private setupRemoteMedia(): void {
    const pc = this.getPeerConnection();
    if (!pc) return;
    const remoteStream = new MediaStream();
    pc.getReceivers().forEach((receiver) => {
      if (receiver.track) remoteStream.addTrack(receiver.track);
    });
    this.remoteAudio.srcObject = remoteStream;
    this.remoteAudio.play().catch(() => undefined);
    this.volumeMeter.attach(remoteStream);

    const outputId = this.currentConfig?.outputDeviceId;
    if (outputId) this.setOutputDevice(outputId).catch(() => undefined);
  }

  private teardownRemoteMedia(): void {
    this.remoteAudio.srcObject = null;
    this.volumeMeter.detach();
  }

  private getPeerConnection(): RTCPeerConnection | null {
    const sdh = this.session?.sessionDescriptionHandler as
      | { peerConnection?: RTCPeerConnection }
      | undefined;
    return sdh?.peerConnection ?? null;
  }
}

function loadHistory(): CallRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as CallRecord[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(history: CallRecord[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // ignore quota
  }
}
