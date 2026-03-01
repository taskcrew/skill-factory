export interface VoiceModuleConfig {
  /** ElevenLabs API key (passed as token for v1) */
  apiKey: string;
  /** Called when a transcript segment is committed (finalized by VAD) */
  onTranscript: (segment: TranscriptSegment) => void;
  /** Called with partial (in-progress) transcript text for live UI display */
  onPartial?: (text: string) => void;
  /** Called with normalized audio level (0-1) for waveform visualization */
  onLevelChange?: (level: number) => void;
  /** Called when voice module status changes */
  onStatusChange?: (status: VoiceStatus) => void;
  /** Called on errors */
  onError?: (error: VoiceError) => void;
}

export interface TranscriptSegment {
  text: string;
  /** Absolute timestamp (Date.now()) — same clock as RecordedEvent.timestamp */
  timestamp: number;
}

export type VoiceStatus =
  | "idle"
  | "connecting"
  | "recording"
  | "stopping"
  | "error";

export type VoiceError =
  | { code: "mic_permission_denied" }
  | { code: "mic_not_found" }
  | { code: "transcription_failed"; message: string }
  | { code: "websocket_error"; message: string };

export interface VoiceRecorderResult {
  /** Recorded audio as a Blob (webm/opus from MediaRecorder) */
  audioBlob: Blob;
  /** All committed transcript segments from the session */
  segments: TranscriptSegment[];
}
