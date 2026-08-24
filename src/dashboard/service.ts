import { archiveChat, restoreChat, snoozeChat, workflowSection } from "../shared/model";
import type { DashboardRequest, MessageResponse } from "../shared/messages";
import { demoSnapshot } from "../shared/demo";
import { normalizeTrackedChat } from "../shared/platforms";
import type { AppSnapshot, ImportPayload, TrackedChat } from "../shared/types";

const demoMode = new URLSearchParams(location.search).has("demo") || !globalThis.chrome?.runtime?.id;
let demoState = structuredClone(demoSnapshot);
const demoListeners = new Set<() => void>();

function emitDemo(): void {
  for (const listener of demoListeners) listener();
}

function updateDemoChat(chatId: string, transform: (chat: TrackedChat) => TrackedChat): void {
  demoState.chats = demoState.chats.map((chat) => (chat.id === chatId ? transform(chat) : chat));
  emitDemo();
}

async function demoRequest<T>(request: DashboardRequest): Promise<T> {
  switch (request.type) {
    case "GET_STATE":
      return structuredClone(demoState) as T;
    case "SET_CHAT_FIELDS":
      updateDemoChat(request.chatId, (chat) => ({ ...chat, ...request.patch, updatedAt: Date.now() }));
      break;
    case "SNOOZE_CHAT":
      updateDemoChat(request.chatId, (chat) => snoozeChat(chat, request.until));
      break;
    case "ARCHIVE_CHAT":
      updateDemoChat(request.chatId, (chat) => archiveChat(chat));
      break;
    case "RESTORE_CHAT":
      updateDemoChat(request.chatId, (chat) => restoreChat(chat));
      break;
    case "RETURN_TO_TRACKED_CHAT":
      if (demoState.runtimes[request.chatId]) {
        demoState.runtimes[request.chatId] = { ...demoState.runtimes[request.chatId], connected: true, status: "ready", reason: "composer-available" };
        emitDemo();
      }
      break;
    case "REOPEN_ALL":
      for (const chat of demoState.chats.filter((item) => item.disposition !== "archived")) {
        demoState.runtimes[chat.id] = { chatId: chat.id, connected: true, openOnDevice: true, status: "ready", reason: "composer-available" };
      }
      emitDemo();
      break;
    case "REGISTER_PROJECT": {
      const key = request.url.split("/").find((part) => part.startsWith("g-p-")) || `g-p-${Date.now()}`;
      demoState.projects.push({ key, name: request.name, url: request.url, updatedAt: Date.now() });
      emitDemo();
      break;
    }
    case "SET_OBSERVER_ENABLED":
      demoState.preferences = { observerEnabled: request.enabled, hasSeenSafetyNotice: true };
      emitDemo();
      break;
    case "SET_FULLSCREEN":
      demoState.isFullscreen = request.enabled;
      emitDemo();
      break;
    case "EXPORT_DATA":
      return {
        schemaVersion: 2,
        exportedAt: new Date().toISOString(),
        chats: demoState.chats,
        projects: demoState.projects,
        preferences: demoState.preferences
      } as T;
    case "IMPORT_DATA":
      demoState = {
        ...demoState,
        ...request.payload,
        chats: request.payload.chats.map(normalizeTrackedChat).filter((chat): chat is TrackedChat => Boolean(chat)),
        runtimes: {},
        candidateTab: undefined
      };
      emitDemo();
      break;
    case "CLEAR_APP_DATA":
      demoState = { ...demoState, chats: [], projects: [], runtimes: {}, candidateTab: undefined };
      emitDemo();
      break;
    case "DISMISS_CANDIDATE":
      demoState.candidateTab = undefined;
      emitDemo();
      break;
    case "NEW_CHAT":
    case "TRACK_TAB":
    case "TRACK_CANDIDATE":
    case "OPEN_CHAT":
    case "REOPEN_CHAT":
      break;
  }
  return undefined as T;
}

export async function sendRequest<T = void>(request: DashboardRequest): Promise<T> {
  if (demoMode) return demoRequest<T>(request);
  const response = await chrome.runtime.sendMessage(request) as MessageResponse<T>;
  if (!response?.ok) throw new Error(response?.error || "The extension did not respond.");
  return response.data as T;
}

export function subscribeToState(listener: () => void): () => void {
  if (demoMode) {
    demoListeners.add(listener);
    return () => demoListeners.delete(listener);
  }
  const messageListener = (message: unknown) => {
    if (typeof message === "object" && message !== null && "type" in message && message.type === "STATE_UPDATED") listener();
  };
  chrome.runtime.onMessage.addListener(messageListener);
  return () => chrome.runtime.onMessage.removeListener(messageListener);
}

export const dashboardActions = {
  getState: () => sendRequest<AppSnapshot>({ type: "GET_STATE" }),
  newChat: (platform: "chatgpt" | "claude", projectKey?: string) => sendRequest({ type: "NEW_CHAT", platform, projectKey }),
  trackCandidate: (projectKey?: string, projectName?: string) =>
    sendRequest({ type: "TRACK_CANDIDATE", projectKey, projectName }),
  trackTab: (tabId: number, projectKey?: string, projectName?: string) =>
    sendRequest({ type: "TRACK_TAB", tabId, projectKey, projectName }),
  dismissCandidate: () => sendRequest({ type: "DISMISS_CANDIDATE" }),
  open: (chatId: string) => sendRequest({ type: "OPEN_CHAT", chatId }),
  reopen: (chatId: string) => sendRequest({ type: "REOPEN_CHAT", chatId }),
  setFields: (chatId: string, patch: Extract<DashboardRequest, { type: "SET_CHAT_FIELDS" }>["patch"]) =>
    sendRequest({ type: "SET_CHAT_FIELDS", chatId, patch }),
  returnToTrackedChat: (chatId: string) => sendRequest({ type: "RETURN_TO_TRACKED_CHAT", chatId }),
  reopenAll: () => sendRequest({ type: "REOPEN_ALL" }),
  registerProject: (name: string, url: string) => sendRequest({ type: "REGISTER_PROJECT", name, url }),
  snooze: (chatId: string, until: number) => sendRequest({ type: "SNOOZE_CHAT", chatId, until }),
  archive: (chatId: string) => sendRequest({ type: "ARCHIVE_CHAT", chatId }),
  restore: (chatId: string) => sendRequest({ type: "RESTORE_CHAT", chatId }),
  setObserver: (enabled: boolean) => sendRequest({ type: "SET_OBSERVER_ENABLED", enabled }),
  setFullscreen: (enabled: boolean) => sendRequest({ type: "SET_FULLSCREEN", enabled }),
  exportData: () => sendRequest<ImportPayload>({ type: "EXPORT_DATA" }),
  importData: (payload: ImportPayload) => sendRequest({ type: "IMPORT_DATA", payload }),
  clearData: () => sendRequest({ type: "CLEAR_APP_DATA" }),
  listReadyChats: (snapshot: AppSnapshot) => snapshot.chats.filter((chat) => workflowSection(chat, snapshot.runtimes[chat.id]) === "ready")
};
