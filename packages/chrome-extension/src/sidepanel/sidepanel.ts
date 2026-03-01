import type { RecordingSession } from "@shared/types";
import type {
  RecordedEvent,
  ElementInfo,
  ClickEvent,
  InputEvent,
  ScrollEvent,
  NavigationEvent,
  HoverEvent,
  KeyboardEvent as KbEvent,
  TextSelectionEvent,
  TabCreatedEvent,
  ViewportResizeEvent,
  VoiceTranscriptEvent,
} from "@shared/types/events";
import { RecordedEventType } from "@shared/types/events";
import { MessageType } from "@shared/types/messages";
import { RecordingStatus } from "@shared/types/recording";

import { DEFAULT_BACKEND_URL } from "../api/client";
import { VoiceRecorder } from "@voice/recorder";
import type {
  TranscriptSegment,
  VoiceStatus,
  VoiceError,
} from "@voice/types";

const SETTINGS_STORAGE_KEY = "popup_settings";

interface PopupSettings {
  apiEndpoint: string;
  apiKey: string;
  elevenLabsApiKey: string;
}

// SVG for the waveform icon used in voice timeline items
const WAVE_SVG =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 10v3"/><path d="M6 6v11"/><path d="M10 3v18"/><path d="M14 8v7"/><path d="M18 5v13"/><path d="M22 10v3"/></svg>';

class PopupController {
  // Original controls (hidden but still wired for logic)
  private recordBtn: HTMLButtonElement;
  private pauseBtn: HTMLButtonElement;
  private statusIndicator: HTMLElement;
  private eventCountEl: HTMLElement;
  private eventsList: HTMLElement;
  private uploadBtn: HTMLButtonElement;
  private apiEndpointInput: HTMLInputElement;
  private apiKeyInput: HTMLInputElement;
  private elevenLabsKeyInput: HTMLInputElement;

  // Voice elements
  private voiceBtn: HTMLButtonElement;
  private voiceLevelBar: HTMLElement;
  private voiceStatusEl: HTMLElement;
  private transcriptPanel: HTMLElement;
  private transcriptContent: HTMLElement;
  private transcriptPartial: HTMLElement;

  // Bottom bar elements
  private barRecordBtn: HTMLButtonElement;
  private barPauseBtn: HTMLButtonElement;
  private barVoiceBtn: HTMLButtonElement;
  private barDeleteBtn: HTMLButtonElement;
  private barDoneBtn: HTMLButtonElement;

  // Transcript toggle
  private transcriptToggle: HTMLButtonElement;

  // Voice state
  private voiceRecorder = new VoiceRecorder();
  private isVoiceActive = false;

  private currentSession: RecordingSession | null = null;
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Original controls
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
    this.elevenLabsKeyInput = document.getElementById(
      "elevenLabsKey"
    ) as HTMLInputElement;

    // Voice elements
    this.voiceBtn = document.getElementById("voiceBtn") as HTMLButtonElement;
    this.voiceLevelBar = document.querySelector(
      ".voice-level-bar"
    ) as HTMLElement;
    this.voiceStatusEl = document.getElementById(
      "voiceStatus"
    ) as HTMLElement;
    this.transcriptPanel = document.getElementById(
      "transcript"
    ) as HTMLElement;
    this.transcriptContent = document.getElementById(
      "transcriptContent"
    ) as HTMLElement;
    this.transcriptPartial = document.getElementById(
      "transcriptPartial"
    ) as HTMLElement;

    // Bottom bar
    this.barRecordBtn = document.getElementById("barRecordBtn") as HTMLButtonElement;
    this.barPauseBtn = document.getElementById("barPauseBtn") as HTMLButtonElement;
    this.barVoiceBtn = document.getElementById("barVoiceBtn") as HTMLButtonElement;
    this.barDeleteBtn = document.getElementById("barDeleteBtn") as HTMLButtonElement;
    this.barDoneBtn = document.getElementById("barDoneBtn") as HTMLButtonElement;

    // Transcript toggle
    this.transcriptToggle = document.getElementById("transcriptToggle") as HTMLButtonElement;

    this.apiEndpointInput.value = DEFAULT_BACKEND_URL;
    this.loadPersistedSettings();

    this.setupEventListeners();
    this.loadCurrentState();
    this.startRefreshInterval();
  }

  private setupEventListeners(): void {
    // Original hidden controls still work
    this.recordBtn.addEventListener("click", () => this.toggleRecording());
    this.pauseBtn.addEventListener("click", () => this.togglePause());
    this.uploadBtn.addEventListener("click", () => this.uploadRecording());
    this.voiceBtn.addEventListener("click", () => this.toggleVoice());

    // Bottom bar buttons
    this.barRecordBtn.addEventListener("click", () => this.toggleRecording());
    this.barPauseBtn.addEventListener("click", () => this.togglePause());
    this.barVoiceBtn.addEventListener("click", () => this.toggleVoice());
    this.barDeleteBtn.addEventListener("click", () => this.clearRecording());
    this.barDoneBtn.addEventListener("click", () => this.submitSkill());

    // Transcript toggle
    this.transcriptToggle.addEventListener("click", () => {
      this.transcriptPanel.classList.toggle("collapsed");
    });

    // Persist settings
    this.apiEndpointInput.addEventListener("input", () => this.saveSettings());
    this.apiKeyInput.addEventListener("input", () => this.saveSettings());
    this.elevenLabsKeyInput.addEventListener("input", () =>
      this.saveSettings()
    );

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
        await this.loadCurrentState();
        await this.autoStartVoice();
      } else {
        if (this.isVoiceActive) {
          await this.stopVoice();
        }
        await chrome.runtime.sendMessage({ type: MessageType.StopRecording });
        await this.loadCurrentState();
      }
    } catch (error) {
      console.error("Failed to toggle recording:", error);
    }
  }

  private async autoStartVoice(): Promise<void> {
    const apiKey =
      this.elevenLabsKeyInput.value.trim() ||
      (import.meta.env.VITE_ELEVENLABS_API_KEY as string) ||
      "";
    if (!apiKey) {
      return;
    }
    await this.startVoice();
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

  private async clearRecording(): Promise<void> {
    if (this.isVoiceActive) {
      await this.stopVoice();
    }
    try {
      await chrome.runtime.sendMessage({ type: MessageType.ClearRecording });
      this.currentSession = null;
      this.eventsList.textContent = "";
      this.transcriptPanel.hidden = true;
      this.transcriptContent.textContent = "";
      this.transcriptContent.appendChild(this.transcriptPartial);
      this.updateUI();
    } catch {
      // Ignore
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

  private async submitSkill(): Promise<void> {
    if (!this.currentSession || this.currentSession.events.length === 0) {
      alert("No recording to submit");
      return;
    }

    // Stop recording first if still active
    if (this.currentSession.status === "recording") {
      if (this.isVoiceActive) await this.stopVoice();
      await chrome.runtime.sendMessage({ type: MessageType.StopRecording });
      await this.loadCurrentState();
    }

    const backendUrl = this.apiEndpointInput.value.trim() || DEFAULT_BACKEND_URL;

    try {
      this.barDoneBtn.disabled = true;
      this.barDoneBtn.textContent = "Submitting...";

      // Get agent-browser export from background
      const exportResponse = await chrome.runtime.sendMessage({
        type: MessageType.ExportRecording,
        format: "agent-browser",
      });

      if (!exportResponse?.success || !exportResponse?.data) {
        throw new Error(exportResponse?.error || "Export failed");
      }

      const { content } = exportResponse.data;

      // Prompt user for a skill name
      const rawName = prompt("Name your skill:", "my-skill");
      if (!rawName) {
        return; // User cancelled
      }

      // Sanitize to agentskills.io spec: lowercase, hyphens only, no leading/trailing/consecutive hyphens
      const skillName = rawName
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 64);

      if (!skillName) {
        alert("Invalid skill name");
        return;
      }

      const startUrl = this.currentSession.metadata.startUrl || "unknown page";
      const eventCount = this.currentSession.events.length;

      const res = await fetch(`${backendUrl}/api/skills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: skillName,
          filename: "script.sh",
          content,
          description: `Recorded ${eventCount} browser actions from ${startUrl}. Replay with agent-browser CLI.`,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`${res.status} ${errText}`);
      }

      alert("Skill saved!");
    } catch (error) {
      console.error("Failed to submit skill:", error);
      alert(`Failed to save skill: ${error}`);
    } finally {
      this.barDoneBtn.disabled = false;
      this.barDoneBtn.textContent = "Done";
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

  // --- Voice ---

  private async toggleVoice(): Promise<void> {
    if (this.isVoiceActive) {
      await this.stopVoice();
    } else {
      await this.startVoice();
    }
  }

  private async startVoice(): Promise<void> {
    const apiKey =
      this.elevenLabsKeyInput.value.trim() ||
      (import.meta.env.VITE_ELEVENLABS_API_KEY as string) ||
      "";
    if (!apiKey) {
      this.showVoiceError("Enter an ElevenLabs API key in settings below");
      return;
    }

    this.isVoiceActive = true;
    this.voiceBtn.dataset.active = "true";
    this.voiceBtn.querySelector(".text")!.textContent = "Voice On";
    this.barVoiceBtn.dataset.active = "true";
    this.transcriptPanel.hidden = false;

    await this.voiceRecorder.start({
      apiKey,
      onTranscript: (segment) => this.handleTranscript(segment),
      onPartial: (text) => this.handlePartialTranscript(text),
      onLevelChange: (level) => this.handleLevelChange(level),
      onStatusChange: (status) => this.handleVoiceStatus(status),
      onError: (error) => this.handleVoiceError(error),
    });
  }

  private async stopVoice(): Promise<void> {
    this.isVoiceActive = false;
    this.voiceBtn.dataset.active = "false";
    this.voiceBtn.querySelector(".text")!.textContent = "Voice Off";
    this.barVoiceBtn.dataset.active = "false";
    this.voiceLevelBar.style.height = "0%";

    const result = await this.voiceRecorder.stop();
    console.log(
      `Voice stopped: ${result.segments.length} segments, audio ${result.audioBlob.size} bytes`
    );
  }

  private handleTranscript(segment: TranscriptSegment): void {
    const el = document.createElement("div");
    el.className = "transcript-segment";

    const timeSpan = document.createElement("span");
    timeSpan.className = "time";
    timeSpan.textContent = new Date(segment.timestamp).toLocaleTimeString();

    const textNode = document.createTextNode(segment.text);

    el.appendChild(timeSpan);
    el.appendChild(textNode);
    this.transcriptContent.insertBefore(el, this.transcriptPartial);
    this.transcriptPartial.textContent = "";
    this.transcriptPanel.scrollTop = this.transcriptPanel.scrollHeight;

    this.sendVoiceEvent(segment);
  }

  private handlePartialTranscript(text: string): void {
    this.transcriptPartial.textContent = text;
    this.transcriptPanel.scrollTop = this.transcriptPanel.scrollHeight;
  }

  private handleLevelChange(level: number): void {
    this.voiceLevelBar.style.height = `${level * 100}%`;
  }

  private handleVoiceStatus(status: VoiceStatus): void {
    this.voiceStatusEl.hidden = status === "idle";
    this.voiceStatusEl.dataset.status = status;
    const textEl = this.voiceStatusEl.querySelector(".voice-status-text")!;

    switch (status) {
      case "connecting":
        textEl.textContent = "Connecting...";
        break;
      case "recording":
        textEl.textContent = "Listening";
        break;
      case "stopping":
        textEl.textContent = "Stopping...";
        break;
      case "error":
        break;
      default:
        textEl.textContent = "";
    }
  }

  private handleVoiceError(error: VoiceError): void {
    console.error("Voice error:", JSON.stringify(error));
    this.isVoiceActive = false;
    this.voiceBtn.dataset.active = "false";
    this.voiceBtn.querySelector(".text")!.textContent = "Voice Off";
    this.barVoiceBtn.dataset.active = "false";
    this.voiceLevelBar.style.height = "0%";

    if (error.code === "mic_permission_denied") {
      this.showVoiceError("Grant mic permission in the tab that opened, then try again");
      chrome.tabs.create({
        url: chrome.runtime.getURL("src/permissions/request-mic.html"),
      });
      return;
    }

    let message: string;
    switch (error.code) {
      case "mic_not_found":
        message = "No microphone found";
        break;
      case "transcription_failed":
        message = `Transcription failed: ${error.message}`;
        break;
      case "websocket_error":
        message = `Connection error: ${error.message}`;
        break;
    }
    this.showVoiceError(message);
  }

  private showVoiceError(message: string): void {
    this.voiceStatusEl.hidden = false;
    this.voiceStatusEl.dataset.status = "error";
    this.voiceStatusEl.querySelector(".voice-status-text")!.textContent =
      message;
  }

  private async sendVoiceEvent(segment: TranscriptSegment): Promise<void> {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      await chrome.runtime.sendMessage({
        type: MessageType.RecordEvent,
        event: {
          id: crypto.randomUUID(),
          type: RecordedEventType.VoiceTranscript,
          timestamp: segment.timestamp,
          url: tab?.url || "",
          tabId: tab?.id || 0,
          text: segment.text,
        },
      });
    } catch (error) {
      console.error("Failed to send voice event:", error);
    }
  }

  // --- UI ---

  private updateUI(): void {
    if (!this.currentSession) {
      this.setIdleState();
      this.eventCountEl.textContent = "0";
      return;
    }

    const status = this.currentSession.status;
    this.statusIndicator.dataset.status = status;

    switch (status) {
      case RecordingStatus.Recording:
        this.recordBtn.querySelector(".text")!.textContent = "Stop Recording";
        this.recordBtn.querySelector(".icon")!.textContent = "\u25A0";
        this.recordBtn.dataset.recording = "true";
        this.pauseBtn.disabled = false;
        this.statusIndicator.querySelector(".label")!.textContent = "Recording";
        this.voiceBtn.disabled = false;
        // Bottom bar
        this.barRecordBtn.dataset.recording = "true";
        this.barRecordBtn.title = "Stop recording";
        this.barPauseBtn.disabled = false;
        this.barVoiceBtn.disabled = false;
        break;
      case RecordingStatus.Paused:
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
    this.recordBtn.querySelector(".icon")!.textContent = "\u25CF";
    this.recordBtn.dataset.recording = "false";
    this.pauseBtn.disabled = true;
    this.statusIndicator.querySelector(".label")!.textContent = "Ready";
    this.statusIndicator.dataset.status = "idle";
    this.voiceBtn.disabled = true;
    // Bottom bar
    this.barRecordBtn.dataset.recording = "false";
    this.barRecordBtn.title = "Start recording";
    this.barPauseBtn.disabled = true;
    this.barVoiceBtn.disabled = true;
  }

  private setStoppedState(): void {
    this.recordBtn.querySelector(".text")!.textContent = "Start Recording";
    this.recordBtn.querySelector(".icon")!.textContent = "\u25CF";
    this.recordBtn.dataset.recording = "false";
    this.pauseBtn.disabled = true;
    this.statusIndicator.querySelector(".label")!.textContent = "Stopped";
    this.statusIndicator.dataset.status = "stopped";
    this.voiceBtn.disabled = true;
    // Bottom bar
    this.barRecordBtn.dataset.recording = "false";
    this.barRecordBtn.title = "Start recording";
    this.barPauseBtn.disabled = true;
    this.barVoiceBtn.disabled = true;
  }

  private renderRecentEvents(): void {
    if (!this.currentSession) {
      this.eventsList.textContent = "";
      return;
    }

    // Show last 20 events in chronological order (oldest first, newest at bottom)
    const events = this.currentSession.events.slice(-20);
    this.eventsList.textContent = "";

    // Build step numbers: only action events get numbers
    const stepMap = new Map<string, number>();
    let counter = 0;
    for (const ev of this.currentSession.events) {
      if (
        ev.type !== RecordedEventType.VoiceTranscript &&
        ev.type !== RecordedEventType.Screenshot &&
        ev.type !== RecordedEventType.DomSnapshot
      ) {
        counter++;
        stepMap.set(ev.id, counter);
      }
    }

    for (const event of events) {
      // Skip screenshots/snapshots from timeline display
      if (
        event.type === RecordedEventType.Screenshot ||
        event.type === RecordedEventType.DomSnapshot
      ) {
        continue;
      }

      if (event.type === RecordedEventType.VoiceTranscript) {
        this.renderVoiceItem(event as VoiceTranscriptEvent);
      } else {
        this.renderActionItem(event, stepMap.get(event.id) || 0);
      }
    }

    // Auto-scroll to bottom
    this.eventsList.scrollTop = this.eventsList.scrollHeight;
  }

  private renderVoiceItem(event: VoiceTranscriptEvent): void {
    const item = document.createElement("div");
    item.className = "event-item voice-item";

    const iconWrap = document.createElement("span");
    iconWrap.className = "voice-icon";
    iconWrap.appendChild(this.createWaveSvg());
    item.appendChild(iconWrap);

    const textEl = document.createElement("span");
    textEl.className = "voice-text";
    textEl.textContent = `\u201C${event.text}\u201D`;
    item.appendChild(textEl);

    this.eventsList.appendChild(item);
  }

  private renderActionItem(event: RecordedEvent, stepNum: number): void {
    const item = document.createElement("div");
    item.className = "event-item";
    item.dataset.type = event.type;

    const numEl = document.createElement("div");
    numEl.className = "step-number";
    numEl.textContent = String(stepNum);
    item.appendChild(numEl);

    const body = document.createElement("div");
    body.className = "step-body";

    const desc = document.createElement("div");
    desc.className = "step-desc";
    desc.textContent = this.describeEvent(event);
    body.appendChild(desc);

    const meta = document.createElement("div");
    meta.className = "step-meta";

    const badge = document.createElement("span");
    badge.className = "event-badge";
    badge.dataset.type = event.type;
    badge.textContent = event.type;
    meta.appendChild(badge);

    const time = document.createElement("span");
    time.className = "step-time";
    time.textContent = new Date(event.timestamp).toLocaleTimeString();
    meta.appendChild(time);

    body.appendChild(meta);
    item.appendChild(body);

    this.eventsList.appendChild(item);
  }

  private describeElement(el: ElementInfo): string {
    if (el.ariaLabel) return el.ariaLabel.slice(0, 30);
    if (el.selectors.testId) return el.selectors.testId;
    if (el.textContent) {
      const clean = el.textContent.replace(/\s+/g, " ").trim();
      return clean.length > 25 ? clean.slice(0, 25) + "\u2026" : clean;
    }
    return el.tagName;
  }

  private describeEvent(event: RecordedEvent): string {
    try {
      switch (event.type) {
        case RecordedEventType.Click:
        case RecordedEventType.DoubleClick:
        case RecordedEventType.RightClick: {
          const e = event as ClickEvent;
          const label = this.describeElement(e.element);
          const verb = e.type === RecordedEventType.DoubleClick ? "Double-click" : e.type === RecordedEventType.RightClick ? "Right-click" : "Click";
          return `${verb} on "${label}"`;
        }
        case RecordedEventType.Input:
        case RecordedEventType.Change: {
          const e = event as InputEvent;
          const label = this.describeElement(e.element);
          if (e.isPassword) return `Input password in ${label}`;
          return `Input in ${label}`;
        }
        case RecordedEventType.Submit:
          return "Submit form";
        case RecordedEventType.Navigate: {
          const e = event as NavigationEvent;
          try {
            const u = new URL(e.toUrl);
            return `Navigate to ${u.hostname}`;
          } catch {
            return `Navigate to ${e.toUrl.slice(0, 40)}`;
          }
        }
        case RecordedEventType.Scroll: {
          const e = event as ScrollEvent;
          const dy = e.deltaY ?? e.scrollY ?? 0;
          return `Scroll ${dy >= 0 ? "down" : "up"} ${Math.abs(Math.round(dy))}px`;
        }
        case RecordedEventType.Hover: {
          const e = event as HoverEvent;
          const label = this.describeElement(e.element);
          return `Hover on "${label}"`;
        }
        case RecordedEventType.KeyDown:
        case RecordedEventType.KeyUp: {
          const e = event as KbEvent;
          return e.type === RecordedEventType.KeyDown ? `Key: ${e.key}` : `Key up: ${e.key}`;
        }
        case RecordedEventType.DragStart:
          return "Drag start";
        case RecordedEventType.DragEnd:
          return "Drag end";
        case RecordedEventType.Drop:
          return "Drop";
        case RecordedEventType.TextSelection: {
          const e = event as TextSelectionEvent;
          return `Select: "${e.selectedText.slice(0, 25)}"`;
        }
        case RecordedEventType.TabCreated: {
          const e = event as TabCreatedEvent;
          return e.pendingUrl ? `New tab: ${e.pendingUrl.slice(0, 35)}` : "New tab";
        }
        case RecordedEventType.TabActivated:
          return "Switched tab";
        case RecordedEventType.TabClosed:
          return "Tab closed";
        case RecordedEventType.ViewportResize: {
          const e = event as ViewportResizeEvent;
          return `Resize: ${e.width}\u00D7${e.height}`;
        }
        default:
          return event.type;
      }
    } catch {
      return event.type;
    }
  }

  private createWaveSvg(): SVGSVGElement {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    for (const d of ["M2 10v3", "M6 6v11", "M10 3v18", "M14 8v7", "M18 5v13", "M22 10v3"]) {
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    }
    return svg;
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
        if (settings.elevenLabsApiKey) {
          this.elevenLabsKeyInput.value = settings.elevenLabsApiKey;
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
      elevenLabsApiKey: this.elevenLabsKeyInput.value,
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
