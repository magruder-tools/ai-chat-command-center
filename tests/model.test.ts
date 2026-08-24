import { describe, expect, it } from "vitest";
import { archiveChat, matchesFilters, normalizeExpiredSnooze, restoreChat, runtimeWithFreshness, snoozeChat, updateExactTitle, workflowSection } from "../src/shared/model";
import type { ChatRuntime, DashboardFilters, TrackedChat } from "../src/shared/types";

const baseChat: TrackedChat = {
  id: "chat-1",
  title: "Current Chrome Tab Title",
  url: "https://chatgpt.com/c/example",
  platform: "chatgpt",
  disposition: "active",
  flagged: false,
  unread: false,
  createdAt: 10,
  updatedAt: 10,
  order: 0
};

const runtime = (status: ChatRuntime["status"], connected = true): ChatRuntime => ({
  chatId: baseChat.id,
  status,
  connected,
  openOnDevice: true
});

describe("workflow lifecycle", () => {
  it("maps active observed status into Working, Ready, or Unknown", () => {
    expect(workflowSection(baseChat, runtime("working"))).toBe("working");
    expect(workflowSection(baseChat, runtime("ready"))).toBe("ready");
    expect(workflowSection(baseChat, runtime("unknown"))).toBe("unknown");
  });

  it("keeps last-observed Ready sticky while rejecting disconnected Working and closed tabs", () => {
    expect(workflowSection(baseChat, runtime("ready", false))).toBe("ready");
    expect(workflowSection(baseChat, runtime("working", false))).toBe("unknown");
    expect(workflowSection(baseChat, { ...runtime("ready", false), openOnDevice: false })).toBe("unknown");
    expect(workflowSection(baseChat, undefined)).toBe("unknown");
  });

  it("allows a one-minute throttled heartbeat without making Working stale", () => {
    const observed = { ...runtime("working"), lastSeenAt: 1_000 };
    expect(runtimeWithFreshness(observed, 61_000, 90_000)).toBe(observed);
    expect(workflowSection(baseChat, runtimeWithFreshness(observed, 61_000, 90_000))).toBe("working");
  });

  it("keeps stale Ready in Ready but sends stale Working to recovery", () => {
    const staleReady = runtimeWithFreshness({ ...runtime("ready"), lastSeenAt: 1_000 }, 92_000, 90_000);
    expect(staleReady).toMatchObject({ status: "ready", connected: false, reason: "ready-last-observed" });
    expect(workflowSection(baseChat, staleReady)).toBe("ready");

    const staleWorking = runtimeWithFreshness({ ...runtime("working"), lastSeenAt: 1_000 }, 92_000, 90_000);
    expect(staleWorking).toMatchObject({ status: "unknown", connected: false, reason: "observer-stale" });
    expect(workflowSection(baseChat, staleWorking)).toBe("unknown");
  });

  it("keeps Snoozed chats in Later while status changes underneath", () => {
    const snoozed = snoozeChat(baseChat, 2_000, 1_000);
    expect(workflowSection(snoozed, runtime("working"), 1_500)).toBe("later");
    expect(workflowSection(snoozed, runtime("ready"), 1_500)).toBe("later");
    expect(workflowSection(normalizeExpiredSnooze(snoozed, 2_001), runtime("ready"), 2_001)).toBe("ready");
  });

  it("only Archive removes a record from active sections and Restore reactivates it", () => {
    const archived = archiveChat(baseChat, 200);
    expect(workflowSection(archived, runtime("working"), 200)).toBe("archive");
    expect(workflowSection(restoreChat(archived, 300), runtime("ready"), 300)).toBe("ready");
  });

  it("stores the exact latest Chrome tab title without a competing rename", () => {
    const updated = updateExactTitle(baseChat, "A Different Exact Tab Title", 500);
    expect(updated.title).toBe("A Different Exact Tab Title");
    expect(updateExactTitle(updated, "A Different Exact Tab Title", 600)).toBe(updated);
  });
});

describe("combined filters", () => {
  const filters: DashboardFilters = { query: "chrome", platform: "chatgpt", project: "project-a", flaggedOnly: true, unreadOnly: true };
  it("combines title, platform, project, flag, and unread filters", () => {
    const chat = { ...baseChat, projectKey: "project-a", flagged: true, unread: true };
    expect(matchesFilters(chat, filters)).toBe(true);
    expect(matchesFilters({ ...chat, platform: "claude" }, filters)).toBe(false);
    expect(matchesFilters({ ...chat, projectKey: undefined }, filters)).toBe(false);
  });

  it("supports No project as a first-class project filter", () => {
    expect(matchesFilters(baseChat, { ...filters, query: "", platform: "all", project: "unassigned", flaggedOnly: false, unreadOnly: false })).toBe(true);
  });

  it("searches notes as well as exact Chrome titles", () => {
    expect(matchesFilters(
      { ...baseChat, note: "Follow up after the board meeting" },
      { ...filters, query: "board meeting", platform: "all", project: "all", flaggedOnly: false, unreadOnly: false }
    )).toBe(true);
  });
});
