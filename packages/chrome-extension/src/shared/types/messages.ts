import type { RecordedEvent } from "./events";
import type {
  RecordingSession,
  RecordingSettings,
  RecordingStatus,
} from "./recording";

// Message types for communication between components
export enum MessageType {
  // Control messages (popup -> background)
  StartRecording = "START_RECORDING",
  StopRecording = "STOP_RECORDING",
  ClearRecording = "CLEAR_RECORDING",
  PauseRecording = "PAUSE_RECORDING",
  ResumeRecording = "RESUME_RECORDING",

  // Status messages (background -> popup)
  RecordingStatus = "RECORDING_STATUS",

  // Event messages (content -> background)
  RecordEvent = "RECORD_EVENT",
  RequestScreenshot = "REQUEST_SCREENSHOT",

  // Sync messages (background -> content)
  RecordingStateChanged = "RECORDING_STATE_CHANGED",
  UpdateSettings = "UPDATE_SETTINGS",

  // Export messages
  ExportRecording = "EXPORT_RECORDING",
  UploadRecording = "UPLOAD_RECORDING",

  // Data retrieval
  GetRecordingSession = "GET_RECORDING_SESSION",
  GetRecordingEvents = "GET_RECORDING_EVENTS",
}

// Base message interface
export interface BaseMessage {
  type: MessageType;
  tabId?: number;
}

// Control messages
export interface StartRecordingMessage extends BaseMessage {
  type: MessageType.StartRecording;
  settings?: Partial<RecordingSettings>;
}

export interface StopRecordingMessage extends BaseMessage {
  type: MessageType.StopRecording;
}

export interface PauseRecordingMessage extends BaseMessage {
  type: MessageType.PauseRecording;
}

export interface ResumeRecordingMessage extends BaseMessage {
  type: MessageType.ResumeRecording;
}

// Status messages
export interface RecordingStatusMessage extends BaseMessage {
  type: MessageType.RecordingStatus;
  status: RecordingStatus;
  session?: RecordingSession;
  eventCount: number;
}

// Event messages
export interface RecordEventMessage extends BaseMessage {
  type: MessageType.RecordEvent;
  event: RecordedEvent;
}

export interface RequestScreenshotMessage extends BaseMessage {
  type: MessageType.RequestScreenshot;
  trigger: "click" | "navigation" | "manual" | "interval";
}

// State sync messages
export interface RecordingStateChangedMessage extends BaseMessage {
  type: MessageType.RecordingStateChanged;
  isRecording: boolean;
  settings: RecordingSettings;
}

export interface UpdateSettingsMessage extends BaseMessage {
  type: MessageType.UpdateSettings;
  settings: Partial<RecordingSettings>;
}

// Export messages
export interface ExportRecordingMessage extends BaseMessage {
  type: MessageType.ExportRecording;
  format: "agent-browser";
}

export interface UploadRecordingMessage extends BaseMessage {
  type: MessageType.UploadRecording;
  endpoint: string;
  apiKey?: string;
  format?: "raw" | "agent-browser";
}

// Data retrieval
export interface GetRecordingSessionMessage extends BaseMessage {
  type: MessageType.GetRecordingSession;
}

export interface GetRecordingEventsMessage extends BaseMessage {
  type: MessageType.GetRecordingEvents;
  limit?: number;
  offset?: number;
}

// Union type for all messages
export type ExtensionMessage =
  | StartRecordingMessage
  | StopRecordingMessage
  | PauseRecordingMessage
  | ResumeRecordingMessage
  | RecordingStatusMessage
  | RecordEventMessage
  | RequestScreenshotMessage
  | RecordingStateChangedMessage
  | UpdateSettingsMessage
  | ExportRecordingMessage
  | UploadRecordingMessage
  | GetRecordingSessionMessage
  | GetRecordingEventsMessage;

// Response types
export interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
