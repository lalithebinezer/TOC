/**
 * DOM Utility Helpers
 */

/**
 * Safely fetches a required DOM element by ID, throwing a descriptive error if missing.
 */
export function getEl<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Critical: Missing element #${id} in HTML`);
  }
  return el as T;
}

/**
 * Query an element with type casting.
 */
export function queryEl<T extends HTMLElement = HTMLElement>(selector: string, parent: ParentNode = document): T | null {
  return parent.querySelector<T>(selector);
}
