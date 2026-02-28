import type { RecordedEventType, ScreenshotEvent } from "@shared/types";

export class ScreenshotCapture {
  private lastCaptureTime = 0;
  private readonly MIN_INTERVAL = 500; // Minimum ms between captures

  async capture(
    tabId: number,
    trigger: "click" | "navigation" | "manual" | "interval"
  ): Promise<ScreenshotEvent | null> {
    const now = Date.now();
    if (now - this.lastCaptureTime < this.MIN_INTERVAL) {
      return null; // Rate limit
    }
    this.lastCaptureTime = now;

    try {
      // Get the window containing the tab
      const tab = await chrome.tabs.get(tabId);
      if (!tab.windowId) {
        return null;
      }

      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: "png",
        quality: 80,
      });

      return {
        id: crypto.randomUUID(),
        type: "screenshot" as RecordedEventType.Screenshot,
        timestamp: now,
        url: tab.url || "",
        tabId,
        dataUrl,
        trigger,
        viewport: {
          width: tab.width || 0,
          height: tab.height || 0,
          devicePixelRatio: 1,
        },
      };
    } catch (error) {
      console.error("Screenshot capture failed:", error);
      return null;
    }
  }
}
