/**
 * Taps into a MediaStream via AudioContext + AnalyserNode to compute
 * RMS audio level for visualization. Calls back with a normalized 0-1 value.
 */
export class WaveformAnalyser {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private rafId: number | null = null;
  private onLevel: (level: number) => void;

  constructor(onLevel: (level: number) => void) {
    this.onLevel = onLevel;
  }

  start(stream: MediaStream): void {
    this.audioContext = new AudioContext();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.source = this.audioContext.createMediaStreamSource(stream);
    this.source.connect(this.analyser);
    this.tick();
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.source?.disconnect();
    this.analyser?.disconnect();
    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close();
    }
    this.audioContext = null;
    this.analyser = null;
    this.source = null;
  }

  private tick = (): void => {
    if (!this.analyser) return;

    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(data);

    // Compute RMS level from time-domain samples (centered at 128)
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const sample = (data[i] - 128) / 128;
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / data.length);
    const level = Math.min(1, rms * 3); // Scale up for visual responsiveness

    this.onLevel(level);
    this.rafId = requestAnimationFrame(this.tick);
  };
}
