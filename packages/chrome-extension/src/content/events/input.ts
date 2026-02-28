import type {
  InputEvent as RecordedInputEvent,
  RecordedEventType,
} from "@shared/types";

import { SelectorGenerator } from "../selectors";
import type { EventEmitter, EventHandler } from "./types";

/**
 * Input debounce delay in milliseconds.
 * After user stops typing for this duration, we emit the final value.
 * This prevents recording every keystroke and gives us the final value.
 */
const INPUT_DEBOUNCE_MS = 500;

export class InputHandler implements EventHandler {
  private emitEvent: EventEmitter;
  private selectorGenerator: SelectorGenerator;
  private maskInputs: boolean;
  private inputHandler: (e: Event) => void;
  private changeHandler: (e: Event) => void;
  private blurHandler: (e: Event) => void;

  /** Track pending debounced input events */
  private pendingInputs: WeakMap<Element, ReturnType<typeof setTimeout>> =
    new WeakMap();
  /** Track elements that have pending input to emit on blur */
  private dirtyElements: WeakSet<Element> = new WeakSet();
  /** Track last emitted values to avoid duplicates */
  private lastEmittedValues: WeakMap<Element, string> = new WeakMap();

  constructor(
    emitEvent: EventEmitter,
    selectorGenerator: SelectorGenerator,
    maskInputs: boolean = true
  ) {
    this.emitEvent = emitEvent;
    this.selectorGenerator = selectorGenerator;
    this.maskInputs = maskInputs;

    this.inputHandler = this.handleInput.bind(this);
    this.changeHandler = this.handleChange.bind(this);
    this.blurHandler = this.handleBlur.bind(this);
  }

  attach(): void {
    document.addEventListener("input", this.inputHandler, { capture: true });
    document.addEventListener("change", this.changeHandler, { capture: true });
    document.addEventListener("blur", this.blurHandler, { capture: true });
  }

  detach(): void {
    document.removeEventListener("input", this.inputHandler, { capture: true });
    document.removeEventListener("change", this.changeHandler, {
      capture: true,
    });
    document.removeEventListener("blur", this.blurHandler, { capture: true });
  }

  private handleInput(e: Event): void {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement;
    if (!this.isInputElement(target)) {
      return;
    }

    // Mark element as dirty (has pending changes)
    this.dirtyElements.add(target);

    // Cancel any pending debounced emit for this element
    const pendingTimer = this.pendingInputs.get(target);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
    }

    // Schedule debounced emit - will fire after user stops typing
    const timer = setTimeout(() => {
      this.emitFinalValue(target, "input" as RecordedEventType.Input);
    }, INPUT_DEBOUNCE_MS);

    this.pendingInputs.set(target, timer);
  }

  private handleChange(e: Event): void {
    const target = e.target as
      | HTMLInputElement
      | HTMLTextAreaElement
      | HTMLSelectElement;
    if (!this.isInputElement(target)) {
      return;
    }

    // Cancel any pending debounced emit
    const pendingTimer = this.pendingInputs.get(target);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      this.pendingInputs.delete(target);
    }

    // Emit the final value immediately on change
    this.emitFinalValue(target, "change" as RecordedEventType.Change);
  }

  private handleBlur(e: Event): void {
    const target = e.target as
      | HTMLInputElement
      | HTMLTextAreaElement
      | HTMLSelectElement;
    if (!this.isInputElement(target)) {
      return;
    }

    // If element has dirty (unemitted) changes, emit them now
    if (this.dirtyElements.has(target)) {
      // Cancel any pending debounced emit
      const pendingTimer = this.pendingInputs.get(target);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        this.pendingInputs.delete(target);
      }

      this.emitFinalValue(target, "change" as RecordedEventType.Change);
    }
  }

  private emitFinalValue(
    target: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
    type: RecordedEventType.Input | RecordedEventType.Change
  ): void {
    const currentValue = target.value;
    const lastEmitted = this.lastEmittedValues.get(target);

    // Don't emit if value hasn't changed since last emit
    if (currentValue === lastEmitted) {
      this.dirtyElements.delete(target);
      return;
    }

    // Update tracking
    this.lastEmittedValues.set(target, currentValue);
    this.dirtyElements.delete(target);
    this.pendingInputs.delete(target);

    // Record the event with final value
    this.recordInputEvent(target, type);
  }

  private isInputElement(
    el: EventTarget | null
  ): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
    return (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement
    );
  }

  private async recordInputEvent(
    target: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
    type: RecordedEventType.Input | RecordedEventType.Change
  ): Promise<void> {
    const isPassword =
      target instanceof HTMLInputElement && target.type === "password";
    const elementInfo =
      await this.selectorGenerator.generateElementInfo(target);

    let value = "";
    if (target instanceof HTMLSelectElement) {
      value = target.value;
    } else {
      value = isPassword && this.maskInputs ? "********" : target.value;
    }

    const event: RecordedInputEvent = {
      id: crypto.randomUUID(),
      type,
      timestamp: Date.now(),
      url: window.location.href,
      tabId: 0,
      element: elementInfo,
      value,
      inputType:
        target instanceof HTMLInputElement
          ? target.type
          : target.tagName.toLowerCase(),
      isPassword,
    };

    this.emitEvent(event);
  }
}
