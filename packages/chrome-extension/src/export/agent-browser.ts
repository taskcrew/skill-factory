/**
 * Agent Browser CLI Script Converter
 *
 * Converts recorded browser events into agent-browser CLI commands
 * that can be executed sequentially to replay the workflow.
 *
 * Uses semantic locators (find command) as primary targeting,
 * with CSS selector fallbacks.
 */

import type {
  ClickEvent,
  DragDropEvent,
  ElementInfo,
  HoverEvent,
  InputEvent,
  KeyboardEvent,
  NavigationEvent,
  RecordedEvent,
  RecordingSession,
  ScrollEvent,
  SubmitEvent,
  TabActivatedEvent,
  TabCreatedEvent,
} from "@shared/types";

export interface AgentBrowserStep {
  /** The CLI command (without "agent-browser" prefix) */
  command: string;
  /** Human-readable comment for the script */
  comment?: string;
  /** Whether this step triggers a page navigation (needs wait + re-snapshot) */
  causesNavigation?: boolean;
}

export interface AgentBrowserScript {
  /** Name of the skill/workflow */
  name: string;
  /** Starting URL */
  startUrl: string;
  /** Recorded date */
  recordedAt: string;
  /** Sequence of CLI commands */
  steps: AgentBrowserStep[];
}

/**
 * Convert a recording session to an agent-browser CLI script
 */
export function convertToAgentBrowser(
  session: RecordingSession
): AgentBrowserScript {
  const steps: AgentBrowserStep[] = [];
  let needsSnapshot = true;

  // Add initial navigation
  if (session.metadata.startUrl) {
    steps.push({
      command: `open "${session.metadata.startUrl}"`,
      comment: "Navigate to starting page",
      causesNavigation: true,
    });
    steps.push({
      command: "wait --load networkidle",
    });
    needsSnapshot = true;
  }

  // Convert each event
  for (const event of session.events) {
    // Skip screenshot and snapshot events
    if (event.type === "screenshot" || event.type === "domSnapshot") {
      continue;
    }

    const step = convertEventToStep(event);
    if (!step) continue;

    // Insert snapshot before first interaction on a new page
    if (needsSnapshot && isInteractionStep(step)) {
      steps.push({
        command: "snapshot -i",
        comment: "Discover interactive elements",
      });
      needsSnapshot = false;
    }

    // Add frame context to comment
    if (event.framePath && event.framePath.length > 0 && step.comment) {
      step.comment += ` (in iframe [${event.framePath.join(",")}])`;
    }

    steps.push(step);

    // After navigation-triggering actions, add wait + re-snapshot
    if (step.causesNavigation) {
      steps.push({ command: "wait --load networkidle" });
      needsSnapshot = true;
    }
  }

  const optimized = optimizeSteps(steps);

  return {
    name: session.name,
    startUrl: session.metadata.startUrl,
    recordedAt: new Date(session.startTime).toISOString().split("T")[0],
    steps: optimized,
  };
}

/**
 * Check if a step is an interaction (needs a snapshot first)
 */
function isInteractionStep(step: AgentBrowserStep): boolean {
  const cmd = step.command;
  return (
    cmd.startsWith("click") ||
    cmd.startsWith("double-click") ||
    cmd.startsWith("fill") ||
    cmd.startsWith("hover") ||
    cmd.startsWith("find")
  );
}

/**
 * Convert a single recorded event to an agent-browser CLI step
 */
function convertEventToStep(event: RecordedEvent): AgentBrowserStep | null {
  switch (event.type) {
    case "click":
      return convertClick(event as ClickEvent);
    case "doubleClick":
      return convertDoubleClick(event as ClickEvent);
    case "rightClick":
      return convertRightClick(event as ClickEvent);
    case "input":
    case "change":
      return convertInput(event as InputEvent);
    case "navigate":
      return convertNavigation(event as NavigationEvent);
    case "keyDown":
      return convertKeyboard(event as KeyboardEvent);
    case "hover":
      return convertHover(event as HoverEvent);
    case "drop":
      return convertDrop(event as DragDropEvent);
    case "scroll":
      return convertScroll(event as ScrollEvent);
    case "submit":
      return convertSubmit(event as SubmitEvent);
    case "tabCreated":
      return convertTabCreated(event as TabCreatedEvent);
    case "tabActivated":
      return convertTabActivated(event as TabActivatedEvent);
    case "dragStart":
    case "tabClosed":
      return null;
    default:
      return null;
  }
}

// --- Event converters ---

function convertClick(event: ClickEvent): AgentBrowserStep {
  const locator = buildLocator(event.element);
  return {
    command: `${locator.prefix}click${locator.suffix}`,
    comment: buildClickDescription(event.element),
  };
}

function convertDoubleClick(event: ClickEvent): AgentBrowserStep {
  const locator = buildLocator(event.element);
  return {
    command: `${locator.prefix}double-click${locator.suffix}`,
    comment: `Double-click ${event.element.tagName}`,
  };
}

function convertRightClick(event: ClickEvent): AgentBrowserStep {
  const locator = buildLocator(event.element);
  return {
    command: `${locator.prefix}click${locator.suffix} --button right`,
    comment: `Right-click ${event.element.tagName}`,
  };
}

function convertInput(event: InputEvent): AgentBrowserStep {
  const locator = buildLocator(event.element);
  const value = event.isPassword ? "********" : escapeShell(event.value);
  return {
    command: `${locator.prefix}fill${locator.suffix} "${value}"`,
    comment: `Fill ${event.element.tagName}${event.isPassword ? " (password)" : ""}`,
  };
}

function convertNavigation(event: NavigationEvent): AgentBrowserStep | null {
  if (!event.toUrl) return null;
  return {
    command: `open "${event.toUrl}"`,
    comment: `Navigate to ${event.toUrl}`,
    causesNavigation: true,
  };
}

function convertKeyboard(event: KeyboardEvent): AgentBrowserStep {
  const parts: string[] = [];
  if (event.modifiers.ctrlKey) parts.push("Control");
  if (event.modifiers.metaKey) parts.push("Meta");
  if (event.modifiers.altKey) parts.push("Alt");
  if (event.modifiers.shiftKey) parts.push("Shift");
  parts.push(event.key);
  const keyCombo = parts.join("+");

  return {
    command: `press ${keyCombo}`,
    comment: `Press ${keyCombo}`,
  };
}

function convertHover(event: HoverEvent): AgentBrowserStep {
  const locator = buildLocator(event.element);
  return {
    command: `${locator.prefix}hover${locator.suffix}`,
    comment: buildHoverDescription(event.element),
  };
}

function convertDrop(event: DragDropEvent): AgentBrowserStep | null {
  if (!event.sourceElement || !event.targetElement) return null;
  const from = buildLocator(event.sourceElement);
  const to = buildLocator(event.targetElement);
  return {
    command: `drag ${from.prefix ? from.suffix.trim() : "@source"} ${to.prefix ? to.suffix.trim() : "@target"}`,
    comment: `Drag from ${event.sourceElement.tagName} to ${event.targetElement.tagName}`,
  };
}

function convertScroll(event: ScrollEvent): AgentBrowserStep {
  const deltaY = event.deltaY ?? event.scrollY;
  const direction = deltaY > 0 ? "down" : "up";
  const amount = Math.abs(deltaY);

  if (event.element) {
    return {
      command: `scroll ${direction} ${amount} --selector "${event.element.selectors.css}"`,
      comment: `Scroll ${direction} ${amount}px in ${event.element.tagName}`,
    };
  }

  return {
    command: `scroll ${direction} ${amount}`,
    comment: `Scroll ${direction} ${amount}px`,
  };
}

function convertSubmit(_event: SubmitEvent): AgentBrowserStep {
  return {
    command: "press Enter",
    comment: "Submit form",
    causesNavigation: true,
  };
}

function convertTabCreated(event: TabCreatedEvent): AgentBrowserStep {
  if (event.pendingUrl) {
    return {
      command: `tab new "${event.pendingUrl}"`,
      comment: `Open new tab: ${event.pendingUrl}`,
      causesNavigation: true,
    };
  }
  return {
    command: "tab new",
    comment: "Open new tab",
  };
}

function convertTabActivated(event: TabActivatedEvent): AgentBrowserStep {
  return {
    command: `tab switch ${event.tabId}`,
    comment: `Switch to tab${event.url ? ` (${event.url})` : ""}`,
  };
}

// --- Locator building ---

interface Locator {
  /** Prefix before the command (e.g., "find role button " for semantic locators) */
  prefix: string;
  /** Suffix after the command (e.g., " --name 'Submit'" or " @e1") */
  suffix: string;
}

/**
 * Build the best locator for an element.
 * Priority: testId > ariaSelector > role+name > css
 */
function buildLocator(element: ElementInfo): Locator {
  // Best: test-id based (most stable across deployments)
  if (element.selectors.testId) {
    return {
      prefix: `find testid "${element.selectors.testId}" `,
      suffix: "",
    };
  }

  // Good: role + name (semantic, readable)
  if (element.computedRole && element.ariaLabel) {
    return {
      prefix: `find role ${element.computedRole} `,
      suffix: ` --name "${escapeShell(element.ariaLabel)}"`,
    };
  }

  if (element.computedRole && element.textContent && element.textContent.length < 40) {
    return {
      prefix: `find role ${element.computedRole} `,
      suffix: ` --name "${escapeShell(element.textContent)}"`,
    };
  }

  // OK: text-based locator
  if (element.selectors.textSelector) {
    return {
      prefix: `find text "${escapeShell(element.selectors.textSelector)}" `,
      suffix: "",
    };
  }

  // Fallback: CSS selector
  const css = element.selectors.testId || element.selectors.css;
  return {
    prefix: `find css "${css}" `,
    suffix: "",
  };
}

// --- Helpers ---

function escapeShell(str: string): string {
  return str.replace(/"/g, '\\"').replace(/\$/g, "\\$");
}

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

function buildHoverDescription(element: ElementInfo): string {
  const parts: string[] = ["Hover over"];
  if (element.computedRole) {
    parts.push(element.computedRole);
  } else {
    parts.push(element.tagName);
  }
  if (element.textContent) {
    const trimmed = element.textContent.trim();
    if (trimmed.length > 0 && trimmed.length < 50) {
      parts.push(`"${trimmed}"`);
    }
  } else if (element.ariaLabel) {
    parts.push(`"${element.ariaLabel}"`);
  }
  return parts.join(" ");
}

// --- Optimizer ---

/**
 * Optimize steps:
 * - Merge consecutive fills on same element (keep last value)
 * - Remove hovers immediately followed by click on same element
 */
function optimizeSteps(steps: AgentBrowserStep[]): AgentBrowserStep[] {
  const result: AgentBrowserStep[] = [];

  for (const step of steps) {
    const prev = result[result.length - 1];

    // Merge consecutive fills on same element
    if (
      prev &&
      isFillCommand(step.command) &&
      isFillCommand(prev.command) &&
      getFillTarget(step.command) === getFillTarget(prev.command)
    ) {
      prev.command = step.command;
      prev.comment = step.comment;
      continue;
    }

    // Remove hover immediately followed by click on same element
    if (
      prev &&
      isClickCommand(step.command) &&
      isHoverCommand(prev.command) &&
      getCommandTarget(step.command) === getCommandTarget(prev.command)
    ) {
      result.pop();
    }

    result.push(step);
  }

  return result;
}

function isFillCommand(cmd: string): boolean {
  return cmd.includes("fill");
}

function isClickCommand(cmd: string): boolean {
  return cmd.includes("click") && !cmd.includes("double-click");
}

function isHoverCommand(cmd: string): boolean {
  return cmd.includes("hover");
}

function getFillTarget(cmd: string): string {
  // Extract the locator part before "fill"
  const match = cmd.match(/^(find .+? )fill/);
  return match ? match[1] : cmd;
}

function getCommandTarget(cmd: string): string {
  // Extract the locator part (find ... action)
  const match = cmd.match(/^(find .+? )(click|hover|fill)/);
  return match ? match[1] : cmd;
}

/**
 * Generate a bash script from the agent-browser workflow
 */
export function generateAgentBrowserScript(script: AgentBrowserScript): string {
  const lines: string[] = [
    "#!/bin/bash",
    `# Skill: ${script.name}`,
    `# Recorded: ${script.recordedAt}`,
    `# Source URL: ${script.startUrl}`,
    "",
  ];

  let stepNum = 0;
  for (const step of script.steps) {
    if (step.comment) {
      stepNum++;
      lines.push(`# Step ${stepNum}: ${step.comment}`);
    }
    lines.push(`agent-browser ${step.command}`);
    lines.push("");
  }

  return lines.join("\n");
}
