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
import type { SipConfig } from "./config";

export type RegistrationStatus = "offline" | "registering" | "registered" | "failed";

export type CallState = "idle" | "ringing-outbound" | "ringing-inbound" | "in-call" | "ended";

export interface CallInfo {
  peer: string;
  direction: "inbound" | "outbound";
  startedAt?: number;
}

type Listener<T> = (value: T) => void;

export class SipClient {
  private ua: UserAgent | null = null;
  private registerer: Registerer | null = null;
  private session: Session | null = null;
  private remoteAudio: HTMLAudioElement;

  private regStatus: RegistrationStatus = "offline";
  private callState: CallState = "idle";
  private callInfo: CallInfo | null = null;

  private regListeners = new Set<Listener<RegistrationStatus>>();
  private callListeners = new Set<Listener<{ state: CallState; info: CallInfo | null }>>();

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

  async connect(cfg: SipConfig): Promise<void> {
    if (this.ua) await this.disconnect();

    const uri = UserAgent.makeURI(cfg.sipUri);
    if (!uri) throw new Error(`Invalid SIP URI: ${cfg.sipUri}`);

    const options: UserAgentOptions = {
      uri,
      authorizationUsername: cfg.authUser,
      authorizationPassword: cfg.password,
      displayName: cfg.displayName,
      transportOptions: { server: cfg.wsUri },
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

    const targetUri = this.resolveTargetUri(target);
    if (!targetUri) throw new Error(`Invalid dial target: ${target}`);

    const inviter = new Inviter(this.ua, targetUri, {
      sessionDescriptionHandlerOptions: {
        constraints: { audio: true, video: false },
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
        constraints: { audio: true, video: false },
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

    session.stateChange.addListener((state) => {
      switch (state) {
        case SessionState.Established:
          this.setupRemoteMedia();
          this.setCallState("in-call", { ...info, startedAt: Date.now() });
          break;
        case SessionState.Terminated:
          this.teardownRemoteMedia();
          this.session = null;
          this.setCallState("ended", null);
          setTimeout(() => {
            if (this.callState === "ended") this.setCallState("idle", null);
          }, 1500);
          break;
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
  }

  private teardownRemoteMedia(): void {
    this.remoteAudio.srcObject = null;
  }

  private getPeerConnection(): RTCPeerConnection | null {
    const sdh = this.session?.sessionDescriptionHandler as
      | { peerConnection?: RTCPeerConnection }
      | undefined;
    return sdh?.peerConnection ?? null;
  }

  private resolveTargetUri(target: string): ReturnType<typeof UserAgent.makeURI> | undefined {
    const trimmed = target.trim();
    if (!trimmed) return undefined;
    if (trimmed.startsWith("sip:") || trimmed.startsWith("sips:")) {
      return UserAgent.makeURI(trimmed);
    }
    const localDomain = this.ua?.configuration.uri?.host;
    if (!localDomain) return undefined;
    return UserAgent.makeURI(`sip:${trimmed}@${localDomain}`);
  }
}
