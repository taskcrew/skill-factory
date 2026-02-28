import type {
  DragDropEvent,
  ElementInfo,
  RecordedEventType,
} from "@shared/types";

import { SelectorGenerator } from "../selectors";
import type { EventEmitter, EventHandler } from "./types";

export class DragDropHandler implements EventHandler {
  private emitEvent: EventEmitter;
  private selectorGenerator: SelectorGenerator;
  private dragstartHandler: (e: DragEvent) => void;
  private dragendHandler: (e: DragEvent) => void;
  private dropHandler: (e: DragEvent) => void;
  private dragStartInfo: {
    element: ElementInfo;
    x: number;
    y: number;
  } | null = null;

  constructor(emitEvent: EventEmitter, selectorGenerator: SelectorGenerator) {
    this.emitEvent = emitEvent;
    this.selectorGenerator = selectorGenerator;

    this.dragstartHandler = this.handleDragStart.bind(this);
    this.dragendHandler = this.handleDragEnd.bind(this);
    this.dropHandler = this.handleDrop.bind(this);
  }

  attach(): void {
    document.addEventListener("dragstart", this.dragstartHandler, {
      capture: true,
    });
    document.addEventListener("dragend", this.dragendHandler, {
      capture: true,
    });
    document.addEventListener("drop", this.dropHandler, { capture: true });
  }

  detach(): void {
    document.removeEventListener("dragstart", this.dragstartHandler, {
      capture: true,
    });
    document.removeEventListener("dragend", this.dragendHandler, {
      capture: true,
    });
    document.removeEventListener("drop", this.dropHandler, { capture: true });
  }

  private async handleDragStart(e: DragEvent): Promise<void> {
    const target = e.target as Element;
    if (!target) {
      return;
    }

    const elementInfo =
      await this.selectorGenerator.generateElementInfo(target);

    this.dragStartInfo = {
      element: elementInfo,
      x: e.clientX,
      y: e.clientY,
    };

    const event: DragDropEvent = {
      id: crypto.randomUUID(),
      type: "dragStart" as RecordedEventType.DragStart,
      timestamp: Date.now(),
      url: window.location.href,
      tabId: 0,
      sourceElement: elementInfo,
      coordinates: {
        startX: e.clientX,
        startY: e.clientY,
        endX: e.clientX,
        endY: e.clientY,
      },
    };

    this.emitEvent(event);
  }

  private async handleDragEnd(e: DragEvent): Promise<void> {
    const target = e.target as Element;
    if (!target) {
      return;
    }

    const elementInfo =
      await this.selectorGenerator.generateElementInfo(target);

    const event: DragDropEvent = {
      id: crypto.randomUUID(),
      type: "dragEnd" as RecordedEventType.DragEnd,
      timestamp: Date.now(),
      url: window.location.href,
      tabId: 0,
      sourceElement: this.dragStartInfo?.element,
      targetElement: elementInfo,
      coordinates: {
        startX: this.dragStartInfo?.x ?? e.clientX,
        startY: this.dragStartInfo?.y ?? e.clientY,
        endX: e.clientX,
        endY: e.clientY,
      },
    };

    this.emitEvent(event);
    this.dragStartInfo = null;
  }

  private async handleDrop(e: DragEvent): Promise<void> {
    const target = e.target as Element;
    if (!target) {
      return;
    }

    const elementInfo =
      await this.selectorGenerator.generateElementInfo(target);

    const event: DragDropEvent = {
      id: crypto.randomUUID(),
      type: "drop" as RecordedEventType.Drop,
      timestamp: Date.now(),
      url: window.location.href,
      tabId: 0,
      sourceElement: this.dragStartInfo?.element,
      targetElement: elementInfo,
      coordinates: {
        startX: this.dragStartInfo?.x ?? e.clientX,
        startY: this.dragStartInfo?.y ?? e.clientY,
        endX: e.clientX,
        endY: e.clientY,
      },
    };

    this.emitEvent(event);
  }
}
