import {
  type RecordedEvent,
  RecordedEventType,
  type RecordingSettings,
  type TabActivatedEvent,
  type TabClosedEvent,
  type TabCreatedEvent,
} from "@shared/types";
import {
  type ExtensionMessage,
  type MessageResponse,
  MessageType,
} from "@shared/types/messages";

import { TabCoordinator } from "./coordinator";
import { ScreenshotCapture } from "./screenshot";
import { RecordingStateManager } from "./state";

class BackgroundController {
  private stateManager: RecordingStateManager;
  private screenshotCapture: ScreenshotCapture;
  private tabCoordinator: TabCoordinator;

  constructor() {
    this.stateManager = new RecordingStateManager();
    this.screenshotCapture = new ScreenshotCapture();
    this.tabCoordinator = new TabCoordinator(this.stateManager);

    this.initialize();
  }

  private async initialize(): Promise<void> {
    console.log("Background service worker starting...");
    try {
      await this.stateManager.initialize();
      console.log("State manager initialized");

      this.setupMessageHandler();
      this.setupTabListeners();
      console.log("Background service worker ready");
    } catch (error) {
      console.error("Initialization failed", error);
    }
  }

  private setupMessageHandler(): void {
    chrome.runtime.onMessage.addListener(
      (message: ExtensionMessage, sender, sendResponse) => {
        this.handleMessage(message, sender)
          .then(sendResponse)
          .catch((error) =>
            sendResponse({ success: false, error: error.message })
          );
        return true; // Keep channel open for async response
      }
    );
  }

  private async handleMessage(
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender
  ): Promise<MessageResponse> {
    switch (message.type) {
      case MessageType.StartRecording:
        return this.handleStartRecording(message.settings);

      case MessageType.StopRecording:
        return this.handleStopRecording();

      case MessageType.PauseRecording:
        return this.handlePauseRecording();

      case MessageType.ResumeRecording:
        return this.handleResumeRecording();

      case MessageType.RecordEvent:
        return this.handleRecordEvent(message.event, sender);

      case MessageType.RequestScreenshot:
        return this.handleScreenshotRequest(message.trigger, sender);

      case MessageType.GetRecordingSession:
        return this.handleGetSession();

      case MessageType.ExportRecording:
        return this.handleExport(message.format);

      case MessageType.UploadRecording:
        return this.handleUpload(message.endpoint, message.apiKey);

      default:
        return { success: false, error: "Unknown message type" };
    }
  }

  private async handleStartRecording(
    settingsOverride?: Partial<RecordingSettings>
  ): Promise<MessageResponse> {
    const session = await this.stateManager.startRecording(settingsOverride);
    await this.tabCoordinator.notifyAllTabs(true, session.settings);
    return { success: true, data: session };
  }

  private async handleStopRecording(): Promise<MessageResponse> {
    const session = await this.stateManager.stopRecording();
    await this.tabCoordinator.notifyAllTabs(false, session.settings);
    return { success: true, data: session };
  }

  private async handlePauseRecording(): Promise<MessageResponse> {
    await this.stateManager.pauseRecording();
    return { success: true };
  }

  private async handleResumeRecording(): Promise<MessageResponse> {
    await this.stateManager.resumeRecording();
    return { success: true };
  }

  private async handleRecordEvent(
    event: RecordedEvent,
    sender: chrome.runtime.MessageSender
  ): Promise<MessageResponse> {
    if (sender.tab?.id) {
      event.tabId = sender.tab.id;
    }
    if (sender.frameId !== undefined) {
      event.frameId = sender.frameId;
    }
    console.debug("Background received event", {
      type: event.type,
      tabId: sender.tab?.id,
      frameId: sender.frameId,
    });
    await this.stateManager.addEvent(event);
    return { success: true };
  }

  private async handleScreenshotRequest(
    trigger: "click" | "navigation" | "manual" | "interval",
    sender: chrome.runtime.MessageSender
  ): Promise<MessageResponse> {
    const session = this.stateManager.getCurrentSession();
    if (!session || !session.settings.captureScreenshots) {
      return { success: false, error: "Screenshots not enabled" };
    }

    const tabId = sender.tab?.id;
    if (!tabId) {
      return { success: false, error: "No tab ID" };
    }

    const screenshot = await this.screenshotCapture.capture(tabId, trigger);
    if (screenshot) {
      await this.stateManager.addEvent(screenshot);
    }
    return { success: true };
  }

  private async handleGetSession(): Promise<MessageResponse> {
    const session = this.stateManager.getCurrentSession();
    return { success: true, data: session };
  }

  private async handleExport(format: string): Promise<MessageResponse> {
    try {
      const { exportRecording } = await import("../export");
      const session = this.stateManager.getCurrentSession();
      if (!session) {
        return { success: false, error: "No recording session" };
      }
      const exported = await exportRecording(
        session,
        format as "mcp"
      );
      return { success: true, data: exported };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private async handleUpload(
    endpoint: string,
    apiKey?: string
  ): Promise<MessageResponse> {
    try {
      const { uploadRecording } = await import("../api/client");
      const session = this.stateManager.getCurrentSession();
      if (!session) {
        return { success: false, error: "No recording session" };
      }
      await uploadRecording(endpoint, session, apiKey);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private setupTabListeners(): void {
    // Track last active tab for activation events
    let lastActiveTabId: number | undefined;

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, _tab) => {
      if (changeInfo.status === "complete") {
        this.tabCoordinator.onTabUpdated(tabId);
      }
    });

    chrome.tabs.onRemoved.addListener((tabId) => {
      this.tabCoordinator.onTabRemoved(tabId);

      // Record tab closed event if recording
      const session = this.stateManager.getCurrentSession();
      if (session?.status === "recording") {
        const event: TabClosedEvent = {
          id: crypto.randomUUID(),
          type: RecordedEventType.TabClosed,
          timestamp: Date.now(),
          url: "",
          tabId: tabId,
          closedTabId: tabId,
        };
        void this.stateManager.addEvent(event);
        console.debug("Tab closed event recorded", { tabId });
      }
    });

    // Record new tab creation
    chrome.tabs.onCreated.addListener((tab) => {
      const session = this.stateManager.getCurrentSession();
      if (session?.status === "recording" && tab.id) {
        const event: TabCreatedEvent = {
          id: crypto.randomUUID(),
          type: RecordedEventType.TabCreated,
          timestamp: Date.now(),
          url: tab.pendingUrl || tab.url || "",
          tabId: tab.id,
          newTabId: tab.id,
          openerTabId: tab.openerTabId,
          pendingUrl: tab.pendingUrl,
        };
        void this.stateManager.addEvent(event);
        console.debug("Tab created event recorded", {
          tabId: tab.id,
          openerTabId: tab.openerTabId,
        });
      }
    });

    // Record tab activation (switching between tabs)
    chrome.tabs.onActivated.addListener((activeInfo) => {
      const previousTabId = lastActiveTabId;
      lastActiveTabId = activeInfo.tabId;

      const session = this.stateManager.getCurrentSession();
      if (session?.status === "recording") {
        chrome.tabs.get(activeInfo.tabId, (tab) => {
          if (chrome.runtime.lastError || !tab) {
            return;
          }

          const event: TabActivatedEvent = {
            id: crypto.randomUUID(),
            type: RecordedEventType.TabActivated,
            timestamp: Date.now(),
            url: tab.url || "",
            tabId: activeInfo.tabId,
            previousTabId,
          };
          void this.stateManager.addEvent(event);
          console.debug("Tab activated event recorded", {
            tabId: activeInfo.tabId,
            previousTabId,
          });
        });
      }
    });
  }
}

// Initialize
new BackgroundController();
