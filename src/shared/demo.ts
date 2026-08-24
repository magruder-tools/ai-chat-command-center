import type { AppSnapshot, ChatRuntime, ProjectRecord, TrackedChat } from "./types";

const now = Date.now();

export const demoProjects: ProjectRecord[] = [
  { key: "g-p-growth", name: "Growth", url: "https://chatgpt.com/g/g-p-growth/project", updatedAt: now },
  { key: "g-p-operations", name: "Operations", url: "https://chatgpt.com/g/g-p-operations/project", updatedAt: now },
  { key: "g-p-research", name: "Research", url: "https://chatgpt.com/g/g-p-research/project", updatedAt: now }
];

export const demoChats: TrackedChat[] = [
  { id: "demo-1", title: "Website Redesign Plan", url: "https://chatgpt.com/c/demo-1", platform: "chatgpt", disposition: "active", projectKey: "g-p-growth", projectName: "Growth", projectUrl: demoProjects[0].url, flagged: true, unread: false, createdAt: now - 8_000_000, updatedAt: now - 240_000, order: 0 },
  { id: "demo-2", title: "Product Launch Strategy", url: "https://claude.ai/chat/demo-2", platform: "claude", disposition: "active", flagged: false, unread: false, createdAt: now - 5_000_000, updatedAt: now - 110_000, order: 1 },
  { id: "demo-3", title: "Market Research Report", url: "https://claude.ai/chat/demo-3", platform: "claude", disposition: "active", note: "Compare the positioning conclusions with the Q4 plan.", flagged: true, unread: true, createdAt: now - 4_000_000, updatedAt: now - 480_000, order: 2 },
  { id: "demo-4", title: "Q4 Budget Planning", url: "https://chatgpt.com/c/demo-4", platform: "chatgpt", disposition: "active", projectKey: "g-p-operations", projectName: "Operations", projectUrl: demoProjects[1].url, flagged: false, unread: true, createdAt: now - 3_000_000, updatedAt: now - 1_440_000, order: 3 },
  { id: "demo-5", title: "Customer Onboarding Revamp", url: "https://claude.ai/chat/demo-5", platform: "claude", disposition: "snoozed", snoozedUntil: now + 7_200_000, flagged: false, unread: false, createdAt: now - 2_000_000, updatedAt: now - 900_000, order: 4 },
  { id: "demo-6", title: "Competitive Analysis", url: "https://chatgpt.com/c/demo-6", platform: "chatgpt", disposition: "active", flagged: false, unread: false, createdAt: now - 6_000_000, updatedAt: now - 3_600_000, order: 5 },
  { id: "demo-7", title: "Archived Planning Thread", url: "https://chatgpt.com/c/demo-7", platform: "chatgpt", disposition: "archived", archivedAt: now - 86_400_000, flagged: false, unread: false, createdAt: now - 9_000_000, updatedAt: now - 86_400_000, order: 6 }
];

const runtime = (chatId: string, status: ChatRuntime["status"], connected = true): ChatRuntime => ({
  chatId,
  tabId: Number(chatId.at(-1)) + 100,
  windowId: 20,
  status,
  connected,
  openOnDevice: true,
  lastSeenAt: now - 90_000
});

export const demoSnapshot: AppSnapshot = {
  chats: demoChats,
  projects: demoProjects,
  runtimes: {
    "demo-1": runtime("demo-1", "working"),
    "demo-2": runtime("demo-2", "working"),
    "demo-3": runtime("demo-3", "ready"),
    "demo-4": { ...runtime("demo-4", "ready", false), reason: "ready-last-observed" },
    "demo-5": runtime("demo-5", "ready"),
    "demo-6": runtime("demo-6", "unknown", false)
  },
  preferences: { observerEnabled: true, hasSeenSafetyNotice: true },
  syncStatus: { state: "ok", updatedAt: now },
  discoveredTabs: [
    { tabId: 501, windowId: 30, title: "Untracked strategy conversation", url: "https://claude.ai/chat/untracked-demo", platform: "claude" }
  ],
  workspaceWindowId: 20,
  dashboardTabId: 21,
  isFullscreen: false
};
