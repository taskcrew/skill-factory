/**
 * MCP Workflow Export
 *
 * Converts recorded browser sessions into MCP tool call workflows
 * that can be replayed by AI agents using the chrome-devtools MCP tools.
 *
 * The export format uses hash-based UIDs that are stable across page reloads,
 * matching the UID generation algorithm in the MCP chrome-devtools server.
 */

import type {
  ClickEvent,
  DomSnapshotEvent,
  DragDropEvent,
  ElementInfo,
  HoverEvent,
  InputEvent,
  KeyboardEvent,
  NavigationEvent,
  RecordedEvent,
  RecordingSession,
  ScreenshotEvent,
  ScrollEvent,
  SubmitEvent,
  TabActivatedEvent,
  TabCreatedEvent,
} from "@shared/types";

/**
 * MCP Workflow format - represents a recorded user workflow
 * as a sequence of MCP tool calls
 */
export interface McpWorkflow {
  /** Name of the workflow */
  name: string;
  /** Starting URL for the workflow */
  startUrl: string;
  /** Viewport dimensions used during recording */
  viewport: {
    width: number;
    height: number;
  };
  /** Sequence of MCP tool calls */
  steps: McpStep[];
}

/**
 * Single step in an MCP workflow - represents one tool call
 */
export interface McpStep {
  /** MCP tool name to call */
  tool: string;
  /** Tool parameters - matches MCP tool input schemas exactly */
  params: Record<string, unknown>;
  /** CSS selectors as fallback if UID fails */
  fallbackSelectors?: string[];
  /** Human-readable description for agent context */
  description?: string;
  /** Screenshot at this step (base64) - helps agent verify state */
  screenshot?: string;
  /**
   * DOM snapshot in accessibility tree format at this step.
   * Format matches take_snapshot output from MCP chrome-devtools.
   * Helps agent understand page state and available elements.
   */
  snapshot?: string;
  /** Index-based path to the target iframe */
  framePath?: number[];
}

/**
 * Convert a recording session to an MCP workflow
 */
export function convertToMcp(session: RecordingSession): McpWorkflow {
  const steps: McpStep[] = [];

  // Add initial navigation
  if (session.metadata.startUrl) {
    steps.push({
      tool: "navigate_page",
      params: { url: session.metadata.startUrl },
      description: `Navigate to ${session.metadata.title || session.metadata.startUrl}`,
    });
  }

  // Track last screenshot and snapshot for attaching to steps
  let lastScreenshot: string | undefined;
  let lastSnapshot: string | undefined;

  // Convert each event to MCP steps
  for (const event of session.events) {
    // Capture screenshots for context
    if (event.type === "screenshot") {
      lastScreenshot = (event as ScreenshotEvent).dataUrl;
      continue;
    }

    // Capture DOM snapshots for context
    if (event.type === "domSnapshot") {
      lastSnapshot = (event as DomSnapshotEvent).snapshot;
      continue;
    }

    const rawStep = convertEventToStep(event);
    if (rawStep) {
      const step = addFrameContext(rawStep, event);
      // Attach screenshot and snapshot to clicks and navigations for visual/structural context
      if (
        step.tool === "click" ||
        step.tool === "navigate_page" ||
        step.tool === "fill"
      ) {
        if (lastScreenshot) {
          step.screenshot = lastScreenshot;
          lastScreenshot = undefined;
        }
        if (lastSnapshot) {
          step.snapshot = lastSnapshot;
          lastSnapshot = undefined;
        }
      }
      steps.push(step);
    }
  }

  // Optimize steps (merge consecutive inputs, remove redundant hovers)
  const optimizedSteps = optimizeSteps(steps);

  return {
    name: session.name,
    startUrl: session.metadata.startUrl,
    viewport: {
      width: session.metadata.screenWidth || 1920,
      height: session.metadata.screenHeight || 1080,
    },
    steps: optimizedSteps,
  };
}

/**
 * Convert a single recorded event to an MCP step
 */
function addFrameContext(step: McpStep, event: RecordedEvent): McpStep {
  const framePath = event.framePath;
  if (!framePath || framePath.length === 0) {
    return step;
  }
  step.framePath = framePath;
  if (step.description) {
    step.description += ` (in iframe [${framePath.join(",")}])`;
  }
  return step;
}

function convertEventToStep(event: RecordedEvent): McpStep | null {
  switch (event.type) {
    case "click":
      return convertClickEvent(event as ClickEvent);

    case "doubleClick":
      return convertDoubleClickEvent(event as ClickEvent);

    case "rightClick":
      return convertRightClickEvent(event as ClickEvent);

    case "input":
    case "change":
      return convertInputEvent(event as InputEvent);

    case "navigate":
      return convertNavigationEvent(event as NavigationEvent);

    case "keyDown":
      return convertKeyboardEvent(event as KeyboardEvent);

    case "hover":
      return convertHoverEvent(event as HoverEvent);

    case "dragStart":
      // Skip dragStart, we handle drag in drop event
      return null;

    case "drop":
      return convertDropEvent(event as DragDropEvent);

    case "scroll":
      return convertScrollEvent(event as ScrollEvent);

    case "submit":
      return convertSubmitEvent(event as SubmitEvent);

    case "tabCreated":
      return convertTabCreatedEvent(event as TabCreatedEvent);

    case "tabActivated":
      return convertTabActivatedEvent(event as TabActivatedEvent);

    case "tabClosed":
      // Tab closed doesn't need an MCP step, just skip
      return null;

    default:
      // Skip events that don't map to MCP tools
      return null;
  }
}

function convertClickEvent(event: ClickEvent): McpStep {
  const fallbackSelectors = buildFallbackSelectors(event.element);

  return {
    tool: "click",
    params: event.element.uid
      ? { uid: event.element.uid }
      : { selector: fallbackSelectors[0] || event.element.selectors.css },
    fallbackSelectors,
    description: buildClickDescription(event.element),
  };
}

function convertDoubleClickEvent(event: ClickEvent): McpStep {
  const fallbackSelectors = buildFallbackSelectors(event.element);

  return {
    tool: "click",
    params: {
      ...(event.element.uid
        ? { uid: event.element.uid }
        : { selector: fallbackSelectors[0] || event.element.selectors.css }),
      dblClick: true,
    },
    fallbackSelectors,
    description: `Double-click ${event.element.tagName}`,
  };
}

function convertRightClickEvent(event: ClickEvent): McpStep {
  const fallbackSelectors = buildFallbackSelectors(event.element);

  // MCP tools don't have a dedicated right-click, use click with context
  return {
    tool: "click",
    params: event.element.uid
      ? { uid: event.element.uid }
      : { selector: fallbackSelectors[0] || event.element.selectors.css },
    fallbackSelectors,
    description: `Right-click ${event.element.tagName}`,
  };
}

function convertInputEvent(event: InputEvent): McpStep {
  const fallbackSelectors = buildFallbackSelectors(event.element);

  return {
    tool: "fill",
    params: {
      ...(event.element.uid
        ? { uid: event.element.uid }
        : { selector: fallbackSelectors[0] || event.element.selectors.css }),
      value: event.isPassword ? "" : event.value,
    },
    fallbackSelectors,
    description: `Fill ${event.element.tagName}${event.isPassword ? " (password)" : ""}`,
  };
}

function convertNavigationEvent(event: NavigationEvent): McpStep {
  return {
    tool: "navigate_page",
    params: { url: event.toUrl },
    description: `Navigate to ${event.toUrl}`,
  };
}

function convertKeyboardEvent(event: KeyboardEvent): McpStep | null {
  // Build key combination string (e.g., "Control+A", "Enter")
  const parts: string[] = [];

  if (event.modifiers.ctrlKey) {
    parts.push("Control");
  }
  if (event.modifiers.metaKey) {
    parts.push("Meta");
  }
  if (event.modifiers.altKey) {
    parts.push("Alt");
  }
  if (event.modifiers.shiftKey) {
    parts.push("Shift");
  }

  // Add the main key
  parts.push(event.key);

  const keyCombo = parts.join("+");

  return {
    tool: "press_key",
    params: { key: keyCombo },
    description: `Press ${keyCombo}`,
  };
}

function convertHoverEvent(event: HoverEvent): McpStep {
  const fallbackSelectors = buildFallbackSelectors(event.element);

  return {
    tool: "hover",
    params: event.element.uid
      ? { uid: event.element.uid }
      : { selector: fallbackSelectors[0] || event.element.selectors.css },
    fallbackSelectors,
    description: `Hover over ${event.element.tagName}`,
  };
}

function convertDropEvent(event: DragDropEvent): McpStep | null {
  if (!event.sourceElement || !event.targetElement) {
    return null;
  }

  return {
    tool: "drag",
    params: {
      from_uid: event.sourceElement.uid,
      to_uid: event.targetElement.uid,
    },
    description: `Drag from ${event.sourceElement.tagName} to ${event.targetElement.tagName}`,
  };
}

function convertScrollEvent(event: ScrollEvent): McpStep {
  // Use act tool with JavaScript for scrolling
  const script = event.element
    ? `document.querySelector('${event.element.selectors.css}').scrollTo(${event.scrollX}, ${event.scrollY})`
    : `window.scrollTo(${event.scrollX}, ${event.scrollY})`;

  return {
    tool: "act",
    params: { script },
    description: `Scroll to (${event.scrollX}, ${event.scrollY})`,
  };
}

function convertSubmitEvent(event: SubmitEvent): McpStep {
  const fallbackSelectors = buildFallbackSelectors(event.formElement);

  // Submit is typically done by clicking submit button or pressing Enter
  return {
    tool: "press_key",
    params: { key: "Enter" },
    fallbackSelectors,
    description: `Submit form`,
  };
}

function convertTabCreatedEvent(event: TabCreatedEvent): McpStep {
  // When a new tab is created, we need to create a new page in MCP
  // The URL will be navigated to after the tab is created
  return {
    tool: "new_page",
    params: event.pendingUrl ? { url: event.pendingUrl } : {},
    description: event.pendingUrl
      ? `Open new tab and navigate to ${event.pendingUrl}`
      : `Open new tab`,
  };
}

function convertTabActivatedEvent(event: TabActivatedEvent): McpStep {
  // When switching tabs, we need to select the page in MCP
  // The select_page tool expects a page_id which maps to tabId
  return {
    tool: "select_page",
    params: { page_id: event.tabId.toString() },
    description: `Switch to tab (${event.url || "unknown URL"})`,
  };
}

/**
 * Build an array of fallback CSS selectors in priority order
 */
function buildFallbackSelectors(element: ElementInfo): string[] {
  const selectors: string[] = [];

  if (element.selectors.testId) {
    selectors.push(element.selectors.testId);
  }
  if (element.selectors.ariaSelector) {
    selectors.push(element.selectors.ariaSelector);
  }
  if (element.selectors.css) {
    selectors.push(element.selectors.css);
  }
  if (element.selectors.cssPath) {
    selectors.push(element.selectors.cssPath);
  }

  return selectors;
}

/**
 * Build a human-readable description for a click action
 */
function buildClickDescription(element: ElementInfo): string {
  const parts: string[] = ["Click"];

  if (element.computedRole) {
    parts.push(element.computedRole);
  } else {
    parts.push(element.tagName);
  }

  if (element.textContent && element.textContent.length < 30) {
    parts.push(`"${element.textContent}"`);
  } else if (element.ariaLabel) {
    parts.push(`"${element.ariaLabel}"`);
  }

  return parts.join(" ");
}

/**
 * Optimize MCP steps:
 * - Merge consecutive fill operations on the same element
 * - Remove hover events immediately followed by click on same element
 */
function optimizeSteps(steps: McpStep[]): McpStep[] {
  const result: McpStep[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const prev = result[result.length - 1];

    // Merge consecutive fills on same element - keep only the final value
    if (
      step.tool === "fill" &&
      prev?.tool === "fill" &&
      getStepUid(step) === getStepUid(prev) &&
      getStepUid(step) !== undefined
    ) {
      prev.params.value = step.params.value;
      prev.description = step.description;
      continue;
    }

    // Remove hovers immediately followed by clicks on same element
    if (
      step.tool === "click" &&
      prev?.tool === "hover" &&
      getStepUid(step) === getStepUid(prev) &&
      getStepUid(step) !== undefined
    ) {
      result.pop(); // Remove redundant hover
    }

    result.push(step);
  }

  return result;
}

/**
 * Extract UID from step params
 */
function getStepUid(step: McpStep): string | undefined {
  return step.params.uid as string | undefined;
}

/**
 * Generate JSON code for the MCP workflow
 */
export function generateMcpJson(workflow: McpWorkflow): string {
  return JSON.stringify(workflow, null, 2);
}
