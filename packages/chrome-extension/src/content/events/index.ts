import type { RecordedEvent, RecordingSettings } from "@shared/types";
import { MessageType } from "@shared/types/messages";

import { SelectorGenerator } from "../selectors";
import { ClickHandler } from "./click";
import { DragDropHandler } from "./dragdrop";
import { HoverHandler } from "./hover";
import { InputHandler } from "./input";
import { KeyboardHandler } from "./keyboard";
import { NavigationHandler } from "./navigation";
import { ScrollHandler } from "./scroll";
import { SelectionHandler } from "./selection";
import type { EventEmitter, EventHandler } from "./types";

export class EventOrchestrator {
  private handlers: EventHandler[] = [];
  private selectorGenerator: SelectorGenerator;
  private eventQueue: RecordedEvent[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private framePath: number[] = [];

  constructor() {
    this.selectorGenerator = new SelectorGenerator();
  }

  start(settings: RecordingSettings, framePath: number[] = []): void {
    this.framePath = framePath;
    this.selectorGenerator = new SelectorGenerator(framePath);
    console.log(
      "[skill-factory] EventOrchestrator starting with settings:",
      settings
    );
    const emitEvent = this.createEventEmitter();

    if (settings.captureClicks) {
      this.handlers.push(new ClickHandler(emitEvent, this.selectorGenerator));
    }
    if (settings.captureInput) {
      this.handlers.push(
        new InputHandler(emitEvent, this.selectorGenerator, settings.maskInputs)
      );
    }
    if (settings.captureScroll) {
      this.handlers.push(
        new ScrollHandler(
          emitEvent,
          this.selectorGenerator,
          settings.scrollDebounce
        )
      );
    }
    if (settings.captureNavigation) {
      this.handlers.push(new NavigationHandler(emitEvent));
    }
    if (settings.captureHover) {
      this.handlers.push(
        new HoverHandler(
          emitEvent,
          this.selectorGenerator,
          settings.hoverThreshold
        )
      );
    }
    if (settings.captureDragDrop) {
      this.handlers.push(
        new DragDropHandler(emitEvent, this.selectorGenerator)
      );
    }
    if (settings.captureKeyboard) {
      this.handlers.push(
        new KeyboardHandler(emitEvent, this.selectorGenerator)
      );
    }
    if (settings.captureTextSelection) {
      this.handlers.push(
        new SelectionHandler(emitEvent, this.selectorGenerator)
      );
    }

    // Attach all handlers
    this.handlers.forEach((h) => h.attach());

    // Start flush interval
    this.startFlushInterval();
  }

  stop(): void {
    // Detach all handlers
    this.handlers.forEach((h) => h.detach());
    this.handlers = [];

    // Flush remaining events
    this.flushEventQueue();

    // Stop flush interval
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  private createEventEmitter(): EventEmitter {
    return (event: RecordedEvent) => {
      event.url = window.location.href;
      if (this.framePath.length > 0) {
        event.framePath = this.framePath;
      }
      this.eventQueue.push(event);

      // Immediately flush for important events
      if (
        event.type === "click" ||
        event.type === "navigate" ||
        event.type === "submit"
      ) {
        this.flushEventQueue();
      }
    };
  }

  private startFlushInterval(): void {
    this.flushInterval = setInterval(() => {
      this.flushEventQueue();
    }, 100);
  }

  private flushEventQueue(): void {
    if (this.eventQueue.length === 0) {
      return;
    }

    const events = [...this.eventQueue];
    this.eventQueue = [];

    console.log("[skill-factory] Flushing", events.length, "events to background");

    for (const event of events) {
      chrome.runtime
        .sendMessage({
          type: MessageType.RecordEvent,
          event,
        })
        .then(() => {
          console.log("[skill-factory] Event sent:", event.type);
        })
        .catch((error) => {
          console.error("[skill-factory] Failed to send event:", error);
        });
    }
  }
}

export { type EventEmitter, type EventHandler } from "./types";
