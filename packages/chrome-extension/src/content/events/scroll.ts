import type { RecordedEventType, ScrollEvent } from "@shared/types";

import { SelectorGenerator } from "../selectors";
import type { EventEmitter, EventHandler } from "./types";

export class ScrollHandler implements EventHandler {
  private emitEvent: EventEmitter;
  private selectorGenerator: SelectorGenerator;
  private debounceMs: number;
  private scrollHandler: (e: Event) => void;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastScrollPosition = { x: 0, y: 0 };

  constructor(
    emitEvent: EventEmitter,
    selectorGenerator: SelectorGenerator,
    debounceMs: number = 150
  ) {
    this.emitEvent = emitEvent;
    this.selectorGenerator = selectorGenerator;
    this.debounceMs = debounceMs;

    this.scrollHandler = this.handleScroll.bind(this);
  }

  attach(): void {
    window.addEventListener("scroll", this.scrollHandler, {
      capture: true,
      passive: true,
    });
  }

  detach(): void {
    window.removeEventListener("scroll", this.scrollHandler, { capture: true });
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
  }

  private handleScroll(e: Event): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.recordScrollEvent(e);
    }, this.debounceMs);
  }

  private async recordScrollEvent(e: Event): Promise<void> {
    const target = e.target;
    const isWindowScroll = target === document || target === window;

    let scrollX: number;
    let scrollY: number;
    let elementInfo = undefined;

    if (isWindowScroll) {
      scrollX = window.scrollX;
      scrollY = window.scrollY;
    } else if (target instanceof Element) {
      scrollX = target.scrollLeft;
      scrollY = target.scrollTop;
      elementInfo = await this.selectorGenerator.generateElementInfo(target);
    } else {
      return;
    }

    // Calculate delta from last position
    const deltaX = scrollX - this.lastScrollPosition.x;
    const deltaY = scrollY - this.lastScrollPosition.y;

    // Don't emit if scroll position hasn't changed significantly
    if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) {
      return;
    }

    this.lastScrollPosition = { x: scrollX, y: scrollY };

    const event: ScrollEvent = {
      id: crypto.randomUUID(),
      type: "scroll" as RecordedEventType.Scroll,
      timestamp: Date.now(),
      url: window.location.href,
      tabId: 0,
      scrollX,
      scrollY,
      deltaX,
      deltaY,
      element: elementInfo,
    };

    this.emitEvent(event);
  }
}
