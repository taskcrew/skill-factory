import type {
  KeyboardEvent as RecordedKeyboardEvent,
  RecordedEventType,
} from "@shared/types";

import { SelectorGenerator } from "../selectors";
import type { EventEmitter, EventHandler } from "./types";

export class KeyboardHandler implements EventHandler {
  private emitEvent: EventEmitter;
  private selectorGenerator: SelectorGenerator;
  private keydownHandler: (e: KeyboardEvent) => void;
  private keyupHandler: (e: KeyboardEvent) => void;

  /**
   * Keys that have semantic meaning for workflow replay.
   * We exclude navigation/editing keys (Backspace, Delete, arrows)
   * as they're just part of typing - the final value is what matters.
   */
  private readonly captureKeys = new Set([
    "Enter", // Form submission, confirmations
    "Escape", // Close dialogs, cancel actions
    "Tab", // Form field navigation (when not just typing)
    "F1",
    "F2",
    "F3",
    "F4",
    "F5",
    "F6",
    "F7",
    "F8",
    "F9",
    "F10",
    "F11",
    "F12",
  ]);

  /**
   * Keys to skip even with modifiers (editing shortcuts that don't need replay)
   */
  private readonly skipKeys = new Set([
    "Backspace",
    "Delete",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "Home",
    "End",
    "PageUp",
    "PageDown",
  ]);

  constructor(emitEvent: EventEmitter, selectorGenerator: SelectorGenerator) {
    this.emitEvent = emitEvent;
    this.selectorGenerator = selectorGenerator;

    this.keydownHandler = this.handleKeyDown.bind(this);
    this.keyupHandler = this.handleKeyUp.bind(this);
  }

  attach(): void {
    // Only capture keydown - keyup is noise for workflow replay
    document.addEventListener("keydown", this.keydownHandler, {
      capture: true,
    });
  }

  detach(): void {
    document.removeEventListener("keydown", this.keydownHandler, {
      capture: true,
    });
  }

  private shouldCapture(e: KeyboardEvent): boolean {
    // Skip navigation/editing keys - they're just part of typing
    if (this.skipKeys.has(e.key)) {
      return false;
    }

    // Always capture semantic keys (Enter, Escape, Tab, F-keys)
    if (this.captureKeys.has(e.key)) {
      return true;
    }

    // Capture meaningful keyboard shortcuts (Ctrl+S, Cmd+A, etc.)
    // but not Ctrl+Backspace, Ctrl+Arrow, etc.
    if (e.ctrlKey || e.metaKey || e.altKey) {
      return true;
    }

    return false;
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.shouldCapture(e)) {
      return;
    }
    this.recordKeyboardEvent(e, "keyDown" as RecordedEventType.KeyDown);
  }

  private handleKeyUp(e: KeyboardEvent): void {
    if (!this.shouldCapture(e)) {
      return;
    }
    this.recordKeyboardEvent(e, "keyUp" as RecordedEventType.KeyUp);
  }

  private async recordKeyboardEvent(
    e: KeyboardEvent,
    type: RecordedEventType.KeyDown | RecordedEventType.KeyUp
  ): Promise<void> {
    const target = e.target as Element | null;
    const targetElement = target
      ? await this.selectorGenerator.generateElementInfo(target)
      : undefined;

    const event: RecordedKeyboardEvent = {
      id: crypto.randomUUID(),
      type,
      timestamp: Date.now(),
      url: window.location.href,
      tabId: 0,
      key: e.key,
      code: e.code,
      modifiers: {
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
      },
      targetElement,
    };

    this.emitEvent(event);
  }
}
