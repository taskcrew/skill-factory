/**
 * Node Hash Utilities
 *
 * Generate stable, content-derived hash IDs for DOM elements.
 * These IDs remain consistent across snapshots for the same element.
 *
 * IMPORTANT: This module MUST match the algorithm used in:
 * - packages/shared/src/browser/node-hash.ts
 * - mcp-server/src/integrations/chrome-devtools/utils/node-hash.ts
 *
 * The hash is derived from element properties and structural position
 * to ensure UIDs are stable across page reloads and can be used
 * to replay recorded actions via MCP chrome-devtools tools.
 */

/**
 * Input data for generating a node hash
 */
export interface ElementHashInput {
  tagName: string;
  id?: string;
  name?: string;
  type?: string;
  role?: string;
  ariaLabel?: string;
  structuralPath: string;
}

/**
 * Generate a stable hash-based ID for an element
 *
 * The hash is derived from:
 * - Element tag name
 * - Key attributes (id, name, type, role, aria-label)
 * - Structural position in DOM (parent chain with sibling indices)
 *
 * @param info - Element properties to hash
 * @returns Hash ID in format "$a1b2c3d4" (8 hex chars)
 */
export async function generateNodeHash(
  info: ElementHashInput
): Promise<string> {
  const input = [
    info.tagName,
    info.id || "",
    info.name || "",
    info.type || "",
    info.role || "",
    info.ariaLabel || "",
    info.structuralPath,
  ].join("|");

  const hash = await sha256(input);
  return `$${hash.slice(0, 8)}`;
}

/**
 * SHA-256 hash function using the Web Crypto API
 */
async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
