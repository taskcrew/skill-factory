import type { RecordingSettings } from "@shared/types";
import { MessageType } from "@shared/types/messages";

import type { RecordingStateManager } from "./state";

export class TabCoordinator {
  private stateManager: RecordingStateManager;
  private activeTabIds: Set<number> = new Set();

  constructor(stateManager: RecordingStateManager) {
    this.stateManager = stateManager;
  }

  async notifyAllTabs(
    isRecording: boolean,
    settings: RecordingSettings
  ): Promise<void> {
    try {
      const tabs = await chrome.tabs.query({});
      const eligibleTabs = tabs.filter(
        (tab) => tab.id && tab.url && !tab.url.startsWith("chrome://")
      );

      const results = await Promise.allSettled(
        eligibleTabs.map((tab) =>
          chrome.tabs
            .sendMessage(tab.id!, {
              type: MessageType.RecordingStateChanged,
              isRecording,
              settings,
            })
            .then(() => tab.id!)
        )
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          this.activeTabIds.add(result.value);
        }
      }
    } catch (error) {
      console.error("Failed to notify tabs:", error);
    }
  }

  async notifyTab(tabId: number): Promise<void> {
    const session = this.stateManager.getCurrentSession();
    const isRecording = session?.status === "recording";
    const settings = this.stateManager.getSettings();

    try {
      await chrome.tabs.sendMessage(tabId, {
        type: MessageType.RecordingStateChanged,
        isRecording,
        settings,
      });
      this.activeTabIds.add(tabId);
    } catch {
      // Tab might not have content script loaded yet
    }
  }

  onTabUpdated(tabId: number): void {
    // When a tab finishes loading, notify it of the current recording state
    this.notifyTab(tabId);
  }

  onTabRemoved(tabId: number): void {
    this.activeTabIds.delete(tabId);
  }
}
