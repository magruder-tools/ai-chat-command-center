import { detectObservedStatus, OBSERVER_VERSION } from "./observer";
import type { ContentMessage } from "../shared/messages";

const DEBOUNCE_MS = 300;
const HEARTBEAT_MS = 30_000;
const RECONNECT_MS = 1_000;
const INSTANCE_KEY = "__aiChatCommandCenterObserverV4";

interface ObserverController {
  refresh: () => void;
}

type ObserverGlobal = typeof globalThis & Record<string, ObserverController | undefined>;

function createController(): ObserverController {
  let enabled = false;
  let observer: MutationObserver | undefined;
  let debounceTimer: number | undefined;
  let heartbeatTimer: number | undefined;
  let reconnectTimer: number | undefined;
  let lastSignature = "";
  let port: chrome.runtime.Port | undefined;

  function sendStatus(force = false): void {
    if (!enabled || !port) return;
    const result = detectObservedStatus(document);
    const signature = `${result.status}:${result.reason}:${location.href}`;
    if (!force && signature === lastSignature) return;
    lastSignature = signature;
    const message: ContentMessage = {
      type: "OBSERVER_STATUS",
      status: result.status,
      reason: result.reason,
      url: location.href,
      observerVersion: OBSERVER_VERSION
    };
    try {
      port.postMessage(message);
    } catch {
      reconnect();
    }
  }

  function scheduleDetection(): void {
    if (!enabled) return;
    if (debounceTimer) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => sendStatus(), DEBOUNCE_MS);
  }

  function startObserver(): void {
    if (!enabled) return;
    if (!observer) {
      observer = new MutationObserver(scheduleDetection);
      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: [
          "aria-label",
          "aria-hidden",
          "class",
          "data-state",
          "data-stream-active",
          "data-testid",
          "disabled",
          "hidden",
          "style"
        ]
      });
    }
    if (!heartbeatTimer) heartbeatTimer = window.setInterval(() => sendStatus(true), HEARTBEAT_MS);
    sendStatus(true);
  }

  function stopObserver(): void {
    observer?.disconnect();
    observer = undefined;
    if (debounceTimer) window.clearTimeout(debounceTimer);
    if (heartbeatTimer) window.clearInterval(heartbeatTimer);
    debounceTimer = undefined;
    heartbeatTimer = undefined;
    lastSignature = "";
  }

  function setEnabled(nextEnabled: boolean): void {
    enabled = nextEnabled;
    if (enabled) startObserver();
    else stopObserver();
  }

  function reconnect(): void {
    port = undefined;
    stopObserver();
    if (reconnectTimer) return;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = undefined;
      connect();
    }, RECONNECT_MS);
  }

  function connect(): void {
    if (port) return;
    try {
      port = chrome.runtime.connect({ name: "status-observer-v3" });
      port.onMessage.addListener((message: unknown) => {
        if (
          typeof message === "object" &&
          message !== null &&
          "type" in message &&
          message.type === "OBSERVER_CONFIG" &&
          "enabled" in message &&
          typeof message.enabled === "boolean"
        ) {
          setEnabled(message.enabled);
        }
      });
      port.onDisconnect.addListener(reconnect);
    } catch {
      reconnect();
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") sendStatus(true);
  });
  document.addEventListener("resume", () => {
    if (!port) connect();
    sendStatus(true);
  });
  window.addEventListener("pageshow", () => {
    if (!port) connect();
    sendStatus(true);
  });
  window.addEventListener("popstate", () => sendStatus(true));
  window.addEventListener("hashchange", () => sendStatus(true));

  connect();
  return {
    refresh: () => {
      if (!port) connect();
      sendStatus(true);
    }
  };
}

const observerGlobal = globalThis as ObserverGlobal;
if (observerGlobal[INSTANCE_KEY]) observerGlobal[INSTANCE_KEY]?.refresh();
else observerGlobal[INSTANCE_KEY] = createController();
