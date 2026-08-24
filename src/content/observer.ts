import type { ObservedStatus } from "../shared/types";

export const OBSERVER_VERSION = 3 as const;

const WORKING_SELECTORS = [
  "[data-scroll-root][data-stream-active]",
  "button[data-testid='stop-button']",
  "button[aria-label='Stop streaming']",
  "button[aria-label='Stop generating']",
  "button[aria-label='Stop response']",
  "button[aria-label='Stop task']",
  "[data-testid='work-task-running']",
  "button[aria-label='Stop response']",
  "button[data-testid='stop-response']",
  "button[data-testid='chat-input-stop']",
  "[data-is-streaming='true']"
] as const;

const READY_LANDMARK_SELECTORS = [
  "#prompt-textarea",
  "textarea[data-testid='prompt-textarea']",
  "[contenteditable='true'][data-testid='prompt-textarea']",
  "form[data-type='unified-composer']",
  "[contenteditable='true'][data-testid='chat-input']",
  "[aria-label='Write your prompt to Claude']",
  "button[data-testid='chat-input-send']"
] as const;

export interface DetectionResult {
  status: ObservedStatus;
  reason: string;
}

function isVisible(element: Element): boolean {
  if (!(element instanceof HTMLElement)) return false;
  if (element.hidden || element.getAttribute("aria-hidden") === "true") return false;
  const style = globalThis.getComputedStyle?.(element);
  return !style || (style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0");
}

function findVisible(root: ParentNode, selectors: readonly string[]): Element | undefined {
  for (const selector of selectors) {
    const candidates = root.querySelectorAll(selector);
    for (const candidate of candidates) {
      if (isVisible(candidate)) return candidate;
    }
  }
  return undefined;
}

export function detectObservedStatus(root: ParentNode = document): DetectionResult {
  if (findVisible(root, WORKING_SELECTORS)) {
    return { status: "working", reason: "visible-running-control" };
  }
  if (findVisible(root, READY_LANDMARK_SELECTORS)) {
    return { status: "ready", reason: "composer-available" };
  }
  return { status: "unknown", reason: "expected-landmarks-absent" };
}
