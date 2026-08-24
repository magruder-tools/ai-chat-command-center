import type { Preferences, ProjectRecord, SyncStatus, TrackedChat } from "../shared/types";
import { normalizeTrackedChat } from "../shared/platforms";

const CHAT_PREFIX = "cc.chat.";
const PROJECTS_KEY = "cc.projects";
const PREFERENCES_KEY = "cc.preferences";
const SCHEMA_KEY = "cc.schemaVersion";
const MIRROR_KEY = "cc.durableMirror";
const SYNC_STATUS_KEY = "cc.syncStatus";

const defaultPreferences: Preferences = {
  observerEnabled: false,
  hasSeenSafetyNotice: false
};

interface DurableMirror {
  chats: TrackedChat[];
  projects: ProjectRecord[];
  preferences: Preferences;
}

export interface LoadedDurableState extends DurableMirror {
  syncStatus: SyncStatus;
}

function normalizedChats(values: unknown[]): TrackedChat[] {
  return values.map(normalizeTrackedChat).filter((chat): chat is TrackedChat => Boolean(chat));
}

function normalizePreferences(value: unknown): Preferences {
  if (!value || typeof value !== "object") return defaultPreferences;
  const input = value as Partial<Preferences>;
  return {
    observerEnabled: input.observerEnabled === true,
    hasSeenSafetyNotice: input.hasSeenSafetyNotice === true
  };
}

async function setSyncStatus(status: SyncStatus): Promise<void> {
  await chrome.storage.local.set({ [SYNC_STATUS_KEY]: status });
}

export async function loadDurableState(): Promise<LoadedDurableState> {
  try {
    const sync = await chrome.storage.sync.get(null);
    const rawChats = Object.entries(sync).filter(([key]) => key.startsWith(CHAT_PREFIX));
    const chats = normalizedChats(rawChats.map(([, value]) => value));
    const projects = Array.isArray(sync[PROJECTS_KEY]) ? (sync[PROJECTS_KEY] as ProjectRecord[]) : [];
    const preferences = normalizePreferences(sync[PREFERENCES_KEY]);
    const state: DurableMirror = { chats, projects, preferences };
    await chrome.storage.local.set({ [MIRROR_KEY]: state });
    const needsMigration = sync[SCHEMA_KEY] !== 2 || rawChats.some(([, value]) => {
      const candidate = value as { platform?: unknown; kind?: unknown } | undefined;
      return !candidate?.platform || candidate.kind !== undefined;
    });
    if (needsMigration) {
      const migrated: Record<string, unknown> = { [SCHEMA_KEY]: 2 };
      for (const chat of chats) migrated[CHAT_PREFIX + chat.id] = chat;
      await chrome.storage.sync.set(migrated);
    }
    const syncStatus: SyncStatus = { state: "ok", updatedAt: Date.now() };
    await setSyncStatus(syncStatus);
    return { ...state, syncStatus };
  } catch (error) {
    const local = await chrome.storage.local.get([MIRROR_KEY, SYNC_STATUS_KEY]);
    const mirror = (local[MIRROR_KEY] ?? {}) as Partial<DurableMirror>;
    const syncStatus: SyncStatus = {
      state: "fallback",
      message: error instanceof Error ? error.message : "Chrome Sync is unavailable; changes are continuing locally.",
      updatedAt: Date.now()
    };
    await setSyncStatus(syncStatus);
    return {
      chats: Array.isArray(mirror.chats) ? normalizedChats(mirror.chats) : [],
      projects: Array.isArray(mirror.projects) ? mirror.projects : [],
      preferences: normalizePreferences(mirror.preferences),
      syncStatus
    };
  }
}

export async function persistChat(chat: TrackedChat, mirror: DurableMirror): Promise<SyncStatus> {
  await chrome.storage.local.set({ [MIRROR_KEY]: mirror });
  try {
    await chrome.storage.sync.set({ [CHAT_PREFIX + chat.id]: chat, [SCHEMA_KEY]: 2 });
    const status: SyncStatus = { state: "ok", updatedAt: Date.now() };
    await setSyncStatus(status);
    return status;
  } catch (error) {
    const status: SyncStatus = {
      state: "fallback",
      message: error instanceof Error ? error.message : "Chrome Sync is unavailable; changes are saved locally.",
      updatedAt: Date.now()
    };
    await setSyncStatus(status);
    return status;
  }
}

export async function persistMetadata(mirror: DurableMirror): Promise<SyncStatus> {
  await chrome.storage.local.set({ [MIRROR_KEY]: mirror });
  try {
    await chrome.storage.sync.set({
      [PROJECTS_KEY]: mirror.projects,
      [PREFERENCES_KEY]: mirror.preferences,
      [SCHEMA_KEY]: 2
    });
    const status: SyncStatus = { state: "ok", updatedAt: Date.now() };
    await setSyncStatus(status);
    return status;
  } catch (error) {
    const status: SyncStatus = {
      state: "fallback",
      message: error instanceof Error ? error.message : "Chrome Sync is unavailable; changes are saved locally.",
      updatedAt: Date.now()
    };
    await setSyncStatus(status);
    return status;
  }
}

export async function replaceDurableState(mirror: DurableMirror): Promise<SyncStatus> {
  await chrome.storage.local.set({ [MIRROR_KEY]: mirror });
  try {
    const current = await chrome.storage.sync.get(null);
    const chatKeys = Object.keys(current).filter((key) => key.startsWith(CHAT_PREFIX));
    if (chatKeys.length) await chrome.storage.sync.remove(chatKeys);
    const payload: Record<string, unknown> = {
      [PROJECTS_KEY]: mirror.projects,
      [PREFERENCES_KEY]: mirror.preferences,
      [SCHEMA_KEY]: 2
    };
    for (const chat of mirror.chats) payload[CHAT_PREFIX + chat.id] = chat;
    await chrome.storage.sync.set(payload);
    const status: SyncStatus = { state: "ok", updatedAt: Date.now() };
    await setSyncStatus(status);
    return status;
  } catch (error) {
    const status: SyncStatus = {
      state: "fallback",
      message: error instanceof Error ? error.message : "Chrome Sync is unavailable; imported data is saved locally.",
      updatedAt: Date.now()
    };
    await setSyncStatus(status);
    return status;
  }
}

export async function clearDurableState(): Promise<void> {
  const sync = await chrome.storage.sync.get(null).catch(() => ({}));
  const keys = Object.keys(sync).filter((key) => key.startsWith("cc."));
  if (keys.length) await chrome.storage.sync.remove(keys).catch(() => undefined);
  await chrome.storage.local.remove([MIRROR_KEY, SYNC_STATUS_KEY]);
}
