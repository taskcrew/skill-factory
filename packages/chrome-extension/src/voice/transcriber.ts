import type { TranscriptSegment, VoiceError } from "./types";

export interface TranscriberCallbacks {
  onPartial?: (text: string) => void;
  onCommitted: (segment: TranscriptSegment) => void;
  onError?: (error: VoiceError) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

/**
 * Connects to ElevenLabs Scribe v2 Realtime via raw WebSocket.
 *
 * Auth flow (per ElevenLabs docs):
 * 1. POST /v1/single-use-token/realtime_scribe with xi-api-key header → get single-use token
 * 2. Connect WSS with token query parameter
 *
 * This avoids exposing the raw API key in the WebSocket URL.
 */
export class Transcriber {
  private ws: WebSocket | null = null;
  private callbacks: TranscriberCallbacks;

  constructor(callbacks: TranscriberCallbacks) {
    this.callbacks = callbacks;
  }

  async connect(apiKey: string): Promise<void> {
    // Step 1: Exchange API key for single-use token
    let token: string;
    try {
      const res = await fetch(
        "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe",
        {
          method: "POST",
          headers: { "xi-api-key": apiKey },
        }
      );
      if (!res.ok) {
        const text = await res.text();
        this.callbacks.onError?.({
          code: "websocket_error",
          message: `Failed to get token (${res.status}): ${text}`,
        });
        return;
      }
      const data = await res.json();
      token = data.token;
    } catch (err) {
      this.callbacks.onError?.({
        code: "websocket_error",
        message: `Token fetch failed: ${err}`,
      });
      return;
    }

    // Step 2: Connect WebSocket with single-use token
    const params = new URLSearchParams({
      model_id: "scribe_v2_realtime",
      token,
      audio_format: "pcm_16000",
      commit_strategy: "vad",
      vad_silence_threshold_secs: "0.8",
      vad_threshold: "0.5",
    });

    const url = `wss://api.elevenlabs.io/v1/speech-to-text/realtime?${params}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.callbacks.onConnected?.();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.message_type) {
          case "partial_transcript":
            if (msg.text) {
              this.callbacks.onPartial?.(msg.text);
            }
            break;
          case "committed_transcript": {
            const text = msg.text?.trim();
            if (text) {
              this.callbacks.onCommitted({ text, timestamp: Date.now() });
            }
            break;
          }
          case "auth_error":
            this.callbacks.onError?.({
              code: "websocket_error",
              message: `Auth failed: ${msg.error || "invalid token"}`,
            });
            break;
          case "error":
          case "quota_exceeded":
          case "rate_limited":
          case "transcriber_error":
            this.callbacks.onError?.({
              code: "transcription_failed",
              message: msg.error || msg.message_type,
            });
            break;
          case "session_started":
            break;
        }
      } catch {
        // Ignore parse errors
      }
    };

    this.ws.onerror = () => {
      this.callbacks.onError?.({
        code: "websocket_error",
        message: "WebSocket connection error",
      });
    };

    this.ws.onclose = () => {
      this.callbacks.onDisconnected?.();
    };
  }

  sendAudio(base64Pcm: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(
        JSON.stringify({
          message_type: "input_audio_chunk",
          audio_base_64: base64Pcm,
          sample_rate: 16000,
        })
      );
    } catch {
      // Connection may have closed
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close(1000, "User stopped recording");
      this.ws = null;
    }
  }
}
