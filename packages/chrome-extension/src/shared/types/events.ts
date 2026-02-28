// Base event interface
export interface BaseRecordedEvent {
  id: string;
  type: RecordedEventType;
  timestamp: number;
  url: string;
  tabId: number;
  frameId?: number;
  framePath?: number[];
}

export enum RecordedEventType {
  // User interactions
  Click = "click",
  DoubleClick = "doubleClick",
  RightClick = "rightClick",
  Hover = "hover",
  Input = "input",
  Change = "change",
  Submit = "submit",
  Scroll = "scroll",
  DragStart = "dragStart",
  DragEnd = "dragEnd",
  Drop = "drop",
  KeyDown = "keyDown",
  KeyUp = "keyUp",
  TextSelection = "textSelection",

  // Navigation
  Navigate = "navigate",

  // Tab events
  TabCreated = "tabCreated",
  TabActivated = "tabActivated",
  TabClosed = "tabClosed",

  // Visual captures
  DomSnapshot = "domSnapshot",
  Screenshot = "screenshot",

  // Meta events
  ViewportResize = "viewportResize",
  SessionStart = "sessionStart",
  SessionEnd = "sessionEnd",
}

// Element information captured with events
export interface ElementInfo {
  /** Hash-based UID for MCP tool compatibility (format: $a1b2c3d4) */
  uid?: string;
  selectors: SelectorSet;
  tagName: string;
  textContent?: string;
  attributes: Record<string, string>;
  boundingRect: DOMRectJSON;
  isVisible: boolean;
  computedRole?: string;
  ariaLabel?: string;
  framePath?: number[];
  frameUrl?: string;
}

// JSON-serializable version of DOMRect
export interface DOMRectJSON {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface SelectorSet {
  css: string;
  xpath: string;
  cssPath: string;
  testId?: string;
  ariaSelector?: string;
  textSelector?: string;
  pierceSelector?: string;
}

export interface KeyModifiers {
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

// Specific event interfaces
export interface ClickEvent extends BaseRecordedEvent {
  type:
    | RecordedEventType.Click
    | RecordedEventType.DoubleClick
    | RecordedEventType.RightClick;
  element: ElementInfo;
  coordinates: {
    clientX: number;
    clientY: number;
    pageX: number;
    pageY: number;
    offsetX: number;
    offsetY: number;
  };
  button: "left" | "right" | "middle";
  modifiers: KeyModifiers;
}

export interface InputEvent extends BaseRecordedEvent {
  type: RecordedEventType.Input | RecordedEventType.Change;
  element: ElementInfo;
  value: string;
  inputType?: string;
  isPassword: boolean;
}

export interface ScrollEvent extends BaseRecordedEvent {
  type: RecordedEventType.Scroll;
  scrollX: number;
  scrollY: number;
  element?: ElementInfo;
  deltaX?: number;
  deltaY?: number;
}

export interface NavigationEvent extends BaseRecordedEvent {
  type: RecordedEventType.Navigate;
  fromUrl: string;
  toUrl: string;
  navigationType: "link" | "typed" | "reload" | "back_forward" | "form_submit";
}

export interface HoverEvent extends BaseRecordedEvent {
  type: RecordedEventType.Hover;
  element: ElementInfo;
  duration: number;
}

export interface DragDropEvent extends BaseRecordedEvent {
  type:
    | RecordedEventType.DragStart
    | RecordedEventType.DragEnd
    | RecordedEventType.Drop;
  sourceElement?: ElementInfo;
  targetElement?: ElementInfo;
  coordinates: {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  };
}

export interface KeyboardEvent extends BaseRecordedEvent {
  type: RecordedEventType.KeyDown | RecordedEventType.KeyUp;
  key: string;
  code: string;
  modifiers: KeyModifiers;
  targetElement?: ElementInfo;
}

export interface TextSelectionEvent extends BaseRecordedEvent {
  type: RecordedEventType.TextSelection;
  selectedText: string;
  startElement: ElementInfo;
  endElement?: ElementInfo;
  startOffset: number;
  endOffset: number;
}

export interface SubmitEvent extends BaseRecordedEvent {
  type: RecordedEventType.Submit;
  formElement: ElementInfo;
  formData: Record<string, string>;
  method: string;
  action: string;
}

export interface DomSnapshotEvent extends BaseRecordedEvent {
  type: RecordedEventType.DomSnapshot;
  snapshot: string; // Serialized DOM
  trigger: "initial" | "mutation" | "navigation" | "manual";
}

export interface ScreenshotEvent extends BaseRecordedEvent {
  type: RecordedEventType.Screenshot;
  dataUrl: string;
  trigger: "click" | "navigation" | "manual" | "interval";
  viewport: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
}

export interface ViewportResizeEvent extends BaseRecordedEvent {
  type: RecordedEventType.ViewportResize;
  width: number;
  height: number;
  devicePixelRatio: number;
}

export interface TabCreatedEvent extends BaseRecordedEvent {
  type: RecordedEventType.TabCreated;
  newTabId: number;
  openerTabId?: number;
  pendingUrl?: string;
}

export interface TabActivatedEvent extends BaseRecordedEvent {
  type: RecordedEventType.TabActivated;
  previousTabId?: number;
}

export interface TabClosedEvent extends BaseRecordedEvent {
  type: RecordedEventType.TabClosed;
  closedTabId: number;
}

// Union type for all events
export type RecordedEvent =
  | ClickEvent
  | InputEvent
  | ScrollEvent
  | NavigationEvent
  | HoverEvent
  | DragDropEvent
  | KeyboardEvent
  | TextSelectionEvent
  | SubmitEvent
  | DomSnapshotEvent
  | ScreenshotEvent
  | ViewportResizeEvent
  | TabCreatedEvent
  | TabActivatedEvent
  | TabClosedEvent;
