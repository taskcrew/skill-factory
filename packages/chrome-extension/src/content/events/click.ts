import type { ClickEvent, RecordedEventType } from "@shared/types";
import { MessageType } from "@shared/types/messages";

import { SelectorGenerator } from "../selectors";
import type { EventEmitter, EventHandler } from "./types";

export class ClickHandler implements EventHandler {
  private emitEvent: EventEmitter;
  private selectorGenerator: SelectorGenerator;
  private clickHandler: (e: MouseEvent) => void;
  private dblClickHandler: (e: MouseEvent) => void;
  private contextMenuHandler: (e: MouseEvent) => void;

  constructor(emitEvent: EventEmitter, selectorGenerator: SelectorGenerator) {
    this.emitEvent = emitEvent;
    this.selectorGenerator = selectorGenerator;

    this.clickHandler = this.handleClick.bind(this);
    this.dblClickHandler = this.handleDoubleClick.bind(this);
    this.contextMenuHandler = this.handleContextMenu.bind(this);
  }

  attach(): void {
    document.addEventListener("click", this.clickHandler, { capture: true });
    document.addEventListener("dblclick", this.dblClickHandler, {
      capture: true,
    });
    document.addEventListener("contextmenu", this.contextMenuHandler, {
      capture: true,
    });
  }

  detach(): void {
    document.removeEventListener("click", this.clickHandler, { capture: true });
    document.removeEventListener("dblclick", this.dblClickHandler, {
      capture: true,
    });
    document.removeEventListener("contextmenu", this.contextMenuHandler, {
      capture: true,
    });
  }

  private handleClick(e: MouseEvent): void {
    this.recordClickEvent(e, "click" as RecordedEventType.Click, "left");
    this.requestScreenshot("click");
  }

  private handleDoubleClick(e: MouseEvent): void {
    this.recordClickEvent(
      e,
      "doubleClick" as RecordedEventType.DoubleClick,
      "left"
    );
  }

  private handleContextMenu(e: MouseEvent): void {
    this.recordClickEvent(
      e,
      "rightClick" as RecordedEventType.RightClick,
      "right"
    );
  }

  private async recordClickEvent(
    e: MouseEvent,
    type:
      | RecordedEventType.Click
      | RecordedEventType.DoubleClick
      | RecordedEventType.RightClick,
    button: "left" | "right" | "middle"
  ): Promise<void> {
    const target = e.target as Element;
    if (!target) {
      return;
    }

    const elementInfo =
      await this.selectorGenerator.generateElementInfo(target);
    const rect = target.getBoundingClientRect();

    const event: ClickEvent = {
      id: crypto.randomUUID(),
      type,
      timestamp: Date.now(),
      url: window.location.href,
      tabId: 0, // Will be set by background
      element: elementInfo,
      coordinates: {
        clientX: e.clientX,
        clientY: e.clientY,
        pageX: e.pageX,
        pageY: e.pageY,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
      },
      button,
      modifiers: {
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
      },
    };

    this.emitEvent(event);
  }

  private requestScreenshot(trigger: "click"): void {
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
