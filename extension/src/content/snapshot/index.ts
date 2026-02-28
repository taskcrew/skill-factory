import type { DomSnapshotEvent, RecordedEventType } from "@shared/types";
import { MessageType } from "@shared/types/messages";
import {
  type ElementHashInput,
  generateNodeHash,
} from "@shared/utils/node-hash";

/**
 * Implicit ARIA role mappings for HTML elements
 */
const IMPLICIT_ROLES: Record<string, string> = {
  button: "button",
  a: "link",
  input: "textbox",
  textarea: "textbox",
  select: "combobox",
  option: "option",
  img: "img",
  nav: "navigation",
  main: "main",
  header: "banner",
  footer: "contentinfo",
  aside: "complementary",
  form: "form",
  article: "article",
  section: "region",
  ul: "list",
  ol: "list",
  li: "listitem",
  table: "table",
  tr: "row",
  th: "columnheader",
  td: "cell",
  dialog: "dialog",
  iframe: "iframe",
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
  h5: "heading",
  h6: "heading",
};

/**
 * Input type to role mapping
 */
const INPUT_TYPE_ROLES: Record<string, string> = {
  checkbox: "checkbox",
  radio: "radio",
  range: "slider",
  button: "button",
  submit: "button",
  reset: "button",
  search: "searchbox",
};

/**
 * Roles to skip (noise)
 */
const SKIP_ROLES = new Set(["generic", "none", "presentation"]);

/**
 * Interactive roles that should always be included
 */
const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "textbox",
  "searchbox",
  "checkbox",
  "radio",
  "combobox",
  "listbox",
  "option",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "treeitem",
]);

export class DomSnapshotter {
  /**
   * Capture an accessibility tree snapshot in MCP-compatible format.
   * Output format matches take_snapshot from MCP chrome-devtools:
   *
   * uid=$a1b2c3d4 button "Submit"
   *   uid=$b2c3d4e5 textbox "Email" value="user@example.com"
   */
  async captureAccessibilitySnapshot(): Promise<string> {
    const lines: string[] = [];
    await this.walkElement(document.body, 0, lines, []);
    return lines.join("\n");
  }

  /**
   * Legacy full DOM snapshot (JSON format)
   */
  captureFullSnapshot(): string {
    return this.serializeNodeLegacy(document.documentElement);
  }

  async captureAndSend(
    trigger: DomSnapshotEvent["trigger"],
    framePath: number[] = []
  ): Promise<void> {
    // Only the main frame captures snapshots (it walks into same-origin iframes).
    // Check window.top directly because cross-origin iframes return framePath=[]
    // (frameElement is null cross-origin, so computeFramePath falls through).
    if (window !== window.top) {
      return;
    }

    // Use accessibility tree format for better MCP compatibility
    const snapshot = await this.captureAccessibilitySnapshot();

    const event: DomSnapshotEvent = {
      id: crypto.randomUUID(),
      type: "domSnapshot" as RecordedEventType.DomSnapshot,
      timestamp: Date.now(),
      url: window.location.href,
      tabId: 0,
      snapshot,
      trigger,
    };

    try {
      await chrome.runtime.sendMessage({
        type: MessageType.RecordEvent,
        event,
      });
    } catch {
      // Ignore errors if background is not ready
    }
  }

  /**
   * Walk the DOM tree and build accessibility tree representation
   */
  private async walkElement(
    element: Element,
    depth: number,
    lines: string[],
    pathParts: string[]
  ): Promise<void> {
    // Skip non-semantic elements
    const tagName = element.tagName.toLowerCase();
    if (this.shouldSkipElement(element)) {
      // Still process children (sequential walk required for ordered output)
      for (const child of element.children) {
        // eslint-disable-next-line no-await-in-loop
        await this.walkElement(child, depth, lines, pathParts);
      }
      return;
    }

    const role = this.getRole(element);

    // Skip noise roles but process children
    if (SKIP_ROLES.has(role)) {
      for (const child of element.children) {
        // eslint-disable-next-line no-await-in-loop
        await this.walkElement(child, depth, lines, pathParts);
      }
      return;
    }

    // Build structural path for UID generation
    const siblingIndex = this.getSiblingIndex(element, role);
    const newPathParts = [...pathParts, `${role}:${siblingIndex}`];
    const structuralPath = `root>${newPathParts.join(">")}`;

    // Generate UID
    const hashInput: ElementHashInput = {
      tagName,
      id: element.id || undefined,
      name: element.getAttribute("name") || undefined,
      type: element.getAttribute("type") || undefined,
      role,
      ariaLabel: element.getAttribute("aria-label") || undefined,
      structuralPath,
    };
    const uid = await generateNodeHash(hashInput);

    // Build the line
    const indent = "  ".repeat(depth);
    const attrs = this.getNodeAttributes(element, uid, role);

    // Only add if it's interactive or has meaningful content
    const isInteractive = INTERACTIVE_ROLES.has(role);
    const name = this.getAccessibleName(element);

    if (isInteractive || name || element.children.length === 0) {
      lines.push(`${indent}${attrs.join(" ")}`);
    }

    // Walk into same-origin iframes
    if (tagName === "iframe" || tagName === "frame") {
      const frameEl = element as HTMLIFrameElement;
      try {
        const innerDoc = frameEl.contentDocument;
        if (innerDoc?.body) {
          const frameUrl = frameEl.src || frameEl.contentWindow?.location.href;
          lines.push(
            `${"  ".repeat(depth + 1)}--- iframe: ${frameUrl || "about:blank"} ---`
          );

          await this.walkElement(innerDoc.body, depth + 1, lines, newPathParts);
        }
      } catch {
        // Cross-origin — can't access contentDocument
        const frameUrl = frameEl.src || "";
        lines.push(
          `${"  ".repeat(depth + 1)}[cross-origin iframe: ${frameUrl}]`
        );
      }
      return;
    }

    // Process children (sequential walk required for ordered output)
    for (const child of element.children) {
      // eslint-disable-next-line no-await-in-loop
      await this.walkElement(child, depth + 1, lines, newPathParts);
    }
  }

  /**
   * Get ARIA role for an element
   */
  private getRole(element: Element): string {
    // Explicit role
    const explicitRole = element.getAttribute("role");
    if (explicitRole) {
      return explicitRole;
    }

    const tagName = element.tagName.toLowerCase();

    // Input type-specific roles
    if (tagName === "input") {
      const type = element.getAttribute("type") || "text";
      return INPUT_TYPE_ROLES[type] || "textbox";
    }

    // Link requires href
    if (tagName === "a") {
      return element.hasAttribute("href") ? "link" : "generic";
    }

    return IMPLICIT_ROLES[tagName] || "generic";
  }

  /**
   * Get sibling index by role
   */
  private getSiblingIndex(element: Element, role: string): number {
    const parent = element.parentElement;
    if (!parent) {
      return 0;
    }

    let index = 0;
    for (const sibling of parent.children) {
      if (sibling === element) {
        break;
      }
      if (this.getRole(sibling) === role) {
        index++;
      }
    }
    return index;
  }

  /**
   * Get accessible name for an element
   */
  private getAccessibleName(element: Element): string {
    // aria-label
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel) {
      return ariaLabel;
    }

    // aria-labelledby
    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      const labelEl = document.getElementById(labelledBy);
      if (labelEl) {
        return labelEl.textContent?.trim() || "";
      }
    }

    // Input: associated label
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement
    ) {
      const id = element.id;
      if (id) {
        const label = document.querySelector(`label[for="${id}"]`);
        if (label) {
          return label.textContent?.trim() || "";
        }
      }
      // Placeholder
      const placeholder = element.getAttribute("placeholder");
      if (placeholder) {
        return placeholder;
      }
    }

    // Button/link: text content
    const tagName = element.tagName.toLowerCase();
    if (tagName === "button" || tagName === "a") {
      return element.textContent?.trim() || "";
    }

    // Image: alt text
    if (tagName === "img") {
      return element.getAttribute("alt") || "";
    }

    return "";
  }

  /**
   * Build attributes array for a node (MCP format)
   */
  private getNodeAttributes(
    element: Element,
    uid: string,
    role: string
  ): string[] {
    const attrs: string[] = [`uid=${uid}`, role];

    // Name
    const name = this.getAccessibleName(element);
    if (name) {
      attrs.push(`"${name.substring(0, 100)}"`);
    }

    // HTML attributes
    const id = element.id;
    if (id) {
      attrs.push(`id="${id}"`);
    }

    const htmlName = element.getAttribute("name");
    if (htmlName) {
      attrs.push(`name="${htmlName}"`);
    }

    const type = element.getAttribute("type");
    if (type) {
      attrs.push(`type="${type}"`);
    }

    const placeholder = element.getAttribute("placeholder");
    if (placeholder) {
      attrs.push(`placeholder="${placeholder}"`);
    }

    // Value for inputs
    if (element instanceof HTMLInputElement) {
      if (element.type === "password") {
        attrs.push('value="********"');
      } else if (element.type !== "file" && element.value) {
        attrs.push(`value="${element.value.substring(0, 100)}"`);
      }
      if (element.checked) {
        attrs.push("checked");
      }
    } else if (element instanceof HTMLTextAreaElement && element.value) {
      attrs.push(`value="${element.value.substring(0, 100)}"`);
    } else if (element instanceof HTMLSelectElement && element.value) {
      attrs.push(`value="${element.value}"`);
    }

    // State attributes
    if (element.hasAttribute("disabled")) {
      attrs.push("disabled");
    }
    if (element.hasAttribute("required")) {
      attrs.push("required");
    }
    if (element.hasAttribute("readonly")) {
      attrs.push("readonly");
    }

    // Visibility
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") {
      attrs.push("[hidden]");
    }

    return attrs;
  }

  private shouldSkipElement(element: Element): boolean {
    const tagName = element.tagName.toLowerCase();
    return (
      tagName === "script" ||
      tagName === "style" ||
      tagName === "noscript" ||
      tagName === "svg"
    );
  }

  /**
   * Legacy serialization (kept for backwards compatibility)
   */
  private serializeNodeLegacy(node: Node): string {
    interface SerializedNode {
      type: string;
      tagName?: string;
      attributes?: Record<string, string>;
      textContent?: string;
      children?: SerializedNode[];
    }

    const serialize = (n: Node): SerializedNode | null => {
      if (n.nodeType === Node.ELEMENT_NODE) {
        const el = n as Element;
        const tagName = el.tagName.toLowerCase();
        if (tagName === "script" || tagName === "style") {
          return null;
        }

        const attributes: Record<string, string> = {};
        for (const attr of el.attributes) {
          if (!attr.name.startsWith("on") && attr.value.length < 1000) {
            attributes[attr.name] = attr.value;
          }
        }

        const children: SerializedNode[] = [];
        for (const child of el.childNodes) {
          const serialized = serialize(child);
          if (serialized) {
            children.push(serialized);
          }
        }

        return {
          type: "element",
          tagName,
          attributes:
            Object.keys(attributes).length > 0 ? attributes : undefined,
          children: children.length > 0 ? children : undefined,
        };
      }

      if (n.nodeType === Node.TEXT_NODE) {
        const text = n.textContent?.trim();
        if (!text) {
          return null;
        }
        return { type: "text", textContent: text };
      }

      return null;
    };

    const result = serialize(node);
    return JSON.stringify(result);
  }
}

// Singleton instance
export const domSnapshotter = new DomSnapshotter();
