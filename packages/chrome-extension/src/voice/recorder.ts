import type {
  VoiceModuleConfig,
  VoiceStatus,
  VoiceError,
  TranscriptSegment,
  VoiceRecorderResult,
} from "./types";
import { Transcriber } from "./transcriber";
import { WaveformAnalyser } from "./waveform";

/**
 * Orchestrates microphone capture, audio recording, real-time transcription,
 * and waveform visualization. Self-contained — no storage or export concerns.
 *
 * Audio flow:
 *   getUserMedia → MediaStream
 *     ├── MediaRecorder (webm/opus blob for later use)
 *     ├── AudioContext(16kHz) + ScriptProcessor → PCM base64 → Transcriber
 *     └── WaveformAnalyser → onLevelChange callback
 */
export class VoiceRecorder {
  private status: VoiceStatus = "idle";
  private config: VoiceModuleConfig | null = null;
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private audioContext: AudioContext | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private transcriber: Transcriber | null = null;
  private waveform: WaveformAnalyser | null = null;
  private segments: TranscriptSegment[] = [];

  async start(config: VoiceModuleConfig): Promise<void> {
    if (this.status !== "idle" && this.status !== "error") {
      throw new Error(`Cannot start from status: ${this.status}`);
    }

    this.config = config;
    this.segments = [];
    this.audioChunks = [];
    this.setStatus("connecting");

    // 1. Acquire microphone
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
    } catch (err) {
      const domErr = err as DOMException;
      if (domErr.name === "NotAllowedError") {
        this.handleError({ code: "mic_permission_denied" });
      } else {
        this.handleError({ code: "mic_not_found" });
      }
      return;
    }

    try {
      // 2. MediaRecorder for local audio blob
      this.mediaRecorder = new MediaRecorder(this.mediaStream, {
        mimeType: "audio/webm;codecs=opus",
      });
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.audioChunks.push(e.data);
      };
      this.mediaRecorder.start(1000);

      // 3. AudioContext at 16kHz for PCM extraction → Transcriber
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);

      this.scriptProcessor = this.audioContext.createScriptProcessor(
        4096,
        1,
        1
      );
      this.scriptProcessor.onaudioprocess = (e) => {
        const float32 = e.inputBuffer.getChannelData(0);
        const base64 = float32ToPcm16Base64(float32);
        this.transcriber?.sendAudio(base64);
      };
      source.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.audioContext.destination);

      // 4. Waveform analyser (uses its own AudioContext internally)
      if (config.onLevelChange) {
        this.waveform = new WaveformAnalyser(config.onLevelChange);
        this.waveform.start(this.mediaStream);
      }

      // 5. Connect transcriber
      this.transcriber = new Transcriber({
        onPartial: (text) => config.onPartial?.(text),
        onCommitted: (segment) => {
          this.segments.push(segment);
          config.onTranscript(segment);
        },
        onError: (error) => config.onError?.(error),
        onConnected: () => this.setStatus("recording"),
        onDisconnected: () => {
          if (this.status === "recording") {
            this.handleError({
              code: "websocket_error",
              message: "Transcription connection lost",
            });
          }
        },
      });
      await this.transcriber.connect(config.apiKey);
    } catch (err) {
      this.cleanup();
      this.handleError({
        code: "transcription_failed",
        message: String(err),
      });
    }
  }

  async stop(): Promise<VoiceRecorderResult> {
    if (this.status !== "recording" && this.status !== "error") {
      return { audioBlob: new Blob(), segments: this.segments };
    }

    this.setStatus("stopping");

    // Disconnect transcriber first (flushes pending audio)
    this.transcriber?.disconnect();

    // Stop MediaRecorder and collect final audio
    const audioBlob = await new Promise<Blob>((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") {
        resolve(new Blob(this.audioChunks, { type: "audio/webm;codecs=opus" }));
        return;
      }
      this.mediaRecorder.onstop = () => {
        resolve(new Blob(this.audioChunks, { type: "audio/webm;codecs=opus" }));
      };
      this.mediaRecorder.stop();
    });

    this.cleanup();
    this.setStatus("idle");

    return { audioBlob, segments: [...this.segments] };
  }

  getStatus(): VoiceStatus {
    return this.status;
  }

  private setStatus(status: VoiceStatus): void {
    this.status = status;
    this.config?.onStatusChange?.(status);
  }

  private handleError(error: VoiceError): void {
    this.setStatus("error");
    this.config?.onError?.(error);
    this.cleanup();
  }

  private cleanup(): void {
    this.waveform?.stop();
    this.waveform = null;

    this.scriptProcessor?.disconnect();
    this.scriptProcessor = null;

    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close();
    }
    this.audioContext = null;

    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.mediaStream = null;

    this.transcriber?.disconnect();
    this.transcriber = null;
  }
}

/** Convert Float32Array PCM samples to 16-bit PCM base64 string */
function float32ToPcm16Base64(float32: Float32Array): string {
  const buffer = new ArrayBuffer(float32.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
