import type { NavigationEvent, RecordedEventType } from "@shared/types";
import { MessageType } from "@shared/types/messages";

import type { EventEmitter, EventHandler } from "./types";

export class NavigationHandler implements EventHandler {
  private emitEvent: EventEmitter;
  private currentUrl: string;
  private popstateHandler: (e: PopStateEvent) => void;
  private hashchangeHandler: (e: HashChangeEvent) => void;
  private beforeunloadHandler: (e: BeforeUnloadEvent) => void;

  // Store original methods for monkey-patching
  private originalPushState: typeof history.pushState | null = null;
  private originalReplaceState: typeof history.replaceState | null = null;

  constructor(emitEvent: EventEmitter) {
    this.emitEvent = emitEvent;
    this.currentUrl = window.location.href;

    this.popstateHandler = this.handlePopState.bind(this);
    this.hashchangeHandler = this.handleHashChange.bind(this);
    this.beforeunloadHandler = this.handleBeforeUnload.bind(this);
  }

  attach(): void {
    window.addEventListener("popstate", this.popstateHandler);
    window.addEventListener("hashchange", this.hashchangeHandler);
    window.addEventListener("beforeunload", this.beforeunloadHandler);

    this.patchHistoryMethods();
  }

  detach(): void {
    window.removeEventListener("popstate", this.popstateHandler);
    window.removeEventListener("hashchange", this.hashchangeHandler);
    window.removeEventListener("beforeunload", this.beforeunloadHandler);

    this.restoreHistoryMethods();
  }

  private patchHistoryMethods(): void {
    this.originalPushState = history.pushState.bind(history);
    this.originalReplaceState = history.replaceState.bind(history);

    const originalPush = this.originalPushState;
    const originalReplace = this.originalReplaceState;
    const handleNav = this.handleNavigation.bind(this);

    history.pushState = function (
      data: unknown,
      unused: string,
      url?: string | URL | null
    ) {
      originalPush(data, unused, url);
      if (url) {
        handleNav("link", url.toString());
      }
    };

    history.replaceState = function (
      data: unknown,
      unused: string,
      url?: string | URL | null
    ) {
      originalReplace(data, unused, url);
      if (url) {
        handleNav("typed", url.toString());
      }
    };
  }

  private restoreHistoryMethods(): void {
    if (this.originalPushState) {
      history.pushState = this.originalPushState;
    }
    if (this.originalReplaceState) {
      history.replaceState = this.originalReplaceState;
    }
  }

  private handlePopState(_e: PopStateEvent): void {
    this.handleNavigation("back_forward", window.location.href);
  }

  private handleHashChange(e: HashChangeEvent): void {
    this.handleNavigation("link", e.newURL);
  }

  private handleBeforeUnload(_e: BeforeUnloadEvent): void {
    // Record that we're navigating away
    this.recordNavigationEvent(this.currentUrl, "", "link");
  }

  private handleNavigation(
    type: NavigationEvent["navigationType"],
    newUrl: string
  ): void {
    const resolvedUrl = new URL(newUrl, window.location.href).href;
    if (resolvedUrl !== this.currentUrl) {
      this.recordNavigationEvent(this.currentUrl, resolvedUrl, type);
      this.currentUrl = resolvedUrl;
      this.requestScreenshot("navigation");
    }
  }

  private recordNavigationEvent(
    fromUrl: string,
    toUrl: string,
    navigationType: NavigationEvent["navigationType"]
  ): void {
    const event: NavigationEvent = {
      id: crypto.randomUUID(),
      type: "navigate" as RecordedEventType.Navigate,
      timestamp: Date.now(),
      url: toUrl || fromUrl,
      tabId: 0,
      fromUrl,
      toUrl,
      navigationType,
    };

    this.emitEvent(event);
  }

  private requestScreenshot(trigger: "navigation"): void {
    chrome.runtime
      .sendMessage({
        type: MessageType.RequestScreenshot,
        trigger,
      })
      .catch(() => {
        // Ignore errors if background is not ready
      });
  }
}
