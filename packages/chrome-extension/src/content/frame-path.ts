/**
 * Computes a deterministic index-based path from the current frame to the top.
 * Matches Puppeteer's `childFrames()` ordering (DOM order of <iframe> elements).
 *
 * Returns [] for main frame, [0] for the first child iframe,
 * [1, 0] for the first child of the second iframe, etc.
 */
export function computeFramePath(): number[] {
  if (window === window.top) {
    return [];
  }

  const indices: number[] = [];
  let current: Window = window;

  while (current !== current.parent) {
    try {
      const parent = current.parent;
      const frameElement = current.frameElement;

      // Cross-origin: frameElement is null when the parent is a different origin
      if (!frameElement) {
        break;
      }

      // Find our index among sibling iframes in the parent document
      const iframes = parent.document.querySelectorAll("iframe, frame");
      let index = 0;
      let found = false;
      for (const iframe of iframes) {
        if (iframe === frameElement) {
          found = true;
          break;
        }
        index++;
      }

      if (found) {
        indices.unshift(index);
      }

      current = parent;
    } catch {
      // Cross-origin access denied — return partial path
      break;
    }
  }

  return indices;
}
