import type { RecordedEventType, TextSelectionEvent } from "@shared/types";

import { SelectorGenerator } from "../selectors";
import type { EventEmitter, EventHandler } from "./types";

export class SelectionHandler implements EventHandler {
  private emitEvent: EventEmitter;
  private selectorGenerator: SelectorGenerator;
  private selectionchangeHandler: () => void;
  private mouseupHandler: (e: MouseEvent) => void;
  private lastSelection: string = "";

  constructor(emitEvent: EventEmitter, selectorGenerator: SelectorGenerator) {
    this.emitEvent = emitEvent;
    this.selectorGenerator = selectorGenerator;

    this.selectionchangeHandler = this.handleSelectionChange.bind(this);
    this.mouseupHandler = this.handleMouseUp.bind(this);
  }

  attach(): void {
    document.addEventListener("selectionchange", this.selectionchangeHandler);
    document.addEventListener("mouseup", this.mouseupHandler);
  }

  detach(): void {
    document.removeEventListener(
      "selectionchange",
      this.selectionchangeHandler
    );
    document.removeEventListener("mouseup", this.mouseupHandler);
  }

  private handleSelectionChange(): void {
    // Just track selection changes, we'll emit on mouseup
  }

  private handleMouseUp(_e: MouseEvent): void {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      this.lastSelection = "";
      return;
    }

    const selectedText = selection.toString().trim();
    if (!selectedText || selectedText === this.lastSelection) {
      return;
    }

    this.lastSelection = selectedText;
    this.recordSelectionEvent(selection, selectedText);
  }

  private async recordSelectionEvent(
    selection: Selection,
    selectedText: string
  ): Promise<void> {
    const range = selection.getRangeAt(0);
    const startContainer = range.startContainer;
    const endContainer = range.endContainer;

    // Get the element containing the start of selection
    const startElement =
      startContainer.nodeType === Node.ELEMENT_NODE
        ? (startContainer as Element)
        : startContainer.parentElement;

    // Get the element containing the end of selection
    const endElement =
      endContainer.nodeType === Node.ELEMENT_NODE
        ? (endContainer as Element)
        : endContainer.parentElement;

    if (!startElement) {
      return;
    }

    const startElementInfo =
      await this.selectorGenerator.generateElementInfo(startElement);
    const endElementInfo =
      endElement && endElement !== startElement
        ? await this.selectorGenerator.generateElementInfo(endElement)
        : undefined;

    const event: TextSelectionEvent = {
      id: crypto.randomUUID(),
      type: "textSelection" as RecordedEventType.TextSelection,
      timestamp: Date.now(),
      url: window.location.href,
      tabId: 0,
      selectedText,
      startElement: startElementInfo,
      endElement: endElementInfo,
      startOffset: range.startOffset,
      endOffset: range.endOffset,
    };

    this.emitEvent(event);
  }
}
