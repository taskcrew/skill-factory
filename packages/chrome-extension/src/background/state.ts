import type {
  RecordedEvent,
  RecordingMetadata,
  RecordingSession,
  RecordingSettings,
  RecordingStatus,
} from "@shared/types";
import { DEFAULT_RECORDING_SETTINGS } from "@shared/types/recording";

const STORAGE_KEY = "recording_session";

export class RecordingStateManager {
  private currentSession: RecordingSession | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    await this.loadFromStorage();
    this.initialized = true;
  }

  async startRecording(
    settingsOverride?: Partial<RecordingSettings>
  ): Promise<RecordingSession> {
    const settings = { ...DEFAULT_RECORDING_SETTINGS, ...settingsOverride };
    const metadata = await this.gatherMetadata();

    this.currentSession = {
      id: crypto.randomUUID(),
      name: `Recording ${new Date().toLocaleString()}`,
      startTime: Date.now(),
      status: "recording" as RecordingStatus,
      events: [],
      metadata,
      settings,
    };

    await this.saveToStorage();
    return this.currentSession;
  }

  async stopRecording(): Promise<RecordingSession> {
    if (!this.currentSession) {
      throw new Error("No active recording");
    }

    this.currentSession.endTime = Date.now();
    this.currentSession.status = "stopped" as RecordingStatus;

    await this.saveToStorage();
    return this.currentSession;
  }

  async pauseRecording(): Promise<void> {
    if (this.currentSession) {
      this.currentSession.status = "paused" as RecordingStatus;
      await this.saveToStorage();
    }
  }

  async resumeRecording(): Promise<void> {
    if (this.currentSession) {
      this.currentSession.status = "recording" as RecordingStatus;
      await this.saveToStorage();
    }
  }

  async addEvent(event: RecordedEvent): Promise<void> {
    if (!this.currentSession || this.currentSession.status !== "recording") {
      return;
    }

    this.currentSession.events.push(event);

    // Periodic save (every 10 events)
    if (this.currentSession.events.length % 10 === 0) {
      await this.saveToStorage();
    }
  }

  getCurrentSession(): RecordingSession | null {
    return this.currentSession;
  }

  isRecording(): boolean {
    return this.currentSession?.status === "recording";
  }

  getSettings(): RecordingSettings {
    return this.currentSession?.settings || DEFAULT_RECORDING_SETTINGS;
  }

  async clearSession(): Promise<void> {
    this.currentSession = null;
    await chrome.storage.local.remove(STORAGE_KEY);
  }

  private async gatherMetadata(): Promise<RecordingMetadata> {
    let startUrl = "";
    let title = "";

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      startUrl = tab?.url || "";
      title = tab?.title || "";
    } catch {
      // Ignore errors
    }

    return {
      browserName: "Chrome",
      browserVersion: navigator.userAgent.match(/Chrome\/([0-9.]+)/)?.[1] || "",
      userAgent: navigator.userAgent,
      screenWidth: 0,
      screenHeight: 0,
      devicePixelRatio: 1,
      startUrl,
      title,
    };
  }

  private async saveToStorage(): Promise<void> {
    if (this.currentSession) {
      try {
        await chrome.storage.local.set({
          [STORAGE_KEY]: this.currentSession,
        });
      } catch (error) {
        console.error("Failed to save session to storage:", error);
      }
    }
  }

  private async loadFromStorage(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      if (result[STORAGE_KEY]) {
        this.currentSession = result[STORAGE_KEY] as RecordingSession;
        // If was recording when extension was reloaded, pause it
        if (this.currentSession?.status === "recording") {
          this.currentSession.status = "paused" as RecordingStatus;
        }
      }
    } catch (error) {
      console.error("Failed to load session from storage:", error);
    }
  }
}
