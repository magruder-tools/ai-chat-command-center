import type {
  ChatRuntime,
  DashboardFilters,
  ObservedStatus,
  TrackedChat,
  WorkflowSection
} from "./types";

export function effectiveObservedStatus(chat: TrackedChat, runtime?: ChatRuntime): ObservedStatus {
  if (!runtime?.openOnDevice) return "unknown";
  if (runtime.status === "ready") return "ready";
  if (!runtime.connected) return "unknown";
  return runtime.status;
}

export function runtimeWithFreshness(runtime: ChatRuntime, now: number, staleAfterMs: number): ChatRuntime {
  if (!runtime.connected || !runtime.lastSeenAt || now - runtime.lastSeenAt <= staleAfterMs) return runtime;
  if (runtime.status === "ready") {
    return { ...runtime, connected: false, reason: "ready-last-observed" };
  }
  return { ...runtime, status: "unknown", connected: false, reason: "observer-stale" };
}

export function workflowSection(chat: TrackedChat, runtime: ChatRuntime | undefined, now = Date.now()): WorkflowSection {
  if (chat.disposition === "archived") return "archive";
  if (chat.disposition === "snoozed" && (chat.snoozedUntil ?? 0) > now) return "later";

  const status = effectiveObservedStatus(chat, runtime);
  if (status === "working") return "working";
  if (status === "ready") return "ready";
  return "unknown";
}

export function isSnoozeExpired(chat: TrackedChat, now = Date.now()): boolean {
  return chat.disposition === "snoozed" && (chat.snoozedUntil ?? 0) <= now;
}

export function normalizeExpiredSnooze(chat: TrackedChat, now = Date.now()): TrackedChat {
  if (!isSnoozeExpired(chat, now)) return chat;
  return { ...chat, disposition: "active", snoozedUntil: undefined, updatedAt: now };
}

export function matchesFilters(chat: TrackedChat, filters: DashboardFilters): boolean {
  const query = filters.query.trim().toLocaleLowerCase();
  if (query && !`${chat.title}\n${chat.note ?? ""}`.toLocaleLowerCase().includes(query)) return false;
  if (filters.platform !== "all" && chat.platform !== filters.platform) return false;
  if (filters.project === "unassigned" && chat.projectKey) return false;
  if (filters.project !== "all" && filters.project !== "unassigned" && chat.projectKey !== filters.project) return false;
  if (filters.flaggedOnly && !chat.flagged) return false;
  if (filters.unreadOnly && !chat.unread) return false;
  return true;
}

export function sortChats(chats: TrackedChat[]): TrackedChat[] {
  return [...chats].sort((a, b) => Number(b.flagged) - Number(a.flagged) || b.updatedAt - a.updatedAt || a.order - b.order);
}

export function snoozeChat(chat: TrackedChat, until: number, now = Date.now()): TrackedChat {
  return { ...chat, disposition: "snoozed", snoozedUntil: until, updatedAt: now };
}

export function archiveChat(chat: TrackedChat, now = Date.now()): TrackedChat {
  return { ...chat, disposition: "archived", snoozedUntil: undefined, archivedAt: now, updatedAt: now };
}

export function restoreChat(chat: TrackedChat, now = Date.now()): TrackedChat {
  return { ...chat, disposition: "active", archivedAt: undefined, updatedAt: now };
}

export function updateExactTitle(chat: TrackedChat, title: string, now = Date.now()): TrackedChat {
  if (!title || chat.title === title) return chat;
  return { ...chat, title, updatedAt: now };
}
