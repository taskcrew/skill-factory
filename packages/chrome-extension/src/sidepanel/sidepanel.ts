import type { RecordingSession } from "@shared/types";
import { MessageType } from "@shared/types/messages";
import { RecordingStatus } from "@shared/types/recording";

import { MOCK_ENDPOINT } from "../api/client";

const SETTINGS_STORAGE_KEY = "popup_settings";

interface PopupSettings {
  apiEndpoint: string;
  apiKey: string;
}

class PopupController {
  private recordBtn: HTMLButtonElement;
  private pauseBtn: HTMLButtonElement;
  private statusIndicator: HTMLElement;
  private eventCountEl: HTMLElement;
  private eventsList: HTMLElement;
  private uploadBtn: HTMLButtonElement;
  private apiEndpointInput: HTMLInputElement;
  private apiKeyInput: HTMLInputElement;

  private currentSession: RecordingSession | null = null;
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.recordBtn = document.getElementById("recordBtn") as HTMLButtonElement;
    this.pauseBtn = document.getElementById("pauseBtn") as HTMLButtonElement;
    this.statusIndicator = document.querySelector(
      ".status-indicator"
    ) as HTMLElement;
    this.eventCountEl = document.getElementById("eventCount") as HTMLElement;
    this.eventsList = document.getElementById("events") as HTMLElement;
    this.uploadBtn = document.getElementById("uploadBtn") as HTMLButtonElement;
    this.apiEndpointInput = document.getElementById(
      "apiEndpoint"
    ) as HTMLInputElement;
    this.apiKeyInput = document.getElementById("apiKey") as HTMLInputElement;

    // Set default endpoint initially, then load persisted settings
    this.apiEndpointInput.value = MOCK_ENDPOINT;
    this.loadPersistedSettings();

    this.setupEventListeners();
    this.loadCurrentState();
    this.startRefreshInterval();
  }

  private setupEventListeners(): void {
    this.recordBtn.addEventListener("click", () => this.toggleRecording());
    this.pauseBtn.addEventListener("click", () => this.togglePause());
    this.uploadBtn.addEventListener("click", () => this.uploadRecording());

    // Persist settings on change
    this.apiEndpointInput.addEventListener("input", () => this.saveSettings());
    this.apiKeyInput.addEventListener("input", () => this.saveSettings());

    document.querySelectorAll(".btn-export").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const format = (e.target as HTMLElement).dataset.format;
        if (format) {
          this.exportRecording(format);
        }
      });
    });
  }

  private startRefreshInterval(): void {
    // Refresh state every second to keep UI updated
    this.refreshInterval = setInterval(() => {
      this.loadCurrentState();
    }, 1000);
  }

  private async loadCurrentState(): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: MessageType.GetRecordingSession,
      });

      if (response?.success && response?.data) {
        this.currentSession = response.data;
        this.updateUI();
      }
    } catch {
      // Background might not be ready
    }
  }

  private async toggleRecording(): Promise<void> {
    try {
      if (
        !this.currentSession ||
        this.currentSession.status === RecordingStatus.Stopped ||
        this.currentSession.status === RecordingStatus.Idle
      ) {
        await chrome.runtime.sendMessage({ type: MessageType.StartRecording });
      } else {
        await chrome.runtime.sendMessage({ type: MessageType.StopRecording });
      }
      await this.loadCurrentState();
    } catch (error) {
      console.error("Failed to toggle recording:", error);
    }
  }

  private async togglePause(): Promise<void> {
    try {
      if (this.currentSession?.status === RecordingStatus.Recording) {
        await chrome.runtime.sendMessage({ type: MessageType.PauseRecording });
      } else if (this.currentSession?.status === RecordingStatus.Paused) {
        await chrome.runtime.sendMessage({ type: MessageType.ResumeRecording });
      }
      await this.loadCurrentState();
    } catch (error) {
      console.error("Failed to toggle pause:", error);
    }
  }

  private async exportRecording(format: string): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: MessageType.ExportRecording,
        format,
      });

      if (response?.success && response?.data) {
        this.downloadFile(response.data);
      } else {
        alert(`Export failed: ${response?.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to export:", error);
      alert("Export failed");
    }
  }

  private async uploadRecording(): Promise<void> {
    const endpoint = this.apiEndpointInput.value.trim();
    if (!endpoint) {
      alert("Please enter an API endpoint");
      return;
    }

    const apiKey = this.apiKeyInput.value.trim() || undefined;

    try {
      this.uploadBtn.disabled = true;
      this.uploadBtn.textContent = "Uploading...";

      const response = await chrome.runtime.sendMessage({
        type: MessageType.UploadRecording,
        endpoint,
        apiKey,
      });

      if (response?.success) {
        alert("Recording uploaded successfully!");
      } else {
        alert(`Upload failed: ${response?.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to upload:", error);
      alert("Upload failed");
    } finally {
      this.uploadBtn.disabled = false;
      this.uploadBtn.textContent = "Upload";
    }
  }

  private updateUI(): void {
    if (!this.currentSession) {
      this.setIdleState();
      return;
    }

    const status = this.currentSession.status;
    this.statusIndicator.dataset.status = status;

    switch (status) {
      case RecordingStatus.Recording:
        this.recordBtn.querySelector(".text")!.textContent = "Stop Recording";
        this.recordBtn.querySelector(".icon")!.textContent = "\u25A0"; // Stop icon
        this.recordBtn.dataset.recording = "true";
        this.pauseBtn.disabled = false;
        this.pauseBtn.querySelector(".icon")!.textContent = "\u2759\u2759"; // Pause icon
        this.statusIndicator.querySelector(".label")!.textContent = "Recording";
        break;
      case RecordingStatus.Paused:
        this.pauseBtn.querySelector(".icon")!.textContent = "\u25B6"; // Play icon
        this.statusIndicator.querySelector(".label")!.textContent = "Paused";
        break;
      case RecordingStatus.Stopped:
        this.setStoppedState();
        break;
      case RecordingStatus.Idle:
        this.setIdleState();
        break;
    }

    this.eventCountEl.textContent = String(this.currentSession.events.length);
    this.renderRecentEvents();
  }

  private setIdleState(): void {
    this.recordBtn.querySelector(".text")!.textContent = "Start Recording";
    this.recordBtn.querySelector(".icon")!.textContent = "\u25CF"; // Record icon
    this.recordBtn.dataset.recording = "false";
    this.pauseBtn.disabled = true;
    this.statusIndicator.querySelector(".label")!.textContent = "Ready";
    this.statusIndicator.dataset.status = "idle";
  }

  private setStoppedState(): void {
    this.recordBtn.querySelector(".text")!.textContent = "Start Recording";
    this.recordBtn.querySelector(".icon")!.textContent = "\u25CF"; // Record icon
    this.recordBtn.dataset.recording = "false";
    this.pauseBtn.disabled = true;
    this.statusIndicator.querySelector(".label")!.textContent = "Stopped";
    this.statusIndicator.dataset.status = "stopped";
  }

  private renderRecentEvents(): void {
    if (!this.currentSession) {
      this.eventsList.innerHTML = "";
      return;
    }

    const recentEvents = this.currentSession.events.slice(-10).reverse();
    this.eventsList.innerHTML = recentEvents
      .map(
        (event) => `
      <div class="event-item" data-type="${event.type}">
        <span class="event-type">${event.type}</span>
        <span class="event-time">${new Date(event.timestamp).toLocaleTimeString()}</span>
      </div>
    `
      )
      .join("");
  }

  private downloadFile(result: {
    content: string;
    filename: string;
    mimeType: string;
  }): void {
    const blob = new Blob([result.content], { type: result.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private async loadPersistedSettings(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
      const settings = result[SETTINGS_STORAGE_KEY] as
        | PopupSettings
        | undefined;
      if (settings) {
        if (settings.apiEndpoint) {
          this.apiEndpointInput.value = settings.apiEndpoint;
        }
        if (settings.apiKey) {
          this.apiKeyInput.value = settings.apiKey;
        }
      }
    } catch (error) {
      console.error("Failed to load settings from storage:", error);
    }
  }

  private async saveSettings(): Promise<void> {
    const settings: PopupSettings = {
      apiEndpoint: this.apiEndpointInput.value,
      apiKey: this.apiKeyInput.value,
    };
    try {
      await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings });
    } catch (error) {
      console.error("Failed to save settings to storage:", error);
    }
  }
}

// Initialize
new PopupController();
