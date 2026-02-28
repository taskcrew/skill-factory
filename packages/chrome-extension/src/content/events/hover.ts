import type { HoverEvent, RecordedEventType } from "@shared/types";

import { SelectorGenerator } from "../selectors";
import type { EventEmitter, EventHandler } from "./types";

export class HoverHandler implements EventHandler {
  private emitEvent: EventEmitter;
  private selectorGenerator: SelectorGenerator;
  private hoverThreshold: number;
  private mouseoverHandler: (e: MouseEvent) => void;
  private mouseoutHandler: (e: MouseEvent) => void;
  private hoverTimers: WeakMap<Element, ReturnType<typeof setTimeout>> =
    new WeakMap();
  private hoverStartTimes: WeakMap<Element, number> = new WeakMap();
  private currentHoveredElement: Element | null = null;

  constructor(
    emitEvent: EventEmitter,
    selectorGenerator: SelectorGenerator,
    hoverThreshold: number = 1000
  ) {
    this.emitEvent = emitEvent;
    this.selectorGenerator = selectorGenerator;
    this.hoverThreshold = hoverThreshold;

    this.mouseoverHandler = this.handleMouseOver.bind(this);
    this.mouseoutHandler = this.handleMouseOut.bind(this);
  }

  attach(): void {
    document.addEventListener("mouseover", this.mouseoverHandler, {
      capture: true,
    });
    document.addEventListener("mouseout", this.mouseoutHandler, {
      capture: true,
    });
  }

  detach(): void {
    document.removeEventListener("mouseover", this.mouseoverHandler, {
      capture: true,
    });
    document.removeEventListener("mouseout", this.mouseoutHandler, {
      capture: true,
    });

    // Clear any pending timers
    if (this.currentHoveredElement) {
      const timer = this.hoverTimers.get(this.currentHoveredElement);
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private handleMouseOver(e: MouseEvent): void {
    const target = e.target as Element;
    if (!target || target === this.currentHoveredElement) {
      return;
    }

    // Clear previous hover if any
    if (this.currentHoveredElement) {
      this.clearHoverTimer(this.currentHoveredElement);
    }

    this.currentHoveredElement = target;
    this.hoverStartTimes.set(target, Date.now());

    // Start timer for hover threshold
    const timer = setTimeout(() => {
      this.recordHoverEvent(target);
    }, this.hoverThreshold);

    this.hoverTimers.set(target, timer);
  }

  private handleMouseOut(e: MouseEvent): void {
    const target = e.target as Element;
    if (!target) {
      return;
    }

    this.clearHoverTimer(target);

    if (this.currentHoveredElement === target) {
      this.currentHoveredElement = null;
    }
  }

  private clearHoverTimer(element: Element): void {
    const timer = this.hoverTimers.get(element);
    if (timer) {
      clearTimeout(timer);
      this.hoverTimers.delete(element);
    }
  }

  private async recordHoverEvent(target: Element): Promise<void> {
    const startTime = this.hoverStartTimes.get(target);
    const duration = startTime ? Date.now() - startTime : this.hoverThreshold;

    const elementInfo =
      await this.selectorGenerator.generateElementInfo(target);

    const event: HoverEvent = {
      id: crypto.randomUUID(),
      type: "hover" as RecordedEventType.Hover,
      timestamp: Date.now(),
      url: window.location.href,
      tabId: 0,
      element: elementInfo,
      duration,
    };

    this.emitEvent(event);
  }
}
