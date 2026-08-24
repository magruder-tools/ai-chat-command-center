import { archiveChat, normalizeExpiredSnooze, restoreChat, runtimeWithFreshness, snoozeChat, updateExactTitle } from "../shared/model";
import type { ContentMessage, DashboardRequest, MessageResponse } from "../shared/messages";
import { detectProjectFromUrl, mergeProject, projectForKey } from "../shared/projects";
import {
  conversationKeyFromUrl,
  isSameConversation,
  isSupportedChatUrl,
  newChatUrl,
  normalizeTrackedChat,
  platformFromUrl,
  platformLabel
} from "../shared/platforms";
import type {
  AppSnapshot,
  CandidateTab,
  ChatPlatform,
  ChatRuntime,
  ImportPayload,
  Preferences,
  ProjectRecord,
  SyncStatus,
  TrackedChat
} from "../shared/types";
import {
  clearDurableState,
  loadDurableState,
  persistChat,
  persistMetadata,
  replaceDurableState
} from "./storage";

const DASHBOARD_URL = chrome.runtime.getURL("index.html");
const RUNTIME_KEY = "cc.runtimeState";
const CANDIDATE_KEY = "cc.candidateTab";
const GROUP_TITLE = "Command Center Chats";
const SUPPORTED_TAB_PATTERNS = ["https://chatgpt.com/*", "https://claude.ai/*"];
const OBSERVER_STALE_MS = 90_000;
const RUNTIME_HEARTBEAT_PERSIST_MS = 30_000;
const NOTE_MAX_LENGTH = 4_000;

interface RuntimeStorage {
  workspaceWindowId?: number;
  dashboardTabId?: number;
  managedGroupId?: number;
  lastTrackedChatId?: string;
  runtimes: Record<string, ChatRuntime>;
}

let chats: TrackedChat[] = [];
let projects: ProjectRecord[] = [];
let preferences: Preferences = { observerEnabled: false, hasSeenSafetyNotice: false };
let syncStatus: SyncStatus = { state: "loading" };
let runtimeState: RuntimeStorage = { runtimes: {} };
let candidateTab: CandidateTab | undefined;
let initialization: Promise<void> | undefined;
const observerPorts = new Map<number, chrome.runtime.Port>();

function candidateFromTab(tab: chrome.tabs.Tab): CandidateTab | undefined {
  const platform = platformFromUrl(tab.url ?? "");
  if (tab.id === undefined || tab.windowId === undefined || !platform) return undefined;
  const detected = detectProjectFromUrl(tab.url ?? "");
  return {
    tabId: tab.id,
    windowId: tab.windowId,
    title: tab.title || platformLabel(platform),
    url: tab.url ?? newChatUrl(platform),
    platform,
    detectedProjectKey: detected?.key,
    detectedProjectUrl: detected?.url
  };
}

function mirror() {
  return { chats, projects, preferences };
}

function isDashboardUrl(url?: string): boolean {
  return Boolean(url && url.split("?")[0] === DASHBOARD_URL);
}

function trackedChatForTab(tabId: number): TrackedChat | undefined {
  const runtime = Object.values(runtimeState.runtimes).find((item) => item.tabId === tabId);
  return runtime ? chats.find((chat) => chat.id === runtime.chatId) : undefined;
}

function hasNavigatedAway(chat: TrackedChat, url?: string): boolean {
  if (url && platformFromUrl(url) !== chat.platform) return true;
  const intendedKey = conversationKeyFromUrl(chat.url);
  if (!intendedKey || !url) return false;
  return !isSameConversation(chat.url, url);
}

async function discoverOpenChatTabs(): Promise<CandidateTab[]> {
  const tabs = await chrome.tabs.query({ url: SUPPORTED_TAB_PATTERNS });
  return tabs
    .filter((tab) => tab.id !== undefined && !trackedChatForTab(tab.id))
    .map(candidateFromTab)
    .filter((candidate): candidate is CandidateTab => Boolean(candidate))
    .sort((a, b) => a.title.localeCompare(b.title));
}

async function safeTab(tabId: number | undefined): Promise<chrome.tabs.Tab | undefined> {
  if (tabId === undefined) return undefined;
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    return undefined;
  }
}

async function safeWindow(windowId: number | undefined): Promise<chrome.windows.Window | undefined> {
  if (windowId === undefined) return undefined;
  try {
    return await chrome.windows.get(windowId, { populate: true });
  } catch {
    return undefined;
  }
}

async function persistRuntime(): Promise<void> {
  await chrome.storage.local.set({ [RUNTIME_KEY]: runtimeState });
}

async function broadcastState(): Promise<void> {
  await chrome.runtime.sendMessage({ type: "STATE_UPDATED" }).catch(() => undefined);
}

async function ensureObserverInjected(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  } catch {
    // A loading or closing tab will get another injection attempt from tabs.onUpdated.
  }
}

async function configureObserverForTab(tabId: number): Promise<void> {
  const port = observerPorts.get(tabId);
  if (!port) return;
  const chat = trackedChatForTab(tabId);
  const tab = await safeTab(tabId);
  const enabled = Boolean(
    chat &&
    tab &&
    preferences.observerEnabled &&
    tab.windowId === runtimeState.workspaceWindowId &&
    !hasNavigatedAway(chat, tab.url)
  );
  try {
    port.postMessage({ type: "OBSERVER_CONFIG", enabled });
  } catch {
    if (observerPorts.get(tabId) === port) observerPorts.delete(tabId);
    return;
  }
  if (!chat) return;
  const current = runtimeState.runtimes[chat.id];
  const navigatedAway = hasNavigatedAway(chat, tab?.url);
  runtimeState.runtimes[chat.id] = {
    ...current,
    connected: enabled,
    openOnDevice: Boolean(tab),
    currentUrl: tab?.url,
    status: enabled
      ? current?.status ?? "unknown"
      : !preferences.observerEnabled || navigatedAway ? "unknown" : current?.status ?? "unknown",
    reason: enabled
      ? current?.reason === "observer-stale" ? "waiting-for-observer" : current?.reason ?? "waiting-for-observer"
      : navigatedAway
        ? "navigated-to-different-chat"
        : preferences.observerEnabled
          ? current?.status === "ready" ? "ready-last-observed" : "waiting-for-observer"
          : "observer-off"
  };
  await persistRuntime();
  await broadcastState();
}

async function repairObserverConnections(): Promise<void> {
  if (!preferences.observerEnabled) return;
  const now = Date.now();
  await Promise.all(Object.values(runtimeState.runtimes).map(async (runtime) => {
    if (
      runtime.tabId === undefined ||
      (observerPorts.has(runtime.tabId) && runtime.lastSeenAt && now - runtime.lastSeenAt <= OBSERVER_STALE_MS)
    ) return;
    const tab = await safeTab(runtime.tabId);
    if (!tab || tab.discarded || tab.frozen || !isSupportedChatUrl(tab.url ?? "")) return;
    await ensureObserverInjected(runtime.tabId);
    await configureObserverForTab(runtime.tabId);
  }));
}

async function saveChat(chat: TrackedChat): Promise<void> {
  chats = chats.map((item) => (item.id === chat.id ? chat : item));
  syncStatus = await persistChat(chat, mirror());
  await broadcastState();
}

async function saveMetadata(): Promise<void> {
  syncStatus = await persistMetadata(mirror());
  await broadcastState();
}

async function lockFirstConversationUrl(chat: TrackedChat, observedUrl: string): Promise<TrackedChat> {
  if (
    platformFromUrl(observedUrl) !== chat.platform ||
    conversationKeyFromUrl(chat.url) ||
    !conversationKeyFromUrl(observedUrl)
  ) return chat;
  const detected = chat.platform === "chatgpt" ? detectProjectFromUrl(observedUrl) : undefined;
  const project = projectForKey(projects, detected?.key);
  const next: TrackedChat = {
    ...chat,
    url: observedUrl,
    projectKey: project?.key ?? chat.projectKey,
    projectName: project?.name ?? chat.projectName,
    projectUrl: project?.url ?? chat.projectUrl,
    updatedAt: Date.now()
  };
  await saveChat(next);
  return next;
}

async function reconstructRuntime(): Promise<void> {
  const workspace = await safeWindow(runtimeState.workspaceWindowId);
  if (!workspace) {
    runtimeState.workspaceWindowId = undefined;
    runtimeState.dashboardTabId = undefined;
    runtimeState.managedGroupId = undefined;
  }

  const allTabs = await chrome.tabs.query({});
  const dashboard = allTabs.find((tab) => isDashboardUrl(tab.url));
  if (dashboard?.id !== undefined && dashboard.windowId !== undefined) {
    runtimeState.dashboardTabId = dashboard.id;
    runtimeState.workspaceWindowId = dashboard.windowId;
  }

  const workspaceTabs = runtimeState.workspaceWindowId === undefined
    ? []
    : allTabs.filter((tab) => tab.windowId === runtimeState.workspaceWindowId);

  for (const chat of chats) {
    const existing = runtimeState.runtimes[chat.id];
    let tab = await safeTab(existing?.tabId);
    if (
      !tab ||
      tab.windowId !== runtimeState.workspaceWindowId ||
      platformFromUrl(tab.url ?? "") !== chat.platform
    ) {
      tab = workspaceTabs.find((item) => item.id !== runtimeState.dashboardTabId && item.url === chat.url);
    }
    const navigatedAway = Boolean(tab && hasNavigatedAway(chat, tab.url));
    const restoredStatus = tab && !navigatedAway ? existing?.status ?? "unknown" : "unknown";
    runtimeState.runtimes[chat.id] = {
      chatId: chat.id,
      tabId: tab?.id,
      windowId: tab?.windowId,
      status: restoredStatus,
      connected: false,
      openOnDevice: Boolean(tab),
      reason: tab
        ? navigatedAway
          ? "navigated-to-different-chat"
          : restoredStatus === "ready" ? "ready-last-observed" : "waiting-for-observer"
        : "not-open-on-this-device",
      currentUrl: tab?.url,
      lastSeenAt: existing?.lastSeenAt
    };
    if (tab?.id !== undefined) {
      await chrome.tabs.update(tab.id, { autoDiscardable: restoredStatus !== "working" }).catch(() => undefined);
    }
  }
  await persistRuntime();
}

async function initialize(): Promise<void> {
  const [durable, local] = await Promise.all([
    loadDurableState(),
    chrome.storage.local.get([RUNTIME_KEY, CANDIDATE_KEY])
  ]);
  chats = durable.chats.map((chat) => normalizeExpiredSnooze(chat));
  projects = durable.projects;
  preferences = durable.preferences;
  syncStatus = durable.syncStatus;
  runtimeState = (local[RUNTIME_KEY] as RuntimeStorage | undefined) ?? { runtimes: {} };
  runtimeState.runtimes ??= {};
  const storedCandidate = local[CANDIDATE_KEY] as Partial<CandidateTab> | undefined;
  const storedCandidateTab = await safeTab(storedCandidate?.tabId);
  candidateTab = storedCandidateTab ? candidateFromTab(storedCandidateTab) : undefined;
  if (candidateTab) await chrome.storage.local.set({ [CANDIDATE_KEY]: candidateTab });
  else if (storedCandidate) await chrome.storage.local.remove(CANDIDATE_KEY);
  await reconstructRuntime();
  for (const runtime of Object.values(runtimeState.runtimes)) {
    if (runtime.tabId !== undefined) void ensureObserverInjected(runtime.tabId);
  }
}

function ensureInitialized(): Promise<void> {
  initialization ??= initialize();
  return initialization;
}

async function createWorkspace(): Promise<void> {
  const created = await chrome.windows.create({
    url: DASHBOARD_URL,
    type: "normal",
    state: "maximized",
    focused: true
  });
  if (!created) throw new Error("Chrome could not create the Command Center workspace window.");
  const dashboard = created.tabs?.find((tab) => isDashboardUrl(tab.url)) ?? created.tabs?.[0];
  runtimeState.workspaceWindowId = created.id;
  runtimeState.dashboardTabId = dashboard?.id;
  runtimeState.managedGroupId = undefined;
  await persistRuntime();
}

function groupTabs(tabIds: [number, ...number[]], groupId?: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const options: chrome.tabs.GroupOptions = groupId === undefined
      ? { tabIds, createProperties: { windowId: runtimeState.workspaceWindowId } }
      : { tabIds, groupId };
    chrome.tabs.group(options, (createdGroupId) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(createdGroupId);
    });
  });
}

async function ensureWorkspace(focusDashboard = true): Promise<void> {
  let workspace = await safeWindow(runtimeState.workspaceWindowId);
  let dashboard = await safeTab(runtimeState.dashboardTabId);

  if (!workspace || !dashboard || dashboard.windowId !== workspace.id || !isDashboardUrl(dashboard.url)) {
    const existingTabs = await chrome.tabs.query({ url: `${DASHBOARD_URL}*` });
    dashboard = existingTabs[0];
    if (dashboard?.id !== undefined) {
      workspace = await safeWindow(dashboard.windowId);
      runtimeState.workspaceWindowId = dashboard.windowId;
      runtimeState.dashboardTabId = dashboard.id;
    }
  }

  if (workspace && !dashboard && workspace.id !== undefined) {
    dashboard = await chrome.tabs.create({
      windowId: workspace.id,
      url: DASHBOARD_URL,
      index: 0,
      active: focusDashboard
    });
    runtimeState.dashboardTabId = dashboard.id;
    await persistRuntime();
  }

  if (!workspace) {
    await createWorkspace();
    workspace = await safeWindow(runtimeState.workspaceWindowId);
    dashboard = await safeTab(runtimeState.dashboardTabId);
  }

  if (workspace?.id !== undefined) await chrome.windows.update(workspace.id, { focused: true });
  if (focusDashboard && dashboard?.id !== undefined) await chrome.tabs.update(dashboard.id, { active: true });
  if (focusDashboard) await collapseManagedGroup(true);
}

async function ensureManagedGroup(): Promise<void> {
  if (runtimeState.workspaceWindowId === undefined) return;
  const tabIds: number[] = [];
  for (const chat of chats) {
    if (chat.disposition === "archived") continue;
    const runtime = runtimeState.runtimes[chat.id];
    const tab = await safeTab(runtime?.tabId);
    if (
      tab?.id !== undefined &&
      tab.windowId === runtimeState.workspaceWindowId &&
      platformFromUrl(tab.url ?? "") === chat.platform
    ) {
      tabIds.push(tab.id);
    }
  }
  if (!tabIds.length) return;
  const groupedTabIds = tabIds as [number, ...number[]];

  let groupId = runtimeState.managedGroupId;
  try {
    if (groupId === undefined) throw new Error("missing group");
    await chrome.tabGroups.get(groupId);
    await groupTabs(groupedTabIds, groupId);
  } catch {
    groupId = await groupTabs(groupedTabIds);
    runtimeState.managedGroupId = groupId;
  }
  await chrome.tabGroups.update(groupId, { title: GROUP_TITLE, color: "grey" });
  await persistRuntime();
}

async function collapseManagedGroup(collapsed: boolean): Promise<void> {
  const groupId = runtimeState.managedGroupId;
  if (groupId === undefined) return;
  try {
    await chrome.tabGroups.update(groupId, { collapsed });
  } catch {
    runtimeState.managedGroupId = undefined;
    await persistRuntime();
  }
}

async function captureCandidate(tab?: chrome.tabs.Tab): Promise<void> {
  if (tab?.id === undefined || trackedChatForTab(tab.id)) return;
  candidateTab = candidateFromTab(tab);
  if (!candidateTab) return;
  await chrome.storage.local.set({ [CANDIDATE_KEY]: candidateTab });
}

async function clearCandidate(): Promise<void> {
  candidateTab = undefined;
  await chrome.storage.local.remove(CANDIDATE_KEY);
}

function resolveProject(projectKey: string | undefined, projectName: string | undefined, url: string): ProjectRecord | undefined {
  if (!projectKey) return undefined;
  const existing = projectForKey(projects, projectKey);
  if (existing && !projectName) return existing;
  if (!existing && !projectName?.trim()) return undefined;
  const detected = detectProjectFromUrl(url);
  const record: ProjectRecord = {
    key: projectKey,
    name: projectName?.trim() || existing?.name || "",
    url: detected?.url || existing?.url || url,
    updatedAt: Date.now()
  };
  projects = mergeProject(projects, record);
  return record;
}

async function registerTab(tab: chrome.tabs.Tab, selectedProjectKey?: string, projectName?: string): Promise<TrackedChat> {
  const platform = platformFromUrl(tab.url ?? "");
  if (tab.id === undefined || tab.windowId === undefined || !platform) {
    throw new Error("Only real chatgpt.com or claude.ai tabs can be tracked.");
  }
  const alreadyTracked = trackedChatForTab(tab.id);
  if (alreadyTracked) return alreadyTracked;

  await ensureWorkspace(false);
  if (tab.windowId !== runtimeState.workspaceWindowId) {
    tab = await chrome.tabs.move(tab.id, { windowId: runtimeState.workspaceWindowId, index: -1 });
  }
  if (tab.id === undefined) throw new Error("Chrome did not return the tracked tab ID.");
  const trackedTabId = tab.id;
  const detected = platform === "chatgpt" ? detectProjectFromUrl(tab.url ?? "") : undefined;
  const project = platform === "chatgpt"
    ? resolveProject(selectedProjectKey ?? detected?.key, projectName, tab.url ?? "")
    : undefined;
  const now = Date.now();
  const chat: TrackedChat = {
    id: crypto.randomUUID(),
    title: tab.title || platformLabel(platform),
    url: tab.url ?? newChatUrl(platform),
    platform,
    disposition: "active",
    projectKey: project?.key,
    projectName: project?.name,
    projectUrl: project?.url,
    flagged: false,
    unread: false,
    createdAt: now,
    updatedAt: now,
    order: chats.length
  };
  chats.push(chat);
  runtimeState.runtimes[chat.id] = {
    chatId: chat.id,
    tabId: trackedTabId,
    windowId: runtimeState.workspaceWindowId,
    status: "unknown",
    connected: false,
    openOnDevice: true,
    reason: preferences.observerEnabled ? "waiting-for-observer" : "observer-off",
    currentUrl: tab.url
  };
  await chrome.tabs.update(trackedTabId, { autoDiscardable: true });
  syncStatus = await persistChat(chat, mirror());
  if (project) syncStatus = await persistMetadata(mirror());
  await persistRuntime();
  await ensureManagedGroup();
  await ensureObserverInjected(trackedTabId);
  await configureObserverForTab(trackedTabId);
  await broadcastState();
  return chat;
}

async function openNewChat(platform: ChatPlatform, projectKey?: string): Promise<void> {
  await ensureWorkspace(false);
  const project = platform === "chatgpt" ? projectForKey(projects, projectKey) : undefined;
  const tab = await chrome.tabs.create({
    windowId: runtimeState.workspaceWindowId,
    url: project?.url ?? newChatUrl(platform),
    active: true
  });
  const chat = await registerTab(tab, project?.key);
  runtimeState.lastTrackedChatId = chat.id;
  await persistRuntime();
  await collapseManagedGroup(false);
}

async function ensureChatTab(chat: TrackedChat): Promise<chrome.tabs.Tab> {
  await ensureWorkspace(false);
  const runtime = runtimeState.runtimes[chat.id];
  let tab = await safeTab(runtime?.tabId);
  if (
    !tab ||
    tab.windowId !== runtimeState.workspaceWindowId ||
    platformFromUrl(tab.url ?? "") !== chat.platform
  ) {
    tab = await chrome.tabs.create({ windowId: runtimeState.workspaceWindowId, url: chat.url, active: false });
    runtimeState.runtimes[chat.id] = {
      chatId: chat.id,
      tabId: tab.id,
      windowId: runtimeState.workspaceWindowId,
      status: "unknown",
      connected: false,
      openOnDevice: true,
      reason: preferences.observerEnabled ? "waiting-for-observer" : "observer-off",
      currentUrl: tab.url
    };
    if (tab.id !== undefined) await chrome.tabs.update(tab.id, { autoDiscardable: true });
    await persistRuntime();
    await ensureManagedGroup();
    if (tab.id !== undefined) await ensureObserverInjected(tab.id);
  }
  return tab;
}

async function openChat(chatId: string): Promise<void> {
  const chat = chats.find((item) => item.id === chatId);
  if (!chat || chat.disposition === "archived") throw new Error("That chat is archived.");
  let tab = await ensureChatTab(chat);
  if (tab.id !== undefined && hasNavigatedAway(chat, tab.url)) {
    const updated = await chrome.tabs.update(tab.id, { url: chat.url, active: true });
    if (updated) tab = updated;
    runtimeState.runtimes[chat.id] = {
      ...runtimeState.runtimes[chat.id],
      currentUrl: chat.url,
      status: "unknown",
      connected: false,
      reason: "returning-to-tracked-chat"
    };
    await persistRuntime();
  }
  if (chat.unread) await saveChat({ ...chat, unread: false, updatedAt: Date.now() });
  await collapseManagedGroup(false);
  if (tab.id !== undefined) await chrome.tabs.update(tab.id, { active: true });
  if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
  if (tab.id !== undefined) {
    await ensureObserverInjected(tab.id);
    await configureObserverForTab(tab.id);
  }
  runtimeState.lastTrackedChatId = chatId;
  await persistRuntime();
}

async function returnToTrackedChat(chatId: string): Promise<void> {
  const chat = chats.find((item) => item.id === chatId);
  if (!chat || chat.disposition === "archived") throw new Error("That chat is archived.");
  const tab = await ensureChatTab(chat);
  if (tab.id === undefined) throw new Error("That chat tab is unavailable.");
  await chrome.tabs.update(tab.id, { url: chat.url, active: true });
  if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
  runtimeState.runtimes[chat.id] = {
    ...runtimeState.runtimes[chat.id],
    currentUrl: chat.url,
    status: "unknown",
    connected: false,
    reason: "returning-to-tracked-chat"
  };
  runtimeState.lastTrackedChatId = chatId;
  await persistRuntime();
  await broadcastState();
}

async function reopenAllTrackedChats(): Promise<void> {
  const activeChats = chats.filter((chat) => chat.disposition !== "archived");
  for (const chat of activeChats) await ensureChatTab(chat);
  await ensureManagedGroup();
  await ensureWorkspace(true);
  await broadcastState();
}

async function registerProject(name: string, url: string): Promise<void> {
  const cleanName = name.trim();
  const detected = detectProjectFromUrl(url.trim());
  if (!cleanName) throw new Error("Enter a project name.");
  if (!detected) throw new Error("Use a native ChatGPT Project URL containing its g-p project ID.");
  projects = mergeProject(projects, {
    key: detected.key,
    name: cleanName,
    url: detected.url,
    updatedAt: Date.now()
  });
  await saveMetadata();
}

async function archiveTrackedChat(chatId: string): Promise<void> {
  const chat = chats.find((item) => item.id === chatId);
  if (!chat) throw new Error("Chat not found.");
  const tabId = runtimeState.runtimes[chatId]?.tabId;
  delete runtimeState.runtimes[chatId];
  observerPorts.delete(tabId ?? -1);
  await persistRuntime();
  await saveChat(archiveChat(chat));
  if (await safeTab(tabId)) await chrome.tabs.remove(tabId as number);
  await ensureManagedGroup();
}

async function restoreTrackedChat(chatId: string): Promise<void> {
  const chat = chats.find((item) => item.id === chatId);
  if (!chat) throw new Error("Chat not found.");
  const restored = restoreChat(chat);
  await saveChat(restored);
  await ensureChatTab(restored);
  await ensureWorkspace(true);
}

async function setChatFields(chatId: string, patch: Extract<DashboardRequest, { type: "SET_CHAT_FIELDS" }>["patch"]): Promise<void> {
  const chat = chats.find((item) => item.id === chatId);
  if (!chat) throw new Error("Chat not found.");
  let project: ProjectRecord | undefined;
  if (patch.projectKey) project = resolveProject(patch.projectKey, patch.projectName, patch.projectUrl || chat.url);
  if (patch.note !== undefined && patch.note.length > NOTE_MAX_LENGTH) {
    throw new Error(`Notes are limited to ${NOTE_MAX_LENGTH.toLocaleString()} characters.`);
  }
  const next: TrackedChat = {
    ...chat,
    ...patch,
    projectKey: patch.projectKey === "" ? undefined : project?.key ?? patch.projectKey ?? chat.projectKey,
    projectName: patch.projectKey === "" ? undefined : project?.name ?? patch.projectName ?? chat.projectName,
    projectUrl: patch.projectKey === "" ? undefined : project?.url ?? patch.projectUrl ?? chat.projectUrl,
    updatedAt: Date.now()
  };
  await saveChat(next);
  if (project) await saveMetadata();
}

async function setObserverEnabled(enabled: boolean): Promise<void> {
  preferences = { ...preferences, observerEnabled: enabled, hasSeenSafetyNotice: true };
  await saveMetadata();
  if (!enabled) {
    runtimeState.runtimes = Object.fromEntries(Object.entries(runtimeState.runtimes).map(([chatId, runtime]) => [
      chatId,
      { ...runtime, status: "unknown", connected: false, reason: "observer-off" } satisfies ChatRuntime
    ]));
    await persistRuntime();
  }
  for (const tabId of observerPorts.keys()) await configureObserverForTab(tabId);
  if (enabled) await repairObserverConnections();
  await broadcastState();
}

async function getSnapshot(): Promise<AppSnapshot> {
  const workspace = await safeWindow(runtimeState.workspaceWindowId);
  const now = Date.now();
  const runtimes = Object.fromEntries(Object.entries(runtimeState.runtimes).map(([chatId, runtime]) => [
    chatId,
    preferences.observerEnabled ? runtimeWithFreshness(runtime, now, OBSERVER_STALE_MS) : runtime
  ]));
  return {
    chats,
    projects,
    runtimes,
    preferences,
    syncStatus,
    candidateTab,
    discoveredTabs: await discoverOpenChatTabs(),
    workspaceWindowId: runtimeState.workspaceWindowId,
    dashboardTabId: runtimeState.dashboardTabId,
    isFullscreen: workspace?.state === "fullscreen"
  };
}

function validateImport(payload: ImportPayload): TrackedChat[] {
  if (!payload || ![1, 2].includes(payload.schemaVersion) || !Array.isArray(payload.chats) || !Array.isArray(payload.projects)) {
    throw new Error("This is not a valid Command Center metadata export.");
  }
  const normalizedChats = payload.chats.map(normalizeTrackedChat);
  for (const [index, chat] of normalizedChats.entries()) {
    if (
      !chat ||
      (chat.note !== undefined && (typeof chat.note !== "string" || chat.note.length > NOTE_MAX_LENGTH)) ||
      (chat.platform === "claude" && (chat.projectKey || chat.projectName || chat.projectUrl))
    ) {
      throw new Error(`The import contains an invalid chat record at position ${index + 1}.`);
    }
  }
  const chats = normalizedChats as TrackedChat[];
  if (new Set(chats.map((chat) => chat.id)).size !== chats.length) {
    throw new Error("The import contains duplicate chat IDs.");
  }
  for (const project of payload.projects) {
    const detected = detectProjectFromUrl(project.url);
    if (!project.key || !project.name?.trim() || !detected || detected.key !== project.key) {
      throw new Error("The import contains an invalid native Project record.");
    }
  }
  return chats;
}

async function importData(payload: ImportPayload): Promise<void> {
  chats = validateImport(payload);
  projects = payload.projects;
  preferences = {
    observerEnabled: payload.preferences?.observerEnabled === true,
    hasSeenSafetyNotice: payload.preferences?.hasSeenSafetyNotice === true
  };
  runtimeState.runtimes = Object.fromEntries(chats.map((chat) => [chat.id, {
    chatId: chat.id,
    status: "unknown",
    connected: false,
    openOnDevice: false,
    reason: "not-open-on-this-device"
  } satisfies ChatRuntime]));
  syncStatus = await replaceDurableState(mirror());
  await persistRuntime();
  await broadcastState();
}

async function clearAppData(): Promise<void> {
  const tabIds = Object.values(runtimeState.runtimes).map((item) => item.tabId).filter((id): id is number => id !== undefined);
  chats = [];
  projects = [];
  preferences = { observerEnabled: false, hasSeenSafetyNotice: false };
  runtimeState.runtimes = {};
  runtimeState.managedGroupId = undefined;
  candidateTab = undefined;
  await clearDurableState();
  await chrome.storage.local.remove(CANDIDATE_KEY);
  await persistRuntime();
  const liveIds: number[] = [];
  for (const id of tabIds) if (await safeTab(id)) liveIds.push(id);
  if (liveIds.length) await chrome.tabs.remove(liveIds);
  syncStatus = { state: "ok", updatedAt: Date.now() };
  await broadcastState();
}

async function handleDashboardRequest(request: DashboardRequest): Promise<unknown> {
  switch (request.type) {
    case "GET_STATE":
      return getSnapshot();
    case "NEW_CHAT":
      return openNewChat(request.platform, request.projectKey);
    case "TRACK_CANDIDATE": {
      if (!candidateTab) throw new Error("No untracked supported chat tab is waiting to be added.");
      const tab = await safeTab(candidateTab.tabId);
      if (!tab || !isSupportedChatUrl(tab.url ?? "")) throw new Error("That chat tab is no longer available.");
      const chat = await registerTab(tab, request.projectKey ?? candidateTab.detectedProjectKey, request.projectName);
      await clearCandidate();
      await ensureWorkspace(true);
      return chat;
    }
    case "TRACK_TAB": {
      const tab = await safeTab(request.tabId);
      if (!tab || !isSupportedChatUrl(tab.url ?? "")) throw new Error("That chat tab is no longer available.");
      const chat = await registerTab(tab, request.projectKey, request.projectName);
      if (candidateTab?.tabId === request.tabId) await clearCandidate();
      await ensureWorkspace(true);
      return chat;
    }
    case "DISMISS_CANDIDATE":
      return clearCandidate();
    case "OPEN_CHAT":
    case "REOPEN_CHAT":
      return openChat(request.chatId);
    case "SET_CHAT_FIELDS":
      return setChatFields(request.chatId, request.patch);
    case "RETURN_TO_TRACKED_CHAT":
      return returnToTrackedChat(request.chatId);
    case "REOPEN_ALL":
      return reopenAllTrackedChats();
    case "REGISTER_PROJECT":
      return registerProject(request.name, request.url);
    case "SNOOZE_CHAT": {
      const chat = chats.find((item) => item.id === request.chatId);
      if (!chat) throw new Error("Chat not found.");
      return saveChat(snoozeChat(chat, request.until));
    }
    case "ARCHIVE_CHAT":
      return archiveTrackedChat(request.chatId);
    case "RESTORE_CHAT":
      return restoreTrackedChat(request.chatId);
    case "SET_OBSERVER_ENABLED":
      return setObserverEnabled(request.enabled);
    case "SET_FULLSCREEN":
      await ensureWorkspace(false);
      if (runtimeState.workspaceWindowId !== undefined) {
        await chrome.windows.update(runtimeState.workspaceWindowId, { state: request.enabled ? "fullscreen" : "maximized" });
      }
      return undefined;
    case "EXPORT_DATA":
      return {
        schemaVersion: 2,
        exportedAt: new Date().toISOString(),
        chats,
        projects,
        preferences
      } satisfies ImportPayload;
    case "IMPORT_DATA":
      return importData(request.payload);
    case "CLEAR_APP_DATA":
      return clearAppData();
  }
}

async function toggleDashboardAndChat(): Promise<void> {
  await ensureWorkspace(false);
  const [active] = await chrome.tabs.query({ active: true, windowId: runtimeState.workspaceWindowId });
  if (active?.id === runtimeState.dashboardTabId && runtimeState.lastTrackedChatId) {
    const last = chats.find((chat) => chat.id === runtimeState.lastTrackedChatId && chat.disposition !== "archived");
    if (last) return openChat(last.id);
  }
  if (runtimeState.dashboardTabId !== undefined) await chrome.tabs.update(runtimeState.dashboardTabId, { active: true });
  if (runtimeState.workspaceWindowId !== undefined) await chrome.windows.update(runtimeState.workspaceWindowId, { focused: true });
  await collapseManagedGroup(true);
}

chrome.action.onClicked.addListener((tab) => {
  void (async () => {
    await ensureInitialized();
    await captureCandidate(tab);
    await ensureWorkspace(true);
    await broadcastState();
  })();
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-command-center") void ensureInitialized().then(toggleDashboardAndChat);
});

chrome.runtime.onMessage.addListener((request: DashboardRequest, _sender, sendResponse) => {
  void (async () => {
    try {
      await ensureInitialized();
      const data = await handleDashboardRequest(request);
      sendResponse({ ok: true, data } satisfies MessageResponse);
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : "Unexpected extension error." } satisfies MessageResponse);
    }
  })();
  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "status-observer-v3" || port.sender?.tab?.id === undefined) return;
  const tabId = port.sender.tab.id;
  observerPorts.set(tabId, port);
  void (async () => {
    await ensureInitialized();
    await configureObserverForTab(tabId);
  })();

  port.onMessage.addListener((value: unknown) => {
    void (async () => {
      await ensureInitialized();
      const message = value as Partial<ContentMessage>;
      if (
        message.type !== "OBSERVER_STATUS" ||
        message.observerVersion !== 3 ||
        !["working", "ready", "unknown"].includes(message.status ?? "") ||
        typeof message.reason !== "string" ||
        message.reason.length > 120 ||
        typeof message.url !== "string" ||
        !isSupportedChatUrl(message.url)
      ) return;
      let chat = trackedChatForTab(tabId);
      if (!chat || !preferences.observerEnabled) return;
      if (platformFromUrl(message.url) !== chat.platform) return;
      chat = await lockFirstConversationUrl(chat, message.url);
      const previous = runtimeState.runtimes[chat.id];
      if (hasNavigatedAway(chat, message.url)) {
        runtimeState.runtimes[chat.id] = {
          ...previous,
          status: "unknown",
          connected: false,
          openOnDevice: true,
          reason: "navigated-to-different-chat",
          currentUrl: message.url,
          lastSeenAt: Date.now()
        };
        try {
          port.postMessage({ type: "OBSERVER_CONFIG", enabled: false });
        } catch {
          // The disconnect handler will finalize recovery state.
        }
        await persistRuntime();
        await broadcastState();
        return;
      }
      const now = Date.now();
      const statusChanged = previous?.status !== message.status ||
        previous?.reason !== message.reason ||
        previous?.connected !== true ||
        previous?.currentUrl !== message.url;
      runtimeState.runtimes[chat.id] = {
        ...previous,
        tabId,
        windowId: port.sender?.tab?.windowId,
        status: message.status as ChatRuntime["status"],
        connected: true,
        openOnDevice: true,
        reason: message.reason,
        currentUrl: message.url,
        lastSeenAt: now
      };
      void chrome.tabs.update(tabId, { autoDiscardable: message.status !== "working" }).catch(() => undefined);
      if (previous?.status === "working" && message.status === "ready" && !chat.unread) {
        await persistRuntime();
        await saveChat({ ...chat, unread: true, updatedAt: Date.now() });
      } else if (statusChanged) {
        await persistRuntime();
        await broadcastState();
      } else if (!previous?.lastSeenAt || now - previous.lastSeenAt >= RUNTIME_HEARTBEAT_PERSIST_MS) {
        await persistRuntime();
      }
    })();
  });

  port.onDisconnect.addListener(() => {
    if (observerPorts.get(tabId) === port) observerPorts.delete(tabId);
    void (async () => {
      await ensureInitialized();
      if (observerPorts.has(tabId)) return;
      const chat = trackedChatForTab(tabId);
      if (!chat) return;
      const previous = runtimeState.runtimes[chat.id];
      runtimeState.runtimes[chat.id] = {
        ...previous,
        status: previous?.status ?? "unknown",
        connected: false,
        openOnDevice: Boolean(await safeTab(tabId)),
        reason: previous?.status === "ready" ? "ready-last-observed" : "observer-disconnected"
      };
      await persistRuntime();
      await broadcastState();
    })();
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  void (async () => {
    await ensureInitialized();
    const chat = trackedChatForTab(tabId);
    if (!chat) return;
    let next = chat;
    const currentUrl = tab.url ?? changeInfo.url;
    if (changeInfo.url) {
      if (platformFromUrl(changeInfo.url) === next.platform) {
        if (!conversationKeyFromUrl(next.url) && conversationKeyFromUrl(changeInfo.url)) {
          next = { ...next, url: changeInfo.url, updatedAt: Date.now() };
        }
        const detected = next.platform === "chatgpt" ? detectProjectFromUrl(changeInfo.url) : undefined;
        const project = projectForKey(projects, detected?.key);
        if (detected && project) {
          next = { ...next, projectKey: project.key, projectName: project.name, projectUrl: project.url };
        }
        runtimeState.runtimes[chat.id] = {
          ...runtimeState.runtimes[chat.id],
          currentUrl: changeInfo.url,
          status: hasNavigatedAway(next, changeInfo.url) ? "unknown" : runtimeState.runtimes[chat.id]?.status ?? "unknown",
          connected: hasNavigatedAway(next, changeInfo.url) ? false : runtimeState.runtimes[chat.id]?.connected ?? false,
          reason: hasNavigatedAway(next, changeInfo.url)
            ? "navigated-to-different-chat"
            : runtimeState.runtimes[chat.id]?.reason ?? "waiting-for-observer"
        };
        await persistRuntime();
      } else {
        runtimeState.runtimes[chat.id] = {
          ...runtimeState.runtimes[chat.id],
          status: "unknown",
          connected: false,
          reason: "navigated-away-from-platform"
        };
        await persistRuntime();
      }
    }
    if (changeInfo.title && !hasNavigatedAway(next, currentUrl)) next = updateExactTitle(next, changeInfo.title);
    if (tab.discarded || tab.frozen) {
      const previous = runtimeState.runtimes[chat.id];
      runtimeState.runtimes[chat.id] = {
        ...previous,
        status: previous?.status ?? "unknown",
        connected: false,
        reason: tab.discarded ? "tab-discarded" : "tab-frozen"
      };
      await persistRuntime();
    }
    if (next !== chat) await saveChat(next);
    else await broadcastState();
    if (isSupportedChatUrl(currentUrl ?? "")) {
      if (changeInfo.status === "complete" || changeInfo.url) await ensureObserverInjected(tabId);
      await configureObserverForTab(tabId);
    }
  })();
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  void (async () => {
    await ensureInitialized();
    if (activeInfo.windowId !== runtimeState.workspaceWindowId) return;
    if (activeInfo.tabId === runtimeState.dashboardTabId) {
      await collapseManagedGroup(true);
      await repairObserverConnections();
      return;
    }
    const chat = trackedChatForTab(activeInfo.tabId);
    if (chat) {
      runtimeState.lastTrackedChatId = chat.id;
      await persistRuntime();
      await collapseManagedGroup(false);
      await ensureObserverInjected(activeInfo.tabId);
      await configureObserverForTab(activeInfo.tabId);
    }
  })();
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  void (async () => {
    await ensureInitialized();
    if (tabId === runtimeState.dashboardTabId) {
      runtimeState.dashboardTabId = undefined;
      if (removeInfo.isWindowClosing) runtimeState.workspaceWindowId = undefined;
    }
    const chat = trackedChatForTab(tabId);
    if (chat) {
      runtimeState.runtimes[chat.id] = {
        chatId: chat.id,
        status: "unknown",
        connected: false,
        openOnDevice: false,
        reason: "tab-closed"
      };
    }
    if (candidateTab?.tabId === tabId) await clearCandidate();
    await persistRuntime();
    await broadcastState();
  })();
});

chrome.tabs.onAttached.addListener((tabId, attachInfo) => {
  void (async () => {
    await ensureInitialized();
    const chat = trackedChatForTab(tabId);
    if (!chat || runtimeState.workspaceWindowId === undefined || attachInfo.newWindowId === runtimeState.workspaceWindowId) return;
    await chrome.tabs.move(tabId, { windowId: runtimeState.workspaceWindowId, index: -1 });
    runtimeState.runtimes[chat.id] = { ...runtimeState.runtimes[chat.id], windowId: runtimeState.workspaceWindowId };
    await persistRuntime();
    await ensureManagedGroup();
  })();
});

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId !== runtimeState.workspaceWindowId) return;
  runtimeState.workspaceWindowId = undefined;
  runtimeState.dashboardTabId = undefined;
  runtimeState.managedGroupId = undefined;
  for (const chat of chats) {
    if (chat.disposition === "archived") continue;
    runtimeState.runtimes[chat.id] = {
      chatId: chat.id,
      status: "unknown",
      connected: false,
      openOnDevice: false,
      reason: "workspace-window-closed"
    };
  }
  void persistRuntime().then(broadcastState);
});

chrome.runtime.onInstalled.addListener(() => {
  void ensureInitialized().then(() => ensureWorkspace(true));
});

chrome.runtime.onStartup.addListener(() => {
  void ensureInitialized();
});

let syncReloadInProgress = false;
let syncReloadQueued = false;

async function reloadDurableFromSync(): Promise<void> {
  if (syncReloadInProgress) {
    syncReloadQueued = true;
    return;
  }
  syncReloadInProgress = true;
  try {
    do {
      syncReloadQueued = false;
      const durable = await loadDurableState();
      chats = durable.chats.map((chat) => normalizeExpiredSnooze(chat));
      projects = durable.projects;
      preferences = durable.preferences;
      syncStatus = durable.syncStatus;
      const liveIds = new Set(chats.map((chat) => chat.id));
      for (const id of Object.keys(runtimeState.runtimes)) {
        if (!liveIds.has(id)) delete runtimeState.runtimes[id];
      }
      for (const chat of chats) {
        runtimeState.runtimes[chat.id] ??= {
          chatId: chat.id,
          status: "unknown",
          connected: false,
          openOnDevice: false,
          reason: "not-open-on-this-device"
        };
      }
      await persistRuntime();
      await broadcastState();
    } while (syncReloadQueued);
  } finally {
    syncReloadInProgress = false;
  }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync" || !Object.keys(changes).some((key) => key.startsWith("cc."))) return;
  void ensureInitialized().then(reloadDurableFromSync);
});
