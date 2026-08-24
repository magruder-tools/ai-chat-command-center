import type { ChatPlatform, ImportPayload, TrackedChat } from "./types";

export type DashboardRequest =
  | { type: "GET_STATE" }
  | { type: "NEW_CHAT"; platform: ChatPlatform; projectKey?: string }
  | { type: "TRACK_CANDIDATE"; projectKey?: string; projectName?: string }
  | { type: "TRACK_TAB"; tabId: number; projectKey?: string; projectName?: string }
  | { type: "DISMISS_CANDIDATE" }
  | { type: "OPEN_CHAT"; chatId: string }
  | { type: "REOPEN_CHAT"; chatId: string }
  | { type: "SET_CHAT_FIELDS"; chatId: string; patch: Pick<Partial<TrackedChat>, "flagged" | "unread" | "projectKey" | "projectName" | "projectUrl" | "note"> }
  | { type: "RETURN_TO_TRACKED_CHAT"; chatId: string }
  | { type: "REOPEN_ALL" }
  | { type: "REGISTER_PROJECT"; name: string; url: string }
  | { type: "SNOOZE_CHAT"; chatId: string; until: number }
  | { type: "ARCHIVE_CHAT"; chatId: string }
  | { type: "RESTORE_CHAT"; chatId: string }
  | { type: "SET_OBSERVER_ENABLED"; enabled: boolean }
  | { type: "SET_FULLSCREEN"; enabled: boolean }
  | { type: "EXPORT_DATA" }
  | { type: "IMPORT_DATA"; payload: ImportPayload }
  | { type: "CLEAR_APP_DATA" };

export type ContentMessage = {
  type: "OBSERVER_STATUS";
  status: "working" | "ready" | "unknown";
  reason: string;
  url: string;
  observerVersion: 3;
};

export type BackgroundEvent =
  | { type: "STATE_UPDATED" }
  | { type: "OBSERVER_CONFIG"; enabled: boolean };

export interface MessageResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}
