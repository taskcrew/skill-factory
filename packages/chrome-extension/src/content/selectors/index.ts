import type { DOMRectJSON, ElementInfo, SelectorSet } from "@shared/types";
import {
  type ElementHashInput,
  generateNodeHash,
} from "@shared/utils/node-hash";

/**
 * Mapping of HTML elements/attributes to implicit ARIA roles.
 * Based on WAI-ARIA specification for HTML element mappings.
 * This is used as a fallback since chrome.automation API is only available in ChromeOS.
 */
const IMPLICIT_ROLE_MAP: Record<string, string> = {
  // Interactive elements
  button: "button",
  "a[href]": "link",
  'input[type="button"]': "button",
  'input[type="submit"]': "button",
  'input[type="reset"]': "button",
  'input[type="image"]': "button",
  'input[type="checkbox"]': "checkbox",
  'input[type="radio"]': "radio",
  'input[type="range"]': "slider",
  'input[type="number"]': "spinbutton",
  'input[type="search"]': "searchbox",
  'input[type="email"]': "textbox",
  'input[type="tel"]': "textbox",
  'input[type="url"]': "textbox",
  'input[type="text"]': "textbox",
  'input[type="password"]': "textbox",
  input: "textbox", // Default for input without type
  textarea: "textbox",
  select: "combobox",
  option: "option",
  optgroup: "group",

  // Structure
  article: "article",
  aside: "complementary",
  footer: "contentinfo",
  header: "banner",
  main: "main",
  nav: "navigation",
  section: "region",
  form: "form",

  // Lists
  ul: "list",
  ol: "list",
  li: "listitem",
  dl: "list",
  dt: "term",
  dd: "definition",
  menu: "list",

  // Tables
  table: "table",
  thead: "rowgroup",
  tbody: "rowgroup",
  tfoot: "rowgroup",
  tr: "row",
  th: "columnheader",
  td: "cell",

  // Other semantic elements
  "img[alt]": "img",
  img: "img",
  figure: "figure",
  figcaption: "caption",
  hr: "separator",
  dialog: "dialog",
  details: "group",
  summary: "button",
  progress: "progressbar",
  meter: "meter",
  output: "status",

  // Headings
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
  h5: "heading",
  h6: "heading",
};

export class SelectorGenerator {
  private readonly testIdAttributes = [
    "data-testid",
    "data-test",
    "data-cy",
    "data-qa",
  ];
  private readonly framePath: number[];

  constructor(framePath: number[] = []) {
    this.framePath = framePath;
  }

  /**
   * Generate element info with a stable hash-based UID.
   * The UID uses the same algorithm as the MCP chrome-devtools server
   * so recorded actions can be replayed using the MCP tools.
   */
  async generateElementInfo(element: Element): Promise<ElementInfo> {
    const rect = element.getBoundingClientRect();
    const tagName = element.tagName.toLowerCase();
    const role = this.computeImplicitRole(element);
    const ariaLabel = element.getAttribute("aria-label") || undefined;
    const structuralPath = this.buildStructuralPath(element);

    // Generate hash-based UID using the shared algorithm
    const hashInput: ElementHashInput = {
      tagName,
      id: element.id || undefined,
      name: element.getAttribute("name") || undefined,
      type: element.getAttribute("type") || undefined,
      role,
      ariaLabel,
      structuralPath,
    };
    const uid = await generateNodeHash(hashInput);

    return {
      uid,
      selectors: this.generateSelectorSet(element),
      tagName,
      textContent: this.getTextContent(element),
      attributes: this.getAttributes(element),
      boundingRect: this.rectToJSON(rect),
      isVisible: this.isElementVisible(element),
      computedRole: role,
      ariaLabel,
      ...(this.framePath.length > 0 && {
        framePath: this.framePath,
        frameUrl: window.location.href,
      }),
    };
  }

  /**
   * Synchronous version for cases where async is not possible.
   * Note: UID will not be generated in this version.
   */
  generateElementInfoSync(element: Element): ElementInfo {
    const rect = element.getBoundingClientRect();
    const tagName = element.tagName.toLowerCase();
    const role = this.computeImplicitRole(element);
    const ariaLabel = element.getAttribute("aria-label") || undefined;

    return {
      selectors: this.generateSelectorSet(element),
      tagName,
      textContent: this.getTextContent(element),
      attributes: this.getAttributes(element),
      boundingRect: this.rectToJSON(rect),
      isVisible: this.isElementVisible(element),
      computedRole: role,
      ariaLabel,
    };
  }

  /**
   * Build a structural path for an element using ARIA roles.
   * Format: root>role:siblingIndex>role:siblingIndex
   * This matches the format used by the MCP server's accessibility tree.
   */
  private buildStructuralPath(element: Element): string {
    const parts: string[] = ["root"];

    // Prefix with frame path so UIDs differ between frames
    if (this.framePath.length > 0) {
      parts.push(`frame[${this.framePath.join(",")}]`);
    }

    const ancestors: Element[] = [];

    // Collect ancestors from root to element
    let current: Element | null = element;
    while (current && current !== document.documentElement) {
      ancestors.unshift(current);
      current = current.parentElement;
    }

    // Build path with role:siblingIndex for each level
    for (const el of ancestors) {
      const role = this.computeImplicitRole(el) || el.tagName.toLowerCase();
      const siblingIndex = this.getSiblingIndexByRole(el, role);
      parts.push(`${role}:${siblingIndex}`);
    }

    return parts.join(">");
  }

  /**
   * Get the 0-based index of an element among siblings with the same role.
   */
  private getSiblingIndexByRole(element: Element, role: string): number {
    const parent = element.parentElement;
    if (!parent) {
      return 0;
    }

    let index = 0;
    for (const sibling of parent.children) {
      if (sibling === element) {
        break;
      }
      const siblingRole =
        this.computeImplicitRole(sibling) || sibling.tagName.toLowerCase();
      if (siblingRole === role) {
        index++;
      }
    }
    return index;
  }

  /**
   * Compute the implicit ARIA role for an element based on its tag and attributes.
   * Uses explicit role attribute if present, otherwise derives from HTML semantics.
   */
  private computeImplicitRole(element: Element): string | undefined {
    // Explicit role takes precedence
    const explicitRole = element.getAttribute("role");
    if (explicitRole) {
      return explicitRole;
    }

    const tagName = element.tagName.toLowerCase();

    // Check for attribute-specific roles (most specific first)
    if (tagName === "a" && element.hasAttribute("href")) {
      return "link";
    }
    if (tagName === "img" && element.hasAttribute("alt")) {
      return "img";
    }
    if (tagName === "input") {
      const type = element.getAttribute("type") || "text";
      const inputKey = `input[type="${type}"]`;
      if (inputKey in IMPLICIT_ROLE_MAP) {
        return IMPLICIT_ROLE_MAP[inputKey];
      }
      return IMPLICIT_ROLE_MAP["input"];
    }

    // Check simple tag mapping
    return IMPLICIT_ROLE_MAP[tagName];
  }

  generateSelectorSet(element: Element): SelectorSet {
    return {
      css: this.generateOptimizedCssSelector(element),
      xpath: this.generateXPath(element),
      cssPath: this.generateCssPath(element),
      testId: this.getTestId(element),
      ariaSelector: this.generateAriaSelector(element),
      textSelector: this.generateTextSelector(element),
      pierceSelector: this.generatePierceSelector(element),
    };
  }

  private generateOptimizedCssSelector(element: Element): string {
    // Try ID first
    if (element.id && !this.isDynamicId(element.id)) {
      return `#${CSS.escape(element.id)}`;
    }

    // Try test ID attributes
    const testId = this.getTestId(element);
    if (testId) {
      return testId;
    }

    // Try unique attribute combinations
    const uniqueAttr = this.findUniqueAttribute(element);
    if (uniqueAttr) {
      return uniqueAttr;
    }

    // Fall back to path-based selector
    return this.generateCssPath(element);
  }

  private isDynamicId(id: string): boolean {
    // Detect common dynamic ID patterns
    return (
      /^[a-z]+-[a-f0-9]{5,}$/i.test(id) ||
      /^css-[a-z0-9]+$/i.test(id) ||
      /^:r[0-9a-z]+:$/i.test(id) ||
      /^[0-9]+$/.test(id) ||
      id.startsWith("ember") ||
      id.startsWith("react-")
    );
  }

  private findUniqueAttribute(element: Element): string | null {
    const tagName = element.tagName.toLowerCase();

    // Check for test attributes first
    for (const attr of this.testIdAttributes) {
      const value = element.getAttribute(attr);
      if (value) {
        return `[${attr}="${CSS.escape(value)}"]`;
      }
    }

    // Check semantic attributes
    const semanticAttrs = ["name", "type", "placeholder", "aria-label", "role"];
    for (const attr of semanticAttrs) {
      const value = element.getAttribute(attr);
      if (
        value &&
        this.isUniqueInDocument(
          element,
          `${tagName}[${attr}="${CSS.escape(value)}"]`
        )
      ) {
        return `${tagName}[${attr}="${CSS.escape(value)}"]`;
      }
    }

    return null;
  }

  private isUniqueInDocument(element: Element, selector: string): boolean {
    try {
      const matches = document.querySelectorAll(selector);
      return matches.length === 1 && matches[0] === element;
    } catch {
      return false;
    }
  }

  private generateCssPath(element: Element): string {
    const path: string[] = [];
    let current: Element | null = element;

    while (
      current &&
      current !== document.body &&
      current !== document.documentElement
    ) {
      let selector = current.tagName.toLowerCase();

      if (current.id && !this.isDynamicId(current.id)) {
        selector = `#${CSS.escape(current.id)}`;
        path.unshift(selector);
        break;
      }

      const parentElement: Element | null = current.parentElement;
      if (parentElement) {
        const currentTagName = current.tagName;
        const siblings = Array.from(parentElement.children).filter(
          (child) => child.tagName === currentTagName
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
        current = parentElement;
      } else {
        current = null;
      }

      path.unshift(selector);
    }

    return path.join(" > ");
  }

  private generateXPath(element: Element): string {
    const parts: string[] = [];
    let current: Element | null = element;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let index = 1;
      let sibling: Element | null = current.previousElementSibling;

      while (sibling) {
        if (sibling.tagName === current.tagName) {
          index++;
        }
        sibling = sibling.previousElementSibling;
      }

      const tagName = current.tagName.toLowerCase();
      const part =
        index > 1 || this.hasFollowingSiblingWithSameTag(current)
          ? `${tagName}[${index}]`
          : tagName;
      parts.unshift(part);

      if (current === document.body) {
        break;
      }
      current = current.parentElement;
    }

    return `//${parts.join("/")}`;
  }

  private hasFollowingSiblingWithSameTag(element: Element): boolean {
    let sibling = element.nextElementSibling;
    while (sibling) {
      if (sibling.tagName === element.tagName) {
        return true;
      }
      sibling = sibling.nextElementSibling;
    }
    return false;
  }

  private getTestId(element: Element): string | undefined {
    for (const attr of this.testIdAttributes) {
      const value = element.getAttribute(attr);
      if (value) {
        return `[${attr}="${CSS.escape(value)}"]`;
      }
    }
    return undefined;
  }

  private generateAriaSelector(element: Element): string | undefined {
    const role = element.getAttribute("role");
    const ariaLabel = element.getAttribute("aria-label");
    const name = element.getAttribute("name");

    if (ariaLabel) {
      return role
        ? `[role="${role}"][aria-label="${CSS.escape(ariaLabel)}"]`
        : `[aria-label="${CSS.escape(ariaLabel)}"]`;
    }
    if (role && name) {
      return `[role="${role}"][name="${CSS.escape(name)}"]`;
    }
    return undefined;
  }

  private generateTextSelector(element: Element): string | undefined {
    const text = this.getDirectTextContent(element);
    if (text && text.length > 0 && text.length < 50) {
      const tagName = element.tagName.toLowerCase();
      // Playwright-style text selector
      return `${tagName}:has-text("${text.replace(/"/g, '\\"')}")`;
    }
    return undefined;
  }

  private generatePierceSelector(element: Element): string | undefined {
    // Pierce selectors traverse shadow DOM
    const path: string[] = [];
    let current: Element | null = element;

    while (current) {
      const selector = this.generateOptimizedCssSelector(current);
      path.unshift(selector);

      const root = current.getRootNode();
      if (root instanceof ShadowRoot) {
        current = root.host;
      } else {
        break;
      }
    }

    return path.length > 1 ? path.join(" >>> ") : undefined;
  }

  private getTextContent(element: Element): string | undefined {
    const text = element.textContent?.trim();
    return text && text.length < 200 ? text : undefined;
  }

  private getDirectTextContent(element: Element): string {
    let text = "";
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      }
    }
    return text.trim();
  }

  private getAttributes(element: Element): Record<string, string> {
    const attrs: Record<string, string> = {};
    for (const attr of element.attributes) {
      // Skip event handlers and large data attributes
      if (!attr.name.startsWith("on") && attr.value.length < 200) {
        attrs[attr.name] = attr.value;
      }
    }
    return attrs;
  }

  private isElementVisible(element: Element): boolean {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0" &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  private rectToJSON(rect: DOMRect): DOMRectJSON {
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left,
    };
  }
}

// Singleton instance for use across content script
export const selectorGenerator = new SelectorGenerator();
