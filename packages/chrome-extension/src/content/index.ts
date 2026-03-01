import type { RecordingSettings } from "@shared/types";
import { MessageType } from "@shared/types/messages";

import { EventOrchestrator } from "./events";
import { computeFramePath } from "./frame-path";

class ContentScriptController {
  private eventOrchestrator: EventOrchestrator;
  private isRecording = false;
  private settings: RecordingSettings | null = null;
  private framePath: number[];

  constructor() {
    this.framePath = computeFramePath();
    const frameLabel =
      this.framePath.length > 0
        ? `iframe [${this.framePath.join(",")}]`
        : "main frame";
    console.log(
      `[skill-factory] Content script initializing in ${frameLabel}:`,
      window.location.href
    );
    this.eventOrchestrator = new EventOrchestrator();
    this.setupMessageListener();
    this.requestInitialState();
  }

  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === MessageType.RecordingStateChanged) {
        this.handleStateChange(message.isRecording, message.settings);
        sendResponse({ success: true });
      }
      return true;
    });
  }

  private async requestInitialState(): Promise<void> {
    console.log("[skill-factory] Content script requesting initial state...");
    try {
      const response = await chrome.runtime.sendMessage({
        type: MessageType.GetRecordingSession,
      });

      console.log("[skill-factory] Got initial state response:", response);

      if (response?.success && response?.data) {
        const session = response.data;
        const isRecording = session.status === "recording";
        console.log(
          "[skill-factory] Session status:",
          session.status,
          "isRecording:",
          isRecording
        );
        this.handleStateChange(isRecording, session.settings);
      } else {
        console.log("[skill-factory] No active recording session");
      }
    } catch (error) {
      console.log("[skill-factory] Failed to get initial state:", error);
    }
  }

  private handleStateChange(
    isRecording: boolean,
    settings: RecordingSettings
  ): void {
    if (isRecording === this.isRecording) {
      return;
    }

    this.isRecording = isRecording;
    this.settings = settings;

    if (isRecording) {
      this.eventOrchestrator.start(settings, this.framePath);
      console.log("[skill-factory] Recording started");
    } else {
      this.eventOrchestrator.stop();
      console.log("[skill-factory] Recording stopped");
    }
  }
}

// Guard against double-injection (e.g. when background injects via scripting API
// into a tab that already has the manifest-declared content script)
if (!(window as any).__skillFactoryCS) {
  (window as any).__skillFactoryCS = true;
  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => new ContentScriptController()
    );
  } else {
    new ContentScriptController();
  }
}
