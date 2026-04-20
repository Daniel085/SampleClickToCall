export class Ringtone {
  private ctx: AudioContext | null = null;
  private timer: number | null = null;

  start(): void {
    if (this.timer !== null) return;
    this.ctx = new AudioContext();
    const play = () => this.playBurst();
    play();
    this.timer = window.setInterval(play, 4000);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.ctx) {
      this.ctx.close().catch(() => undefined);
      this.ctx = null;
    }
  }

  private playBurst(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.tone(440, now, 1.0);
    this.tone(480, now, 1.0);
    this.tone(440, now + 2.0, 1.0);
    this.tone(480, now + 2.0, 1.0);
  }

  private tone(freq: number, startAt: number, duration: number): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.value = freq;
    osc.type = "sine";
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(0.15, startAt + 0.02);
    gain.gain.linearRampToValueAtTime(0, startAt + duration);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + duration + 0.05);
  }
}
