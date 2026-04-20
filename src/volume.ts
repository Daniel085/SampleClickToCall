import type { Listener } from "./types";

export class VolumeMeter {
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private frame = 0;
  private listeners = new Set<Listener<number>>();

  onVolume(fn: Listener<number>): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  attach(stream: MediaStream): void {
    this.detach();
    if (!stream.getAudioTracks().length) return;
    this.ctx = new AudioContext();
    this.source = this.ctx.createMediaStreamSource(stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.source.connect(this.analyser);
    this.tick();
  }

  detach(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.source = null;
    this.analyser = null;
    this.emit(0);
  }

  private tick = (): void => {
    if (!this.analyser) return;
    const buf = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(buf);
    let sumSq = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / buf.length);
    this.emit(Math.min(1, rms * 2));
    this.frame = requestAnimationFrame(this.tick);
  };

  private emit(value: number): void {
    this.listeners.forEach((fn) => fn(value));
  }
}
