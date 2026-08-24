export type ChatPlatform = "chatgpt" | "claude";
export type ObservedStatus = "working" | "ready" | "unknown";
export type UserDisposition = "active" | "snoozed" | "archived";
export type WorkflowSection = "working" | "ready" | "later" | "unknown" | "archive";

export interface ProjectRecord {
  key: string;
  name: string;
  url: string;
  updatedAt: number;
}

export interface TrackedChat {
  id: string;
  title: string;
  url: string;
  platform: ChatPlatform;
  disposition: UserDisposition;
  projectKey?: string;
  projectName?: string;
  projectUrl?: string;
  note?: string;
  flagged: boolean;
  unread: boolean;
  snoozedUntil?: number;
  archivedAt?: number;
  createdAt: number;
  updatedAt: number;
  order: number;
}

export interface ChatRuntime {
  chatId: string;
  tabId?: number;
  windowId?: number;
  status: ObservedStatus;
  connected: boolean;
  openOnDevice: boolean;
  reason?: string;
  lastSeenAt?: number;
  currentUrl?: string;
}

export interface Preferences {
  observerEnabled: boolean;
  hasSeenSafetyNotice: boolean;
}

export interface SyncStatus {
  state: "ok" | "fallback" | "loading";
  message?: string;
  updatedAt?: number;
}

export interface CandidateTab {
  tabId: number;
  windowId: number;
  title: string;
  url: string;
  platform: ChatPlatform;
  detectedProjectKey?: string;
  detectedProjectUrl?: string;
}

export interface AppSnapshot {
  chats: TrackedChat[];
  projects: ProjectRecord[];
  runtimes: Record<string, ChatRuntime>;
  preferences: Preferences;
  syncStatus: SyncStatus;
  candidateTab?: CandidateTab;
  discoveredTabs: CandidateTab[];
  workspaceWindowId?: number;
  dashboardTabId?: number;
  isFullscreen: boolean;
}

export interface DashboardFilters {
  query: string;
  platform: "all" | ChatPlatform;
  project: "all" | "unassigned" | string;
  flaggedOnly: boolean;
  unreadOnly: boolean;
}

export interface ImportPayload {
  schemaVersion: 1 | 2;
  exportedAt: string;
  chats: Array<TrackedChat | (Omit<TrackedChat, "platform"> & {
    platform?: ChatPlatform;
    kind?: "work" | "chat";
  })>;
  projects: ProjectRecord[];
  preferences: Preferences;
}
