import type { RecordedEvent } from "./events";

export interface RecordingSession {
  id: string;
  name: string;
  startTime: number;
  endTime?: number;
  status: RecordingStatus;
  events: RecordedEvent[];
  metadata: RecordingMetadata;
  settings: RecordingSettings;
}

export enum RecordingStatus {
  Idle = "idle",
  Recording = "recording",
  Paused = "paused",
  Stopped = "stopped",
}

export interface RecordingMetadata {
  browserName: string;
  browserVersion: string;
  userAgent: string;
  screenWidth: number;
  screenHeight: number;
  devicePixelRatio: number;
  startUrl: string;
  title: string;
}

export interface RecordingSettings {
  captureClicks: boolean;
  captureInput: boolean;
  captureScroll: boolean;
  captureNavigation: boolean;
  captureHover: boolean;
  captureDragDrop: boolean;
  captureKeyboard: boolean;
  captureTextSelection: boolean;
  captureDomSnapshots: boolean;
  captureScreenshots: boolean;
  screenshotOnClick: boolean;
  screenshotOnNavigation: boolean;
  screenshotInterval?: number;
  hoverThreshold: number;
  scrollDebounce: number;
  maskInputs: boolean;
  excludeSelectors: string[];
  apiEndpoint?: string;
  apiKey?: string;
  captureVoice: boolean;
  elevenLabsApiKey?: string;
}

export const DEFAULT_RECORDING_SETTINGS: RecordingSettings = {
  captureClicks: true,
  captureInput: true,
  captureScroll: true,
  captureNavigation: true,
  captureHover: true,
  captureDragDrop: true,
  captureKeyboard: true,
  captureTextSelection: true,
  captureDomSnapshots: true,
  captureScreenshots: true,
  screenshotOnClick: true,
  screenshotOnNavigation: true,
  screenshotInterval: undefined,
  hoverThreshold: 1000,
  scrollDebounce: 150,
  maskInputs: true,
  excludeSelectors: [],
  apiEndpoint: undefined,
  apiKey: undefined,
  captureVoice: false,
  elevenLabsApiKey: undefined,
};
