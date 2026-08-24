import type { ChatPlatform, TrackedChat } from "./types";

const PLATFORM_HOSTS: Record<ChatPlatform, string> = {
  chatgpt: "chatgpt.com",
  claude: "claude.ai"
};

const CHAT_KEY = /^[A-Za-z0-9_-]+$/;

export function platformFromUrl(url: string): ChatPlatform | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return undefined;
    return (Object.entries(PLATFORM_HOSTS).find(([, host]) => parsed.hostname === host)?.[0] as ChatPlatform | undefined);
  } catch {
    return undefined;
  }
}

export function isSupportedChatUrl(url: string): boolean {
  return platformFromUrl(url) !== undefined;
}

export function platformLabel(platform: ChatPlatform): string {
  return platform === "chatgpt" ? "ChatGPT" : "Claude";
}

export function newChatUrl(platform: ChatPlatform): string {
  return platform === "chatgpt" ? "https://chatgpt.com/" : "https://claude.ai/new";
}

export function conversationKeyFromUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const platform = platformFromUrl(url);
    if (!platform) return undefined;
    const parts = parsed.pathname.split("/").filter(Boolean);
    const marker = platform === "chatgpt" ? "c" : "chat";
    const conversationIndex = parts.indexOf(marker);
    const key = conversationIndex >= 0 ? parts[conversationIndex + 1] : undefined;
    return key && CHAT_KEY.test(key) ? key : undefined;
  } catch {
    return undefined;
  }
}

export function isSameConversation(firstUrl: string, secondUrl: string): boolean {
  const firstPlatform = platformFromUrl(firstUrl);
  const secondPlatform = platformFromUrl(secondUrl);
  if (!firstPlatform || firstPlatform !== secondPlatform) return false;
  const first = conversationKeyFromUrl(firstUrl);
  const second = conversationKeyFromUrl(secondUrl);
  return Boolean(first && second && first === second);
}

export function normalizeTrackedChat(value: unknown): TrackedChat | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Partial<TrackedChat> & { kind?: "work" | "chat" };
  if (
    typeof input.id !== "string" ||
    typeof input.title !== "string" ||
    typeof input.url !== "string" ||
    !["active", "snoozed", "archived"].includes(input.disposition ?? "")
  ) return undefined;

  const detectedPlatform = platformFromUrl(input.url);
  const platform = input.platform ?? detectedPlatform;
  if (!platform || platform !== detectedPlatform) return undefined;

  return {
    id: input.id,
    title: input.title,
    url: input.url,
    platform,
    disposition: input.disposition as TrackedChat["disposition"],
    projectKey: input.projectKey,
    projectName: input.projectName,
    projectUrl: input.projectUrl,
    note: input.note,
    flagged: input.flagged === true,
    unread: input.unread === true,
    snoozedUntil: input.snoozedUntil,
    archivedAt: input.archivedAt,
    createdAt: typeof input.createdAt === "number" ? input.createdAt : Date.now(),
    updatedAt: typeof input.updatedAt === "number" ? input.updatedAt : Date.now(),
    order: typeof input.order === "number" ? input.order : 0
  };
}
