import { describe, expect, it } from "vitest";
import {
  conversationKeyFromUrl,
  isSameConversation,
  isSupportedChatUrl,
  normalizeTrackedChat,
  platformFromUrl
} from "../src/shared/platforms";

describe("supported chat platforms", () => {
  it("accepts only exact HTTPS ChatGPT and Claude hosts", () => {
    expect(platformFromUrl("https://chatgpt.com/c/one")).toBe("chatgpt");
    expect(platformFromUrl("https://claude.ai/chat/two")).toBe("claude");
    expect(isSupportedChatUrl("https://claude.ai.evil.example/chat/two")).toBe(false);
    expect(isSupportedChatUrl("http://claude.ai/chat/two")).toBe(false);
  });

  it("uses platform-scoped conversation identity", () => {
    expect(conversationKeyFromUrl("https://chatgpt.com/g/g-p-project/c/conversation-id")).toBe("conversation-id");
    expect(conversationKeyFromUrl("https://claude.ai/chat/conversation-id")).toBe("conversation-id");
    expect(isSameConversation("https://chatgpt.com/c/one", "https://chatgpt.com/g/g-p-project/c/one?model=auto")).toBe(true);
    expect(isSameConversation("https://chatgpt.com/c/one", "https://claude.ai/chat/one")).toBe(false);
  });

  it("migrates legacy Work and Chat records to ChatGPT without retaining kind", () => {
    const migrated = normalizeTrackedChat({
      id: "legacy",
      title: "Legacy chat",
      url: "https://chatgpt.com/c/legacy",
      kind: "work",
      disposition: "active",
      flagged: false,
      unread: false,
      createdAt: 1,
      updatedAt: 1,
      order: 0
    });
    expect(migrated).toMatchObject({ platform: "chatgpt" });
    expect(migrated).not.toHaveProperty("kind");
  });
});
